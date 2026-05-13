// 从 ABI JSON 生成函数选择器签名 + 把 JS 值转成 TronWeb triggerContract 接受的 {type, value}
// TronWeb v6 内部走 ethers v6 AbiCoder：
// - tuple 必须用 (t1,t2,...) 内联签名而不是 'tuple'
// - address 字段（含 tuple 内部的）必须是 0x EVM hex，不能是 base58；TronWeb 在 tuple 外层会自动转，
//   但 tuple 内部直接走 ethers 不转，需要我们手动处理

import { toEvmHex } from './addr.js'

function canonicalType(input) {
  if (input.type === 'tuple') {
    const inner = (input.components || []).map(canonicalType).join(',')
    return `(${inner})`
  }
  if (input.type === 'tuple[]') {
    const inner = (input.components || []).map(canonicalType).join(',')
    return `(${inner})[]`
  }
  return input.type
}

export function functionSelector(fn) {
  const args = (fn.inputs || []).map(canonicalType).join(',')
  return `${fn.name}(${args})`
}

export function findFn(abi, name) {
  const fn = abi.find((x) => x.type === 'function' && x.name === name)
  if (!fn) throw new Error(`ABI function not found: ${name}`)
  return fn
}

// 把 tuple 类型展开成 ethers 接受的内联签名（不带 components 字段）
function flatType(type, components) {
  if (type === 'tuple' && components) {
    return '(' + components.map((c) => flatType(c.type, c.components)).join(',') + ')'
  }
  if (type === 'tuple[]' && components) {
    return '(' + components.map((c) => flatType(c.type, c.components)).join(',') + ')[]'
  }
  return type
}

// base58 (T开头) 或 'T'前缀字符串 → 0x EVM hex；已是 0x... 直接返回
function normalizeAddress(v) {
  if (v == null) return v
  if (typeof v !== 'string') return v
  const s = v.trim()
  if (s.startsWith('0x') || s.startsWith('0X')) return s.toLowerCase()
  if (s.startsWith('T') && s.length >= 30) {
    try { return toEvmHex(s) } catch { return s }
  }
  return s
}

// 把 JS 值按类型转换：tuple → 数组（按 components 顺序）；uint/int → 十进制字符串；bool 保留；address → 0x hex
function flatValue(type, value, components) {
  if (type === 'tuple' && components) {
    return components.map((c) => flatValue(c.type, value?.[c.name], c.components))
  }
  if (type === 'tuple[]' && components) {
    return (value || []).map((v) =>
      components.map((c) => flatValue(c.type, v?.[c.name], c.components)),
    )
  }
  if (type.endsWith('[]')) {
    const elem = type.slice(0, -2)
    return (value || []).map((v) => flatValue(elem, v, components))
  }
  if (type === 'address') return normalizeAddress(value)
  if (type === 'bool') return !!value
  if (type.startsWith('uint') || type.startsWith('int')) {
    return typeof value === 'bigint' ? value.toString() : String(value)
  }
  return value
}

export function toTronParam(type, value, components) {
  return {
    type: flatType(type, components),
    value: flatValue(type, value, components),
  }
}
