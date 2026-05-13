// TronLink 钱包检测、连接、事件订阅
// 设计原则：读链路始终用自建 TronWeb（lib/tronweb.js#readTronWeb），
// 钱包仅用于签名与广播

export async function detectTronLink(timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (typeof window !== 'undefined' && window.tronLink) return window.tronLink
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}

export async function connectWallet() {
  const link = await detectTronLink()
  if (!link) throw new Error('未检测到 TronLink，请先安装/启用扩展')
  const res = await link.request({ method: 'tron_requestAccounts' })
  if (res && res.code === 200) {
    const tw = window.tronWeb
    if (!tw || !tw.ready) throw new Error('TronLink 未就绪，请解锁钱包后重试')
    return {
      address: tw.defaultAddress.base58,
      tronWeb: tw,
    }
  }
  throw new Error(res?.message || '用户拒绝连接')
}

// 监听账号 / 网络切换
export function onWalletMessage(cb) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e) => {
    if (!e?.data?.message) return
    cb(e.data.message)
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}
