// 按 network 维护一个串行队列 + 最小间隔，避开 TronGrid 公共 RPC 3 RPS 限制
// 若设置了 VITE_TRONGRID_API_KEY，不需要这层节流也能跑，但加上更稳

const DEFAULT_INTERVAL_MS = 380 // ~2.6 RPS，留 0.4 buffer
const HAS_API_KEY = !!import.meta.env.VITE_TRONGRID_API_KEY
const INTERVAL_MS = HAS_API_KEY ? 0 : DEFAULT_INTERVAL_MS

const queues = new Map()  // networkKey → { lastAt: number, chain: Promise }

function getQueue(networkKey) {
  let q = queues.get(networkKey)
  if (!q) {
    q = { lastAt: 0, chain: Promise.resolve() }
    queues.set(networkKey, q)
  }
  return q
}

// 串行执行 + 最小间隔
export function throttle(networkKey, fn) {
  const q = getQueue(networkKey)
  const next = q.chain.then(async () => {
    if (INTERVAL_MS > 0) {
      const wait = q.lastAt + INTERVAL_MS - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    try {
      return await fn()
    } finally {
      q.lastAt = Date.now()
    }
  })
  // 把后续等待者挂到当前任务后面（不传播错误以免阻塞）
  q.chain = next.catch(() => undefined)
  return next
}
