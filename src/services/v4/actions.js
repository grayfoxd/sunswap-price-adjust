// V4 ActionsPlanner: 把 V4 action 序列编码成 UniversalRouter V4_SWAP (0x12) 的 input 数据
//   input = abi.encode(bytes actions, bytes[] params)
//   actions 是单字节序列，每个字节对应一个 action 类型
//   params[i] 是该 action 的 ABI 编码参数（单参数情况下 = abi.encode(value)）
//
// 参考实现:
//   universal-router-sdk/src/packages/v4/constants/actions.ts
//   universal-router-sdk/src/packages/v4/constants/actionsAbiParameters.ts
//   universal-router-sdk/src/packages/v4/constants/abiStructFragments.ts
//   sunswap-v4-core/scripts/swap.ts

import { readTronWeb } from '../../lib/tronweb.js'
import { toEvmHex, ZERO_EVM_ADDRESS } from '../../lib/addr.js'
import { encodeCLPoolParameters } from '../../math/poolId.js'
import { sortPoolKey, isNativeTrxAddress } from './pool.js'

export const ACTIONS = {
  // liquidity
  CL_INCREASE_LIQUIDITY: 0x00,
  CL_DECREASE_LIQUIDITY: 0x01,
  CL_MINT_POSITION: 0x02,
  CL_BURN_POSITION: 0x03,
  // swapping
  CL_SWAP_EXACT_IN_SINGLE: 0x06,
  CL_SWAP_EXACT_IN: 0x07,
  CL_SWAP_EXACT_OUT_SINGLE: 0x08,
  CL_SWAP_EXACT_OUT: 0x09,
  // closing deltas
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
  TAKE_PORTION: 0x10,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
  CLEAR_OR_TAKE: 0x13,
  SWEEP: 0x14,
  WRAP: 0x15,
  UNWRAP: 0x16,
}

// V4 ActionsPlanner 里的特殊常量
export const ACTION_CONSTANTS = {
  OPEN_DELTA: 0n,
  CONTRACT_BALANCE: '0x8000000000000000000000000000000000000000000000000000000000000000',
  MSG_SENDER: '0x0000000000000000000000000000000000000001',
  ADDRESS_THIS: '0x0000000000000000000000000000000000000002',
}

// PoolKey tuple ABI (5-tuple，对齐链上 PoolKey.sol 与 universal-router-sdk)
const POOLKEY_TUPLE = 'tuple(address,address,address,uint24,bytes32)'

const ACTION_PARAM_TYPES = {
  [ACTIONS.CL_SWAP_EXACT_IN_SINGLE]: [`tuple(${POOLKEY_TUPLE},bool,uint128,uint128,bytes)`],
  [ACTIONS.CL_SWAP_EXACT_OUT_SINGLE]: [`tuple(${POOLKEY_TUPLE},bool,uint128,uint128,bytes)`],
  [ACTIONS.SETTLE]: ['address', 'uint256', 'bool'],
  [ACTIONS.SETTLE_ALL]: ['address', 'uint256'],
  [ACTIONS.SETTLE_PAIR]: ['address', 'address'],
  [ACTIONS.TAKE]: ['address', 'address', 'uint256'],
  [ACTIONS.TAKE_ALL]: ['address', 'uint256'],
  [ACTIONS.TAKE_PAIR]: ['address', 'address', 'address'],
  [ACTIONS.CLOSE_CURRENCY]: ['address'],
  [ACTIONS.SWEEP]: ['address', 'address'],
}

function getCoder(networkKey) {
  const tw = readTronWeb(networkKey)
  return tw.utils.ethersUtils.AbiCoder.defaultAbiCoder()
}

function tokenToEvm(addr, networkKey) {
  if (!addr) return ZERO_EVM_ADDRESS
  if (isNativeTrxAddress(addr)) return ZERO_EVM_ADDRESS
  return toEvmHex(addr, networkKey)
}

// 把 JS 友好的 PoolKey ({currency0,currency1,hooks,fee,tickSpacing}) → 长度为 5 的数组
// 输入 currency 可以是 base58 / 0x，输出全部是 0x EVM hex
export function toEncodedPoolKey(poolKey, networkKey) {
  return [
    tokenToEvm(poolKey.currency0, networkKey),
    tokenToEvm(poolKey.currency1, networkKey),
    tokenToEvm(poolKey.hooks || ZERO_EVM_ADDRESS, networkKey),
    Number(poolKey.fee),
    encodeCLPoolParameters(poolKey.tickSpacing),
  ]
}

