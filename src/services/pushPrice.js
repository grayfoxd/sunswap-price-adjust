// 推价编排：基于当前 sqrtPrice + 目标 sqrtPrice + 流动性，
// 先用闭式解给出 amountIn 估算，再用 Quoter 校准（仅 V3 支持 sqrtPriceLimitX96）
// V4 Quoter 不接受 sqrtPriceLimitX96，先用 binary-search 在 amountIn 上逼近目标价

import { amountInToReachTarget } from '../math/swapMath'
import { quoteV3ExactInputSingle, quoteV3ExactOutputSingle } from './v3/quoter'
import { quoteV4ExactInputSingle } from './v4/quoter'
import { getV3Slot0, getV3Liquidity, getV3PoolAddress, getV3PoolMeta } from './v3/pool'
import { getV4Slot0, getV4Liquidity, sortPoolKey, isNativeTrxAddress } from './v4/pool'
import { toEvmHex, fromEvmHex } from '../lib/addr'

export function deriveDirection(currentSqrt, targetSqrt) {
  if (targetSqrt === currentSqrt) return null
  return targetSqrt < currentSqrt ? 'zeroForOne' : 'oneForZero'
}

// V3 推价估算
// 返回 { poolAddress, currentSqrt, targetSqrt, liquidity, zeroForOne, tokenIn, tokenOut, fee, estimateLocal, quoter }
export async function planV3PushPrice(networkKey, { poolAddress, token0, token1, fee, targetSqrtPriceX96 }) {
  let poolAddr = poolAddress
  let meta
  if (!poolAddr) {
    poolAddr = await getV3PoolAddress(networkKey, token0, token1, fee)
  }
  meta = await getV3PoolMeta(networkKey, poolAddr).catch(() => null)
  const [slot0, liqRes] = await Promise.all([getV3Slot0(networkKey, poolAddr), getV3Liquidity(networkKey, poolAddr)])
  const currentSqrt = slot0.sqrtPriceX96
  const liquidity = Object.values(liqRes)[0]
  const targetSqrt = BigInt(targetSqrtPriceX96)
  const dir = deriveDirection(currentSqrt, targetSqrt)
  if (!dir) throw new Error('目标价等于当前价，无需 swap')
  const zeroForOne = dir === 'zeroForOne'

  const effFee = meta?.fee ?? fee
  const localEstimate = amountInToReachTarget(currentSqrt, targetSqrt, liquidity, zeroForOne, effFee)

  const tokenIn = zeroForOne
    ? meta?.token0 ? fromEvmHex(meta.token0, networkKey) : token0
    : meta?.token1 ? fromEvmHex(meta.token1, networkKey) : token1
  const tokenOut = zeroForOne
    ? meta?.token1 ? fromEvmHex(meta.token1, networkKey) : token1
    : meta?.token0 ? fromEvmHex(meta.token0, networkKey) : token0

  let quoter = null
  // 提前拦截已知必失败的情况，避免徒劳调用 + 给清晰原因
  if (liquidity === 0n) {
    quoter = { error: '池子 liquidity = 0，无法 swap（先注入流动性或换 fee tier）', skipped: true }
  } else if (zeroForOne && targetSqrt <= 4295128739n /* MIN_SQRT_RATIO */) {
    quoter = { error: 'target 在 MIN_SQRT_RATIO 之下，不合法', skipped: true }
  } else if (!zeroForOne && targetSqrt >= 1461446703485210103287273052203988822378723970342n /* MAX_SQRT_RATIO */) {
    quoter = { error: 'target 在 MAX_SQRT_RATIO 之上，不合法', skipped: true }
  } else if (localEstimate === 0n) {
    quoter = { error: '本地估算 amountIn 为 0；目标价过于接近当前价或参数异常', skipped: true }
  } else {
    try {
      // 第一步：用 limit=target + 慷慨 amountIn 试探，让 Quoter 把价格"推到" target，得到对应 amountOut
      const upper = (localEstimate * 30n + 9n) / 10n  // 3 倍空间，足以覆盖跨 tick 时 L 变小的情况
      const r1 = await quoteV3ExactInputSingle(networkKey, {
        tokenIn,
        tokenOut,
        amountIn: upper.toString(),
        fee: effFee,
        sqrtPriceLimitX96: targetSqrt.toString(),
      })
      const amountOutAtTarget = r1.amountOut

      // 第二步：反过来用 exactOutput(amountOut = 上一步) 拿"精确的 amountIn"
      // V1 Quoter 不直接告诉我们 amountIn used，但相同 swap 路径下 exactOutput → 精确 amountIn
      let amountInExact = null
      let reachable = true
      try {
        const r2 = await quoteV3ExactOutputSingle(networkKey, {
          tokenIn,
          tokenOut,
          amountOut: amountOutAtTarget.toString(),
          fee: effFee,
          sqrtPriceLimitX96: targetSqrt.toString(),
        })
        amountInExact = r2.amountIn
      } catch (e) {
        // exactOutput 失败表示 target 在当前流动性下不可达；标记并回退用本地估算
        reachable = false
      }

      quoter = {
        amountOut: amountOutAtTarget,
        amountInUpperUsed: upper,           // 第一步的上限，仅作展示
        amountInExact,                       // 推荐用于实际 swap 的 amountIn —— 不超调
        reachable,
      }
    } catch (e) {
      const raw = e.message || String(e)
      let hint = ''
      if (/REVERT/i.test(raw)) {
        hint = ' — 常见原因：池子流动性不足以推到目标价、sqrtPriceLimit 不合法、或 Quoter 合约非 V2 接口'
      }
      quoter = { error: raw + hint }
    }
  }

  return {
    poolAddress: poolAddr,
    currentSqrt,
    targetSqrt,
    liquidity,
    fee: effFee,
    zeroForOne,
    tokenIn,
    tokenOut,
    estimateLocal: localEstimate,
    quoter,
  }
}

