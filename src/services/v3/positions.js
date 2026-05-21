// V3 NonfungiblePositionManager.mint 封装
// 流程：
//   1) 确认两 token 对 NFPM 的 ERC20 allowance（不够则 approve max）
//   2) NFPM.mint(MintParams) —— 链上会按当前 sqrtPrice 在 [tickLower, tickUpper] 内计算 L
//      并从用户钱包扣 token0/token1（不超过 amount0Desired/amount1Desired）

import nfpmAbi from '../../config/abis/v3Nfpm.json'
import erc20Abi from '../../config/abis/erc20.json'
import { callRead, callWrite } from '../../lib/contract'
import { getNetwork } from '../../config/networks'
import { toEvmHex } from '../../lib/addr'

const MAX_UINT256 = (1n << 256n) - 1n

function nfpmAddr(networkKey) {
  const net = getNetwork(networkKey)
  if (!net.v3.NFPM) throw new Error('该网络未配置 V3 NFPM 地址')
  return net.v3.NFPM
}

export async function getErc20AllowanceTo(networkKey, ownerBase58, tokenBase58, spenderBase58) {
  const r = await callRead(networkKey, tokenBase58, erc20Abi, 'allowance', [
    toEvmHex(ownerBase58, networkKey),
    toEvmHex(spenderBase58, networkKey),
  ])
  return Object.values(r)[0]
}

export async function approveErc20To(signerTronWeb, networkKey, tokenBase58, spenderBase58, amount = MAX_UINT256) {
  return callWrite(signerTronWeb, tokenBase58, erc20Abi, 'approve', [
    toEvmHex(spenderBase58, networkKey),
    amount.toString(),
  ], { networkKey })
}

// 同时确保 token0/token1 → NFPM 的 ERC20 授权
export async function ensureNfpmApprovals(signerTronWeb, networkKey, ownerBase58, token0, token1, amount0, amount1) {
  const spender = nfpmAddr(networkKey)
  const txs = {}
  if (amount0 > 0n) {
    const a0 = await getErc20AllowanceTo(networkKey, ownerBase58, token0, spender)
    if (a0 < amount0) txs.approve0 = await approveErc20To(signerTronWeb, networkKey, token0, spender)
  }
  if (amount1 > 0n) {
    const a1 = await getErc20AllowanceTo(networkKey, ownerBase58, token1, spender)
    if (a1 < amount1) txs.approve1 = await approveErc20To(signerTronWeb, networkKey, token1, spender)
  }
  return txs
}

// V3 NFPM.mint
// params: { token0, token1, fee, tickLower, tickUpper, amount0Desired, amount1Desired, amount0Min, amount1Min, recipient, deadline }
// 所有 amount 都是 BigInt raw（已乘 10^dec），address 是 base58 T... 或 0x...
export async function mintV3Position(signerTronWeb, networkKey, params) {
  const spender = nfpmAddr(networkKey)
  const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 600
  const args = {
    token0: toEvmHex(params.token0, networkKey),
    token1: toEvmHex(params.token1, networkKey),
    fee: Number(params.fee),
    tickLower: Number(params.tickLower),
    tickUpper: Number(params.tickUpper),
    amount0Desired: params.amount0Desired.toString(),
    amount1Desired: params.amount1Desired.toString(),
    amount0Min: (params.amount0Min ?? 0n).toString(),
    amount1Min: (params.amount1Min ?? 0n).toString(),
    recipient: toEvmHex(params.recipient, networkKey),
    deadline: deadline.toString(),
  }
  return callWrite(signerTronWeb, spender, nfpmAbi, 'mint', [args], {
    networkKey,
    feeLimit: params.feeLimit ?? 800_000_000,
    callValue: params.callValue ?? 0,
  })
}
