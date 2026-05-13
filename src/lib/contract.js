// 合约调用包装：基于 TronWeb triggerConstantContract 做只读调用，
// 并按 ABI outputs 自动解析返回值

import { readTronWeb } from './tronweb.js'
import { findFn, functionSelector, toTronParam } from './abi.js'
import { parseConstantResult } from './parseResult.js'
import { throttle } from './throttle.js'

// 只读调用
// args: 与 ABI inputs 顺序匹配的 JS 值数组
export async function callRead(networkKey, contractAddress, abi, fnName, args = []) {
  const fn = findFn(abi, fnName)
  const tw = readTronWeb(networkKey)
  const selector = functionSelector(fn)

  const parameters = (fn.inputs || []).map((inp, i) => toTronParam(inp.type, args[i], inp.components))

  let result
  for (let attempt = 0; attempt < 2; attempt++) {
    result = await throttle(networkKey, () =>
      tw.transactionBuilder.triggerConstantContract(contractAddress, selector, {}, parameters)
    )
    // TronGrid 限频时会返回 { Error: "...rate exceeded...suspended for 5 s..." }
    const errStr = JSON.stringify(result || '')
    if (/rate exceeded|suspended for/i.test(errStr) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 5500))
      continue
    }
    break
  }

  if (!result || !result.result || !result.result.result) {
    const msg = result?.Error
      || (typeof result?.result?.message === 'string' ? result.result.message : null)
      || JSON.stringify(result?.result || result)
    throw new Error(`triggerConstantContract 失败: ${msg}`)
  }
  const raw = result.constant_result?.[0] || ''
  return parseConstantResult(raw, fn.outputs || [])
}

// 写调用（通过钱包签名）
// signerTronWeb: window.tronWeb（已连接的 TronLink 实例）
export async function callWrite(signerTronWeb, contractAddress, abi, fnName, args = [], options = {}) {
  const fn = findFn(abi, fnName)
  const selector = functionSelector(fn)
  const parameters = (fn.inputs || []).map((inp, i) => toTronParam(inp.type, args[i], inp.components))

  const built = await signerTronWeb.transactionBuilder.triggerSmartContract(
    contractAddress,
    selector,
    {
      feeLimit: options.feeLimit ?? 150_000_000,
      callValue: options.callValue ?? 0,
    },
    parameters,
    signerTronWeb.defaultAddress.base58,
  )
  if (!built.result || !built.result.result) {
    throw new Error(`triggerSmartContract 失败: ${JSON.stringify(built.result)}`)
  }
  const signed = await signerTronWeb.trx.sign(built.transaction)
  const broadcast = await signerTronWeb.trx.sendRawTransaction(signed)
  if (!broadcast.result) {
    throw new Error(`广播失败: ${JSON.stringify(broadcast)}`)
  }
  return broadcast.txid || broadcast.txID
}
