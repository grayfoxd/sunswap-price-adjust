// V3 Quoter (V1) 调用
// SunSwap V3 Tron 部署是 V1 接口：平铺 5 参，输出只有 amountOut
// 没有 sqrtPriceX96After / initializedTicksCrossed —— 这些只能在 swap 后通过 slot0 复查

import quoterAbi from '../../config/abis/v3Quoter.json'
import { callRead } from '../../lib/contract'
import { getNetwork } from '../../config/networks'

export async function quoteV3ExactInputSingle(networkKey, { tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96 }) {
  const net = getNetwork(networkKey)
  if (!net.v3.QUOTER) throw new Error('该网络未配置 V3 QUOTER 地址')
  return callRead(networkKey, net.v3.QUOTER, quoterAbi, 'quoteExactInputSingle', [
    tokenIn,
    tokenOut,
    fee,
    amountIn,
    sqrtPriceLimitX96 ?? 0,
  ])
}

export async function quoteV3ExactOutputSingle(networkKey, { tokenIn, tokenOut, amountOut, fee, sqrtPriceLimitX96 }) {
  const net = getNetwork(networkKey)
  if (!net.v3.QUOTER) throw new Error('该网络未配置 V3 QUOTER 地址')
  return callRead(networkKey, net.v3.QUOTER, quoterAbi, 'quoteExactOutputSingle', [
    tokenIn,
    tokenOut,
    fee,
    amountOut,
    sqrtPriceLimitX96 ?? 0,
  ])
}
