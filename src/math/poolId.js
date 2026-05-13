// V4 PoolKey → poolId
// poolId = keccak256(abi.encode(address currency0, address currency1, address hooks, uint24 fee, bytes32 parameters))
// 其中 parameters 来自 encodeCLPoolParameters(tickSpacing) = (tickSpacing << 16) 左 0 填充到 32 字节

import { readTronWeb } from '../lib/tronweb.js'
import { toEvmHex, ZERO_EVM_ADDRESS } from '../lib/addr.js'

// tickSpacing 落在 bits 16..39
export function encodeCLPoolParameters(tickSpacing) {
  const shifted = BigInt(tickSpacing) << 16n
  return '0x' + shifted.toString(16).padStart(64, '0')
}

function padAddress(hex) {
  const body = hex.replace(/^0x/, '').toLowerCase().padStart(40, '0')
  return body.padStart(64, '0')
}
function padUint(value, bits = 24) {
  let v = BigInt(value)
  if (v < 0n) {
    v = v + (1n << BigInt(bits))
  }
  return v.toString(16).padStart(64, '0')
}

// 把两个 EVM hex address 按字节序排成 (lo, hi)；V4 PoolKey 要求 currency0 < currency1
export function sortCurrencies(addrA, addrB) {
  const a = addrA.toLowerCase()
  const b = addrB.toLowerCase()
  if (a === b) throw new Error('currency0 == currency1，不合法')
  return a < b ? [a, b] : [b, a]
}

// 计算 PoolKey 对应的 PoolId
// poolKey: { currency0 (base58 或 0x), currency1, hooks, fee (number), tickSpacing (number) }
// 注：不会自动 sort，必须用户/上层显式按 V4 要求顺序传入
export function getPoolId(poolKey, networkKey = 'nile') {
  const c0 = toEvmHex(poolKey.currency0, networkKey)
  const c1 = toEvmHex(poolKey.currency1, networkKey)
  const hk = toEvmHex(poolKey.hooks || ZERO_EVM_ADDRESS, networkKey)
  const params = encodeCLPoolParameters(poolKey.tickSpacing)

  const encoded =
    padAddress(c0) +
    padAddress(c1) +
    padAddress(hk) +
    padUint(poolKey.fee, 24) +
    params.replace(/^0x/, '')

  const tw = readTronWeb(networkKey)
  return tw.utils.ethersUtils.keccak256('0x' + encoded)
}
