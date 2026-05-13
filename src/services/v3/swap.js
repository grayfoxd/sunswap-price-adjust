// V3 SwapRouter.exactInputSingle 调用（通过 TronLink 签名）

import routerAbi from '../../config/abis/v3SwapRouter.json'
import erc20Abi from '../../config/abis/erc20.json'
import { callWrite } from '../../lib/contract'
import { getNetwork } from '../../config/networks'
import { toEvmHex } from '../../lib/addr'

export async function ensureV3Allowance(signerTronWeb, networkKey, tokenAddress, ownerBase58, amount) {
  const net = getNetwork(networkKey)
  if (!net.v3.SWAP_ROUTER) throw new Error('该网络未配置 V3 SWAP_ROUTER 地址')
  // 这里使用 EVM hex 形式的 spender 参数（与 ERC20 ABI 对应）
  const spenderHex = toEvmHex(net.v3.SWAP_ROUTER, networkKey)
  return callWrite(signerTronWeb, tokenAddress, erc20Abi, 'approve', [spenderHex, amount.toString()])
}

export async function v3ExactInputSingle(
  signerTronWeb,
  networkKey,
  { tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96 },
) {
  const net = getNetwork(networkKey)
  if (!net.v3.SWAP_ROUTER) throw new Error('该网络未配置 V3 SWAP_ROUTER 地址')
  const params = {
    tokenIn,
    tokenOut,
    fee,
    recipient,
    deadline,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96,
  }
  return callWrite(signerTronWeb, net.v3.SWAP_ROUTER, routerAbi, 'exactInputSingle', [params], { feeLimit: 300_000_000 })
}
