// sqrtPriceX96 / price 换算
// 移植自 sunswap-v4-core/scripts/math/sqrtPriceX96.ts

import Decimal from 'decimal.js'

Decimal.set({ precision: 80 })

export const Q96 = 1n << 96n
export const Q192 = 1n << 192n

// 输入 token0、token1 的 *raw* 数量（已乘 10^decimals 后的整数），返回 sqrtPriceX96
export function encodeSqrtPriceX96(token0Raw, token1Raw) {
  const price = new Decimal(token1Raw.toString()).div(token0Raw.toString())
  const sqrtPrice = price.sqrt().mul(new Decimal(2).pow(96))
  return BigInt(sqrtPrice.floor().toFixed(0))
}

// 输入 token0、token1 的人类数量 + decimals，返回 sqrtPriceX96
export function encodeSqrtPriceX96Human(token0Human, token1Human, dec0, dec1) {
  const raw0 = new Decimal(token0Human).mul(new Decimal(10).pow(dec0))
  const raw1 = new Decimal(token1Human).mul(new Decimal(10).pow(dec1))
  const price = raw1.div(raw0)
  const sqrtPrice = price.sqrt().mul(new Decimal(2).pow(96))
  return BigInt(sqrtPrice.floor().toFixed(0))
}

// 解码为原始 price = token1Raw / token0Raw
export function sqrtPriceX96ToRawPrice(sqrtPX96) {
  const s = new Decimal(sqrtPX96.toString())
  return s.pow(2).div(new Decimal(2).pow(192))
}

// 解码为人类 price = (token1Human / token0Human)，考虑 decimals
export function sqrtPriceX96ToHumanPrice(sqrtPX96, dec0, dec1) {
  const raw = sqrtPriceX96ToRawPrice(sqrtPX96)
  const exp = dec0 - dec1
  if (exp >= 0) return raw.mul(new Decimal(10).pow(exp))
  return raw.div(new Decimal(10).pow(-exp))
}

// 反向：从人类 price 计算 sqrtPriceX96
export function humanPriceToSqrtPriceX96(humanPrice, dec0, dec1) {
  // priceRaw = humanPrice * 10^(dec1 - dec0)
  const exp = dec1 - dec0
  let raw
  if (exp >= 0) raw = new Decimal(humanPrice).mul(new Decimal(10).pow(exp))
  else raw = new Decimal(humanPrice).div(new Decimal(10).pow(-exp))
  const sqrtPrice = raw.sqrt().mul(new Decimal(2).pow(96))
  return BigInt(sqrtPrice.floor().toFixed(0))
}
