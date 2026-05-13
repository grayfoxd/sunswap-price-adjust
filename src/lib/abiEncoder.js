// 最小 ABI 编码器：支持 V3_SWAP_EXACT_IN 等需要的少量场景
// 静态类型 (address / uint* / int* / bool / bytes32) + 动态 bytes
// 不实现 string/数组/复杂 tuple；那些场景靠 TronWeb 的参数序列化

import { toEvmHex } from './addr.js'

function encodeStatic(type, value) {
  if (type === 'address') {
    const hex = toEvmHex(value).replace(/^0x/, '')
    return hex.padStart(64, '0')
  }
  if (type === 'bool') return (value ? '1' : '0').padStart(64, '0')
  if (type.startsWith('uint') || type.startsWith('int')) {
    let v = BigInt(value)
    if (v < 0n) {
      const bits = parseInt(type.replace(/^u?int/, '')) || 256
      v = v + (1n << BigInt(bits))
    }
    return v.toString(16).padStart(64, '0')
  }
  if (type === 'bytes32') return value.replace(/^0x/, '').padStart(64, '0')
  throw new Error(`unsupported static type: ${type}`)
}

// 32 字节长度前缀 + 数据右补零至 32 字节倍数
function encodeBytes(hexValue) {
  const clean = hexValue.replace(/^0x/, '')
  const lengthBytes = clean.length / 2
  const head = lengthBytes.toString(16).padStart(64, '0')
  const padded = clean.padEnd(Math.ceil(clean.length / 64) * 64, '0')
  return head + padded
}

// 标准 ABI parameters 编码：types[]、values[]，返回 '0x...' 字符串
export function encodeAbiParameters(types, values) {
  const headLen = types.length * 32
  const headParts = new Array(types.length)
  const tailParts = []
  let tailOffset = headLen

  for (let i = 0; i < types.length; i++) {
    const t = types[i]
    const v = values[i]
    if (t === 'bytes') {
      headParts[i] = encodeStatic('uint256', tailOffset)
      const enc = encodeBytes(v)
      tailParts.push(enc)
      tailOffset += enc.length / 2
    } else {
      headParts[i] = encodeStatic(t, v)
    }
  }
  return '0x' + headParts.join('') + tailParts.join('')
}

// V3 swap path 编码（单跳）：token(20) || fee(3) || token(20) = 43 字节
export function encodeV3Path(tokenInBase58, fee, tokenOutBase58) {
  const a = toEvmHex(tokenInBase58).replace(/^0x/, '').padStart(40, '0')
  const b = toEvmHex(tokenOutBase58).replace(/^0x/, '').padStart(40, '0')
  const f = Number(fee).toString(16).padStart(6, '0')
  return '0x' + a + f + b
}
