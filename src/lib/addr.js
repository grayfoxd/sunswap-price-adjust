// base58 (T...) ↔ EVM hex (0x...) 转换工具
// TronWeb 内置 tronWeb.address.toHex 返回 '41' 前缀的 hex（21 字节）
// 我们的合约调用需要不带 '41' 前缀的 20 字节 hex，左 0x

import { readTronWeb } from './tronweb'

export function toEvmHex(base58Or41, networkKey = 'nile') {
  if (!base58Or41) return '0x0000000000000000000000000000000000000000'
  if (typeof base58Or41 === 'string' && base58Or41.startsWith('0x')) {
    const body = base58Or41.replace(/^0x/, '').slice(-40)
    return '0x' + body.toLowerCase()
  }
  const tw = readTronWeb(networkKey)
  const hex = tw.address.toHex(base58Or41) // '41' + 40 hex
  const body = (hex.startsWith('41') ? hex.slice(2) : hex.replace(/^0x/, '')).slice(-40)
  return '0x' + body.toLowerCase()
}

export function fromEvmHex(hex, networkKey = 'nile') {
  if (!hex) return ''
  const tw = readTronWeb(networkKey)
  const body = hex.replace(/^0x/, '').slice(-40)
  return tw.address.fromHex('41' + body)
}

export const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000'
