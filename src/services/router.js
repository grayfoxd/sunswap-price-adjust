// UniversalRouter 调用封装：拼 commands + inputs，转发给 .execute(...)
// 当前实现的命令：
//   - 0x00 V3_SWAP_EXACT_IN  (Uniswap V3 路径 swap)
//   - 0x12 V4_SWAP           (Infinity V4 多 action plan)
//
// 参考 sunswap-v4-core/scripts/swap.ts 与 universal-router-sdk/src/types/command.ts

import universalRouterAbi from '../config/abis/v4UniversalRouter.json'
import { callWrite } from '../lib/contract'
import { getNetwork } from '../config/networks'
import { encodeAbiParameters, encodeV3Path } from '../lib/abiEncoder'
import { toEvmHex } from '../lib/addr'
import { encodeV4SwapExactInSingleInput } from './v4/actions'
import { isNativeTrxAddress } from './v4/pool'

export const COMMAND = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  PERMIT2_TRANSFER_FROM: 0x02,
  PERMIT2_PERMIT: 0x0a,
  // V4 swap — universal-router-sdk 命名 V4_SWAP，sunswap-v4-core/scripts 里叫 InfyCommand，都是 0x12
  V4_SWAP: 0x12,
}

function commandBytes(ids) {
  return '0x' + ids.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// V3_SWAP_EXACT_IN 单跳 input payload
// (address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser)
export function encodeV3SwapExactInSingle(networkKey, { recipient, amountIn, amountOutMin, tokenIn, fee, tokenOut, payerIsUser = true }) {
  const path = encodeV3Path(tokenIn, fee, tokenOut)
  return encodeAbiParameters(
    ['address', 'uint256', 'uint256', 'bytes', 'bool'],
    [
      toEvmHex(recipient, networkKey),
      amountIn.toString(),
      amountOutMin.toString(),
      path,
      payerIsUser,
    ],
  )
}

// 直接调 UniversalRouter.execute(commands, inputs, deadline)
export async function executeUniversalRouter(signerTronWeb, networkKey, { commands, inputs, deadline, callValue = 0, feeLimit = 500_000_000 }) {
  const net = getNetwork(networkKey)
  if (!net.v4.UNIVERSAL_ROUTER) throw new Error('当前网络未配置 UNIVERSAL_ROUTER 地址')
  return callWrite(
    signerTronWeb,
    net.v4.UNIVERSAL_ROUTER,
    universalRouterAbi,
    'execute',
    [commands, inputs, deadline.toString()],
    { feeLimit, callValue },
  )
}

// 高层 helper：单跳 V3 swap exact-in（通过 UniversalRouter + Permit2 模式）
export async function v3SwapExactInViaRouter(signerTronWeb, networkKey, params) {
  const input = encodeV3SwapExactInSingle(networkKey, params)
  const commands = commandBytes([COMMAND.V3_SWAP_EXACT_IN])
  const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 600
  return executeUniversalRouter(signerTronWeb, networkKey, {
    commands,
    inputs: [input],
    deadline,
    callValue: params.callValue || 0,
  })
}

// 高层 helper：单池 V4 swap exact-in（通过 UniversalRouter，V4_SWAP 命令）
// 内部编码 action plan = [CL_SWAP_EXACT_IN_SINGLE, SETTLE(input,OPEN_DELTA,user), TAKE(output,recipient,OPEN_DELTA)]
// 入参 poolKey 内的 currency0/currency1 可以未排序（会自动按字节序排）
// 如果输入 token 是 native TRX，自动把 amountIn 作为 callValue
export async function v4SwapExactInViaRouter(signerTronWeb, networkKey, {
  recipient, poolKey, zeroForOne, amountIn, amountOutMin,
  hookData = '0x', deadline, feeLimit = 500_000_000,
}) {
  const { input, sortedPoolKey } = encodeV4SwapExactInSingleInput(networkKey, {
    poolKey, zeroForOne, amountIn, amountOutMinimum: amountOutMin, recipient, hookData,
  })
  // 输入 currency 是 native 时通过 callValue 注入 TRX，而不是从 user 转 ERC20
  const inputCurrencyRaw = zeroForOne ? sortedPoolKey.currency0 : sortedPoolKey.currency1
  const callValue = isNativeTrxAddress(inputCurrencyRaw) ? Number(amountIn) : 0
  const commands = commandBytes([COMMAND.V4_SWAP])
  const dl = deadline ?? Math.floor(Date.now() / 1000) + 600
  return executeUniversalRouter(signerTronWeb, networkKey, {
    commands,
    inputs: [input],
    deadline: dl,
    callValue,
    feeLimit,
  })
}
