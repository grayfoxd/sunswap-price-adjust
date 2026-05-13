// 推动价格至目标 sqrtPriceX96 所需的 amountIn 闭式估算
// 仅在 [当前 tick range] 内准确；跨 tick 时偏差，需要 Quoter 二次校准

import { Q96 } from './sqrtPrice.js'

// zeroForOne: 卖 token0 换 token1，价格下行
// amountIn0 = ceil( L * Q96 * (sqrt0 - sqrtT) / (sqrt0 * sqrtT) )
// 反向：amountIn1 = ceil( L * (sqrtT - sqrt0) / Q96 )
// fee: 0 .. 1_000_000（pips，与 V3 fee 字段一致）
export function amountInToReachTarget(sqrtCurrent, sqrtTarget, liquidity, zeroForOne, fee = 0) {
  if (liquidity === 0n) return 0n
  let netIn
  if (zeroForOne) {
    if (sqrtTarget >= sqrtCurrent) return 0n
    const num = liquidity * Q96 * (sqrtCurrent - sqrtTarget)
    const den = sqrtCurrent * sqrtTarget
    netIn = (num + den - 1n) / den
  } else {
    if (sqrtTarget <= sqrtCurrent) return 0n
    const num = liquidity * (sqrtTarget - sqrtCurrent)
    netIn = (num + Q96 - 1n) / Q96
  }
  if (!fee) return netIn
  // grossIn = netIn / (1 - fee/1e6)
  const FEE_BASE = 1_000_000n
  return (netIn * FEE_BASE + (FEE_BASE - BigInt(fee)) - 1n) / (FEE_BASE - BigInt(fee))
}