function encodeOneAction(coder, action, value) {
  const types = ACTION_PARAM_TYPES[action]
  if (!types) throw new Error(`unsupported V4 action: 0x${action.toString(16)}`)
  // 单参数 tuple 也按 length=1 的数组传 —— ethers AbiCoder 会自动加 0x20 offset
  return coder.encode(types, value)
}

// 把一组 action plans 编码成 V4_SWAP command input
// actionPlans: Array<{ action: number, value: any[] }>
//   value 是与 ACTION_PARAM_TYPES[action] 对齐的位置参数数组
export function encodeActionPlans(networkKey, actionPlans) {
  const coder = getCoder(networkKey)
  const actionsBytes = '0x' + actionPlans.map((p) => p.action.toString(16).padStart(2, '0')).join('')
  const paramsList = actionPlans.map((p) => encodeOneAction(coder, p.action, p.value))
  return coder.encode(['bytes', 'bytes[]'], [actionsBytes, paramsList])
}

// 高层 helper：编码"单池 V4 exactInputSingle swap"完整 action plan
// 等价于 ActionsPlanner.add(CL_SWAP_EXACT_IN_SINGLE) + SETTLE(input, OPEN_DELTA, true) + TAKE(output, recipient, OPEN_DELTA)
// 入参 poolKey 可以是未排序的（会自动按 currency 字节序排）
// 返回 { input, sortedPoolKey, inputCurrency, outputCurrency }
//
// 重要：SunSwap V4Router 的 mapRecipient 只接受两个 sentinel 地址：
//   - ActionConstants.MSG_SENDER (0x..0001) → 解析为 UR 的调用者（用户）
//   - ActionConstants.ADDRESS_THIS (0x..0002) → 解析为 UR 自己
// 传任何"真实地址"都会被 V4Router 直接 revert(InvalidRecipient(addr))
// 所以这里 TAKE 永远用 MSG_SENDER sentinel，把 amountOut 交给用户。
// 如果将来需要发到第三方地址，要拆成 TAKE→ADDRESS_THIS + SWEEP→recipient 两步。
export function encodeV4SwapExactInSingleInput(networkKey, {
  poolKey, zeroForOne, amountIn, amountOutMinimum, recipient, hookData = '0x',
}) {
  const sorted = sortPoolKey(poolKey, networkKey)
  const encodedPoolKey = toEncodedPoolKey(sorted, networkKey)

  const inputCurrency = encodedPoolKey[zeroForOne ? 0 : 1]
  const outputCurrency = encodedPoolKey[zeroForOne ? 1 : 0]

  // recipient 必须是调用 UniversalRouter 的账号本人，否则只能走 ADDRESS_THIS + SWEEP
  if (recipient) {
    const recipientHex = toEvmHex(recipient, networkKey).toLowerCase()
    const sentinelMsgSender = ACTION_CONSTANTS.MSG_SENDER.toLowerCase()
    const sentinelAddrThis = ACTION_CONSTANTS.ADDRESS_THIS.toLowerCase()
    // 不强校验 recipient == msgSender（前端拿不到 UR 实际 msgSender），但留个 console 提示
    if (recipientHex !== sentinelMsgSender && recipientHex !== sentinelAddrThis) {
      // 默认行为：忽略传入的 recipient，强制 MSG_SENDER。调用方应保证 recipient == 当前钱包账户。
    }
  }

  const input = encodeActionPlans(networkKey, [
    {
      action: ACTIONS.CL_SWAP_EXACT_IN_SINGLE,
      value: [[
        encodedPoolKey,
        zeroForOne,
        amountIn.toString(),
        amountOutMinimum.toString(),
        hookData,
      ]],
    },
    {
      action: ACTIONS.SETTLE,
      value: [inputCurrency, ACTION_CONSTANTS.OPEN_DELTA.toString(), true],
    },
    {
      action: ACTIONS.TAKE,
      value: [outputCurrency, ACTION_CONSTANTS.MSG_SENDER, ACTION_CONSTANTS.OPEN_DELTA.toString()],
    },
  ])

  return { input, sortedPoolKey: sorted, encodedPoolKey, inputCurrency, outputCurrency }
}
