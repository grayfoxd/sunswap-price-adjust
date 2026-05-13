// Uniswap V3 TickMath JS 移植
// price = 1.0001^tick，sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
// 完整实现采用 Uniswap V3 官方常量表算法（高精度 BigInt 推导）

import Decimal from 'decimal.js'

export const MIN_TICK = -887272
export const MAX_TICK = 887272
export const MIN_SQRT_RATIO = 4295128739n
export const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n

// 完整版（Uniswap V3 官方算法常量表）
const MAGIC = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
]

export function getSqrtRatioAtTick(tick) {
  const t = BigInt(tick)
  const absTick = t < 0n ? -t : t
  if (absTick > BigInt(MAX_TICK)) throw new Error('tick out of range')

  let ratio = (absTick & 0x1n) !== 0n
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n

  let bit = 0x2n
  for (let i = 1; i < MAGIC.length; i++) {
    if ((absTick & bit) !== 0n) {
      ratio = (ratio * MAGIC[i]) >> 128n
    }
    bit <<= 1n
  }

  if (t > 0n) {
    const MAX_UINT256 = (1n << 256n) - 1n
    ratio = MAX_UINT256 / ratio
  }

  // shift right 32, round up
  return (ratio >> 32n) + ((ratio & 0xffffffffn) === 0n ? 0n : 1n)
}

// 用 Decimal 反查 tick（实用近似，再用 getSqrtRatioAtTick 校准 ±1）
export function getTickAtSqrtRatio(sqrtPriceX96) {
  if (sqrtPriceX96 < MIN_SQRT_RATIO || sqrtPriceX96 > MAX_SQRT_RATIO) {
    throw new Error('sqrtPriceX96 out of range')
  }
  // tick ≈ log_1.0001(price) = log_1.0001((sqrtPriceX96/2^96)^2)
  const sqrtP = new Decimal(sqrtPriceX96.toString()).div(new Decimal(2).pow(96))
  const price = sqrtP.pow(2)
  const tickApprox = price.ln().div(new Decimal('1.0001').ln())
  let t = Math.floor(Number(tickApprox.toFixed(0)))

  // 校准：保证 sqrtRatioAtTick(t) <= sqrtPriceX96 < sqrtRatioAtTick(t+1)
  while (t > MIN_TICK && getSqrtRatioAtTick(t) > sqrtPriceX96) t--
  while (t < MAX_TICK && getSqrtRatioAtTick(t + 1) <= sqrtPriceX96) t++
  return t
}

export function alignTick(tick, spacing) {
  if (spacing <= 0) return tick
  const r = tick % spacing
  if (tick < 0 && r !== 0) return tick - r - spacing
  return tick - r
}