// V4 推价估算
// 入参 poolKey 可以是完整结构 {currency0, currency1, hooks?, fee, tickSpacing}
// 或者 { poolId: '0x...' }（只读模式，跳过 quoter 校准）
export async function planV4PushPrice(networkKey, { poolKey, targetSqrtPriceX96 }) {
  const idMode = !!poolKey.poolId && !poolKey.currency0
  const arg = idMode ? poolKey.poolId : poolKey
  const [slot0, liqRes] = await Promise.all([
    getV4Slot0(networkKey, arg),
    getV4Liquidity(networkKey, arg),
  ])
  const currentSqrt = slot0.sqrtPriceX96
  const liquidity = liqRes.liquidity
  const targetSqrt = BigInt(targetSqrtPriceX96)
  const dir = deriveDirection(currentSqrt, targetSqrt)
  if (!dir) throw new Error('目标价等于当前价，无需 swap')
  const zeroForOne = dir === 'zeroForOne'

  // 排序 + 解析 tokenIn / tokenOut（base58）—— 给执行用
  let sortedPoolKey = null
  let tokenIn = null
  let tokenOut = null
  if (!idMode) {
    sortedPoolKey = sortPoolKey(poolKey, networkKey)
    tokenIn = zeroForOne ? sortedPoolKey.currency0 : sortedPoolKey.currency1
    tokenOut = zeroForOne ? sortedPoolKey.currency1 : sortedPoolKey.currency0
  }

  const fee = Number(slot0.lpFee || 0)
  const localEstimate = amountInToReachTarget(currentSqrt, targetSqrt, liquidity, zeroForOne, fee)

  let quoter = null
  // 与 V3 一致：先把已知必失败的情况拦下，避免徒劳调用 Quoter + 给清晰原因
  const MIN_SQRT_RATIO = 4295128739n
  const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n
  if (idMode) {
    quoter = { error: 'poolId 模式下无 PoolKey 结构，跳过 Quoter 校准（仅本地估算）', skipped: true }
  } else if (liquidity === 0n) {
    quoter = { error: '池子 liquidity = 0，无法 swap（先注入流动性或换 fee/tickSpacing）', skipped: true }
  } else if (zeroForOne && targetSqrt <= MIN_SQRT_RATIO) {
    quoter = { error: 'target 在 MIN_SQRT_RATIO 之下，不合法', skipped: true }
  } else if (!zeroForOne && targetSqrt >= MAX_SQRT_RATIO) {
    quoter = { error: 'target 在 MAX_SQRT_RATIO 之上，不合法', skipped: true }
  } else if (localEstimate === 0n) {
    quoter = { error: '本地估算 amountIn 为 0；目标价过于接近当前价或参数异常', skipped: true }
  } else {
    try {
      const r = await quoteV4ExactInputSingle(networkKey, poolKey, zeroForOne, localEstimate)
      quoter = {
        amountOut: r.amountOut,
        gasEstimate: r.gasEstimate,
        amountInUsed: localEstimate,
      }
    } catch (e) {
      const raw = e.message || String(e)
      let hint = ''
      if (/REVERT/i.test(raw)) {
        hint = ' — 常见原因：池子流动性不足、PoolKey 字段不匹配（hooks/tickSpacing/fee）、Quoter ABI 与链上合约不一致'
      }
      quoter = { error: raw + hint }
    }
  }

  return {
    poolId: slot0.poolId,
    currentSqrt,
    targetSqrt,
    liquidity,
    fee,
    zeroForOne,
    estimateLocal: localEstimate,
    quoter,
    // 给"执行 V4 swap"用：base58 token / 排序后的 poolKey
    poolKey: sortedPoolKey,
    tokenIn,
    tokenOut,
    tokenInIsNative: tokenIn ? isNativeTrxAddress(tokenIn) : false,
  }
}
