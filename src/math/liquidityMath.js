// Uniswap V3 LiquidityAmounts 移植（BigInt）
// 见 v3-periphery/contracts/libraries/LiquidityAmounts.sol

import { Q96 } from './sqrtPrice.js'

function divRoundUp(a, b) {
  return (a + b - 1n) / b
}

// getAmount0Delta(sqrtA, sqrtB, L, roundUp) — token0 数量变化
// amount0 = L * (sqrtB - sqrtA) / (sqrtA * sqrtB) * Q96
export function getAmount0Delta(sqrtA, sqrtB, liquidity, roundUp = false) {
  let a = sqrtA, b = sqrtB
  if (a > b) [a, b] = [b, a]
  const numerator1 = liquidity << 96n
  const numerator2 = b - a
  if (roundUp) {
    return divRoundUp(divRoundUp(numerator1 * numerator2, b), a)
  }
  return (numerator1 * numerator2) / b / a
}

// getAmount1Delta(sqrtA, sqrtB, L, roundUp) — token1 数量变化
// amount1 = L * (sqrtB - sqrtA) / Q96
export function getAmount1Delta(sqrtA, sqrtB, liquidity, roundUp = false) {
  let a = sqrtA, b = sqrtB
  if (a > b) [a, b] = [b, a]
  const product = liquidity * (b - a)
  if (roundUp) return divRoundUp(product, Q96)
  return product / Q96
}

// 给定当前 sqrtP 与上下界，对应的 token 数
export function getAmountsForLiquidity(sqrtP, sqrtLower, sqrtUpper, liquidity) {
  let a = sqrtLower, b = sqrtUpper
  if (a > b) [a, b] = [b, a]
  if (sqrtP <= a) {
    return { amount0: getAmount0Delta(a, b, liquidity, false), amount1: 0n }
  } else if (sqrtP < b) {
    return {
      amount0: getAmount0Delta(sqrtP, b, liquidity, false),
      amount1: getAmount1Delta(a, sqrtP, liquidity, false),
    }
  }
  return { amount0: 0n, amount1: getAmount1Delta(a, b, liquidity, false) }
}

// 从 token 数反推 L
export function getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, amount0, amount1) {
  let a = sqrtLower, b = sqrtUpper
  if (a > b) [a, b] = [b, a]
  if (sqrtP <= a) return liquidityForAmount0(a, b, amount0)
  if (sqrtP < b) {
    const l0 = liquidityForAmount0(sqrtP, b, amount0)
    const l1 = liquidityForAmount1(a, sqrtP, amount1)
    return l0 < l1 ? l0 : l1
  }
  return liquidityForAmount1(a, b, amount1)
}

function liquidityForAmount0(sqrtA, sqrtB, amount0) {
  let a = sqrtA, b = sqrtB
  if (a > b) [a, b] = [b, a]
  const intermediate = (a * b) / Q96
  return (amount0 * intermediate) / (b - a)
}

function liquidityForAmount1(sqrtA, sqrtB, amount1) {
  let a = sqrtA, b = sqrtB
  if (a > b) [a, b] = [b, a]
  return (amount1 * Q96) / (b - a)
}
