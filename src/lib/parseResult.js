// 解析 triggerConstantContract 返回的 hex 数据
// 移植自 sunswap-v4-core/scripts/context.ts:207-312
// 支持类型：address / bool / int* / uint* / bytes32 / string / bytes / tuple

function hexToUtf8(hex) {
  let s = ''
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16)
    if (code === 0) continue
    s += String.fromCharCode(code)
  }
  try {
    return decodeURIComponent(escape(s))
  } catch {
    return s
  }
}

function parseStatic(hexValue, type) {
  if (type === 'address') {
    return '0x' + hexValue.slice(24)
  }
  if (type === 'bool') {
    return BigInt('0x' + hexValue) !== 0n
  }
  if (type === 'bytes32') {
    return '0x' + hexValue
  }
  if (type.startsWith('int')) {
    const bitLength = parseInt(type.slice(3)) || 256
    let relevantHex
    if (bitLength < 256) {
      const hexChars = Math.ceil(bitLength / 4)
      relevantHex = hexValue.slice(-hexChars)
    } else {
      relevantHex = hexValue
    }
    let value = BigInt('0x' + relevantHex)
    const signBit = 1n << BigInt(bitLength - 1)
    if (value >= signBit) value = value - (1n << BigInt(bitLength))
    return value
  }
  if (type.startsWith('uint')) {
    return BigInt('0x' + hexValue)
  }
  throw new Error(`Unsupported static type: ${type}`)
}

// 在 cleanHex（无 0x 前缀）中读 dynamic string/bytes：offset 在 head 给出，data 段 32 字节长度 + 数据 padded 到 32 字节
function parseDynamic(cleanHex, offset, type) {
  const offsetWord = cleanHex.slice(offset, offset + 64)
  const dataOffset = Number(BigInt('0x' + offsetWord)) * 2 // bytes -> hex chars
  const lenWord = cleanHex.slice(dataOffset, dataOffset + 64)
  const length = Number(BigInt('0x' + lenWord))
  const dataHex = cleanHex.slice(dataOffset + 64, dataOffset + 64 + length * 2)
  if (type === 'string') return hexToUtf8(dataHex)
  if (type === 'bytes') return '0x' + dataHex
  throw new Error(`Unsupported dynamic type: ${type}`)
}

function isDynamic(type) {
  return type === 'string' || type === 'bytes'
}

export function parseConstantResult(hexResult, outputs) {
  const cleanHex = (hexResult || '').replace(/^0x/, '')
  const result = {}
  let headOffset = 0

  outputs.forEach((out, idx) => {
    const key = out.name || `_${idx}`
    if (out.type === 'tuple' && out.components) {
      const tupleResult = {}
      for (const comp of out.components) {
        const hv = cleanHex.slice(headOffset, headOffset + 64)
        tupleResult[comp.name] = parseStatic(hv, comp.type)
        headOffset += 64
      }
      result[key] = tupleResult
    } else if (isDynamic(out.type)) {
      result[key] = parseDynamic(cleanHex, headOffset, out.type)
      headOffset += 64 // head slot for the offset pointer
    } else {
      const hv = cleanHex.slice(headOffset, headOffset + 64)
      result[key] = parseStatic(hv, out.type)
      headOffset += 64
    }
  })
  return result
}
