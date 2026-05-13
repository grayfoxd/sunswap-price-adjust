// V4 PoolManager 读取：getSlot0 / getLiquidity
// 参考 sunswap-v4-core/scripts/getSlot0.ts

import poolManagerAbi from '../../config/abis/v4PoolManager.json'
import erc20Abi from '../../config/abis/erc20.json'
import { callRead } from '../../lib/contract'
import { getPoolId } from '../../math/poolId'
import { getNetwork } from '../../config/networks'
import { toEvmHex } from '../../lib/addr'

// 入参可以是 PoolKey 对象 {currency0,currency1,hooks?,fee,tickSpacing}，
// 也可以是带 .poolId 字段的对象（直接给 bytes32），或者字符串/bytes32 自身
// 对 PoolKey 对象会自动按 V4 要求把 currency0/currency1 按字节序升序排（不改变原对象）
function resolvePoolId(networkKey, poolKeyOrId) {
  if (typeof poolKeyOrId === 'string') {
    return normalizeBytes32(poolKeyOrId)
  }
  if (poolKeyOrId && poolKeyOrId.poolId) {
    return normalizeBytes32(poolKeyOrId.poolId)
  }
  // 自动排序 currency
  const sorted = sortPoolKey(poolKeyOrId, networkKey)
  return getPoolId(sorted, networkKey)
}

// 导出供上层（pushPrice / Quoter）使用，保证它们也按 sort 后的顺序处理 token
export function sortPoolKey(poolKey, networkKey) {
  const c0 = toEvmHex(poolKey.currency0, networkKey)
  const c1 = toEvmHex(poolKey.currency1, networkKey)
  const a = c0.toLowerCase(), b = c1.toLowerCase()
  if (a === b) throw new Error('currency0 == currency1，不合法')
  const swap = a > b
  return swap
    ? { ...poolKey, currency0: poolKey.currency1, currency1: poolKey.currency0, _swapped: true }
    : { ...poolKey, _swapped: false }
}

function normalizeBytes32(s) {
  const cleaned = s.trim().replace(/^0x/i, '')
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error('poolId 格式错误：应为 0x + 64 位 hex')
  }
  return '0x' + cleaned.toLowerCase()
}

export async function getV4Slot0(networkKey, poolKeyOrId) {
  const net = getNetwork(networkKey)
  if (!net.v4.POOL_MANAGER) throw new Error('该网络未配置 V4 POOL_MANAGER 地址')
  const id = resolvePoolId(networkKey, poolKeyOrId)
  const r = await callRead(networkKey, net.v4.POOL_MANAGER, poolManagerAbi, 'getSlot0', [id])
  return { poolId: id, ...r }
}

export async function getV4Liquidity(networkKey, poolKeyOrId) {
  const net = getNetwork(networkKey)
  const id = resolvePoolId(networkKey, poolKeyOrId)
  const r = await callRead(networkKey, net.v4.POOL_MANAGER, poolManagerAbi, 'getLiquidity', [id])
  return { poolId: id, liquidity: r.liquidity }
}

// 原生 TRX 占位地址（base58 `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb` → EVM 0x000...000）
// V4 用零地址表示 native，但它不是 ERC20 合约 —— 调 decimals/symbol 会"Smart contract is not exist"
const NATIVE_TRX_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
const ZERO_EVM = '0x0000000000000000000000000000000000000000'

export function isNativeTrxAddress(addr) {
  if (!addr) return false
  const s = String(addr).trim()
  if (s === NATIVE_TRX_BASE58) return true
  if (s.toLowerCase() === ZERO_EVM) return true
  return false
}

const decimalsCache = new Map()
export async function getTokenDecimals(networkKey, tokenAddress) {
  if (isNativeTrxAddress(tokenAddress)) return 6
  const key = `${networkKey}:${(tokenAddress || '').toLowerCase()}`
  if (decimalsCache.has(key)) return decimalsCache.get(key)
  const r = await callRead(networkKey, tokenAddress, erc20Abi, 'decimals', [])
  const d = Number(r._0 ?? Object.values(r)[0])
  decimalsCache.set(key, d)
  return d
}
