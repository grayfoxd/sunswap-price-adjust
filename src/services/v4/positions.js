// V4 CLPositionManager.modifyLiquidities 封装 —— mint 新仓位
// 流程：
//   1) 对 token0/token1 做 Permit2 两步授权（spender = PositionManager）
//      native TRX 通过 callValue 注入，无需 Permit2
//   2) 编码 actions = [CL_MINT_POSITION, SETTLE_PAIR]
//      params[0] = (PoolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData)
//      params[1] = (currency0, currency1)
//   3) PositionManager.modifyLiquidities(unlockData, deadline)
//
// 参考实现：
//   universal-router-sdk/src/packages/v4/constants/actions.ts
//   sunswap-v4-core/scripts (mintPosition / modifyLiquidities)

import positionManagerAbi from '../../config/abis/v4PositionManager.json'
import { callWrite } from '../../lib/contract'
import { getNetwork } from '../../config/networks'
import { readTronWeb } from '../../lib/tronweb'
import { toEvmHex, ZERO_EVM_ADDRESS } from '../../lib/addr'
import { encodeCLPoolParameters } from '../../math/poolId'
import { ACTIONS, ACTION_CONSTANTS } from './actions'
import { sortPoolKey, isNativeTrxAddress } from './pool'
import { ensurePermit2Approvals } from '../permit2'

function getCoder(networkKey) {
  const tw = readTronWeb(networkKey)
  return tw.utils.ethersUtils.AbiCoder.defaultAbiCoder()
}

function pmAddr(networkKey) {
  const net = getNetwork(networkKey)
  if (!net.v4.POSITION_MANAGER) throw new Error('该网络未配置 V4 POSITION_MANAGER 地址')
  return net.v4.POSITION_MANAGER
}

function tokenToEvm(addr, networkKey) {
  if (!addr) return ZERO_EVM_ADDRESS
  if (isNativeTrxAddress(addr)) return ZERO_EVM_ADDRESS
  return toEvmHex(addr, networkKey)
}

// 5-field PoolKey 数组，与 PoolManager.unlock 一致：(currency0,currency1,hooks,fee,parameters)
function toEncodedPoolKey(poolKey, networkKey) {
  return [
    tokenToEvm(poolKey.currency0, networkKey),
    tokenToEvm(poolKey.currency1, networkKey),
    tokenToEvm(poolKey.hooks || ZERO_EVM_ADDRESS, networkKey),
    Number(poolKey.fee),
    encodeCLPoolParameters(poolKey.tickSpacing),
  ]
}

const POOLKEY_TUPLE = 'tuple(address,address,address,uint24,bytes32)'
const MINT_PARAM_TYPE = `tuple(${POOLKEY_TUPLE},int24,int24,uint256,uint128,uint128,address,bytes)`
const SETTLE_PAIR_TYPES = ['address', 'address']
const SWEEP_TYPES = ['address', 'address']

// 编码 modifyLiquidities 的 unlockData = abi.encode(bytes actions, bytes[] params)
// actions = CL_MINT_POSITION | SETTLE_PAIR [+ SWEEP(native→recipient) 如有 native TRX 端]
// 注：含 native TRX 端时 callValue 取 amountMax，多余部分需要靠尾部 SWEEP 退回，
// 否则 PositionManager 会扣留差额
export function encodeMintPositionUnlockData(networkKey, {
  poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData = '0x',
}) {
  const coder = getCoder(networkKey)
  const sorted = sortPoolKey(poolKey, networkKey)
  const encodedPoolKey = toEncodedPoolKey(sorted, networkKey)

  const nativeIn0 = isNativeTrxAddress(sorted.currency0)
  const nativeIn1 = isNativeTrxAddress(sorted.currency1)
  const hasNative = nativeIn0 || nativeIn1
  const nativeAddr = encodedPoolKey[nativeIn0 ? 0 : 1]

  const mintParams = coder.encode(
    [MINT_PARAM_TYPE],
    [[
      encodedPoolKey,
      Number(tickLower),
      Number(tickUpper),
      liquidity.toString(),
      amount0Max.toString(),
      amount1Max.toString(),
      toEvmHex(owner, networkKey),
      hookData,
    ]],
  )
  const settleParams = coder.encode(
    SETTLE_PAIR_TYPES,
    [encodedPoolKey[0], encodedPoolKey[1]],
  )

  const paramsList = [mintParams, settleParams]
  const actionIds = [ACTIONS.CL_MINT_POSITION, ACTIONS.SETTLE_PAIR]
  if (hasNative) {
    const sweepParams = coder.encode(SWEEP_TYPES, [nativeAddr, toEvmHex(owner, networkKey)])
    paramsList.push(sweepParams)
    actionIds.push(ACTIONS.SWEEP)
  }

  const actionsBytes = '0x' + actionIds.map((a) => a.toString(16).padStart(2, '0')).join('')
  const unlockData = coder.encode(
    ['bytes', 'bytes[]'],
    [actionsBytes, paramsList],
  )
  return { unlockData, sortedPoolKey: sorted, encodedPoolKey }
}

// 高层 helper：mint V4 position
// 自动处理 Permit2 授权（native TRX 用 callValue 注入）
// params: { poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, slippageBps?, hookData?, feeLimit?, deadline? }
export async function mintV4Position(signerTronWeb, networkKey, params) {
  const owner = params.owner
  if (!owner) throw new Error('owner 缺失（应为当前钱包账户）')
  const sorted = sortPoolKey(params.poolKey, networkKey)
  const cur0 = sorted.currency0
  const cur1 = sorted.currency1
  const nativeIn0 = isNativeTrxAddress(cur0)
  const nativeIn1 = isNativeTrxAddress(cur1)

  // amount0/1Max 给定的是用户愿意付出的上限（含滑点 buffer）
  const amt0 = BigInt(params.amount0Max)
  const amt1 = BigInt(params.amount1Max)

  // ERC20 token 都需 Permit2 两步授权到 PositionManager
  const pm = pmAddr(networkKey)
  if (!nativeIn0 && amt0 > 0n) {
    await ensurePermit2Approvals(signerTronWeb, networkKey, owner, cur0, amt0, pm)
  }
  if (!nativeIn1 && amt1 > 0n) {
    await ensurePermit2Approvals(signerTronWeb, networkKey, owner, cur1, amt1, pm)
  }

  const { unlockData } = encodeMintPositionUnlockData(networkKey, {
    poolKey: sorted,
    tickLower: params.tickLower,
    tickUpper: params.tickUpper,
    liquidity: params.liquidity,
    amount0Max: amt0,
    amount1Max: amt1,
    owner,
    hookData: params.hookData ?? '0x',
  })

  const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 600

  // native TRX 端通过 callValue 注入（取对应那一边的 amountMax）
  let callValue = 0
  if (nativeIn0 && amt0 > 0n) callValue = Number(amt0)
  else if (nativeIn1 && amt1 > 0n) callValue = Number(amt1)

  return callWrite(
    signerTronWeb,
    pm,
    positionManagerAbi,
    'modifyLiquidities',
    [unlockData, deadline.toString()],
    {
      networkKey,
      feeLimit: params.feeLimit ?? 800_000_000,
      callValue,
    },
  )
}
