import { TronWeb } from 'tronweb'
import { getNetwork } from '../config/networks'

const readCache = new Map()

// 占位 base58 地址（mainnet/Nile 上都是有效格式），用于 triggerConstantContract 的 issuerAddress
// 无私钥的只读 TronWeb 实例若 defaultAddress 缺失，triggerConstantContract 会报错
const PLACEHOLDER_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

// 自建只读 TronWeb 实例 —— 与钱包当前网络解耦
export function readTronWeb(networkKey) {
  if (readCache.has(networkKey)) return readCache.get(networkKey)
  const net = getNetwork(networkKey)
  const tw = new TronWeb({
    fullHost: net.rpc,
    headers: import.meta.env.VITE_TRONGRID_API_KEY
      ? { 'TRON-PRO-API-KEY': import.meta.env.VITE_TRONGRID_API_KEY }
      : undefined,
  })
  // 设置只读 issuer，不写私钥
  try { tw.setAddress(PLACEHOLDER_ADDRESS) } catch {}
  readCache.set(networkKey, tw)
  return tw
}

// 注入的 TronLink TronWeb（已连接时才返回）
export function getInjectedTronWeb() {
  if (typeof window === 'undefined') return null
  const w = window
  if (w.tronWeb && w.tronWeb.ready) return w.tronWeb
  return null
}
