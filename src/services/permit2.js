// Permit2 AllowanceTransfer 流程封装
// 两步授权：
//   1) ERC20.approve(Permit2, maxUint256)      —— 每个 token 一次性
//   2) Permit2.approve(token, UniversalRouter, uint160 amount, uint48 expiration)
//      —— 每个 (token, spender) 一次性（直到过期或被撤）

import erc20Abi from '../config/abis/erc20.json'
import permit2Abi from '../config/abis/v4Permit2.json'
import { callRead, callWrite } from '../lib/contract'
import { getNetwork } from '../config/networks'
import { toEvmHex } from '../lib/addr'

export const MAX_UINT256 = (1n << 256n) - 1n
export const MAX_UINT160 = (1n << 160n) - 1n
export const DEFAULT_EXPIRATION_SECONDS = 30 * 24 * 3600 // 30 天

function getPermit2Addr(networkKey) {
  const net = getNetwork(networkKey)
  if (!net.v4.PERMIT2) throw new Error('当前网络未配置 PERMIT2 地址')
  return net.v4.PERMIT2
}
function getUniversalRouterAddr(networkKey) {
  const net = getNetwork(networkKey)
  if (!net.v4.UNIVERSAL_ROUTER) throw new Error('当前网络未配置 UNIVERSAL_ROUTER 地址')
  return net.v4.UNIVERSAL_ROUTER
}

// ERC20.allowance(owner, Permit2) → BigInt
export async function getErc20AllowanceToPermit2(networkKey, ownerBase58, tokenBase58) {
  const permit2 = getPermit2Addr(networkKey)
  const r = await callRead(networkKey, tokenBase58, erc20Abi, 'allowance', [
    toEvmHex(ownerBase58, networkKey),
    toEvmHex(permit2, networkKey),
  ])
  return Object.values(r)[0]
}

// ERC20.approve(Permit2, max)
export async function approveErc20ToPermit2(signerTronWeb, networkKey, tokenBase58, amount = MAX_UINT256) {
  const permit2 = getPermit2Addr(networkKey)
  return callWrite(signerTronWeb, tokenBase58, erc20Abi, 'approve', [
    toEvmHex(permit2, networkKey),
    amount.toString(),
  ])
}

// Permit2.allowance(owner, token, UniversalRouter) → { amount, expiration, nonce }
export async function getPermit2AllowanceForRouter(networkKey, ownerBase58, tokenBase58) {
  const permit2 = getPermit2Addr(networkKey)
  const router = getUniversalRouterAddr(networkKey)
  return callRead(networkKey, permit2, permit2Abi, 'allowance', [
    toEvmHex(ownerBase58, networkKey),
    toEvmHex(tokenBase58, networkKey),
    toEvmHex(router, networkKey),
  ])
}

// Permit2.approve(token, UniversalRouter, amount, expiration)
export async function approveRouterViaPermit2(
  signerTronWeb,
  networkKey,
  tokenBase58,
  amount = MAX_UINT160,
  expirationSec,
) {
  const permit2 = getPermit2Addr(networkKey)
  const router = getUniversalRouterAddr(networkKey)
  const exp = expirationSec ?? Math.floor(Date.now() / 1000) + DEFAULT_EXPIRATION_SECONDS
  return callWrite(signerTronWeb, permit2, permit2Abi, 'approve', [
    toEvmHex(tokenBase58, networkKey),
    toEvmHex(router, networkKey),
    amount.toString(),
    exp.toString(),
  ])
}

// 一次性 ensure：自动补齐两步授权（只有缺失或不够才发送交易）
export async function ensurePermit2Approvals(signerTronWeb, networkKey, ownerBase58, tokenBase58, amount) {
  const txs = { erc20Approve: null, permit2Approve: null }
  const erc20Allow = await getErc20AllowanceToPermit2(networkKey, ownerBase58, tokenBase58)
  if (erc20Allow < amount) {
    txs.erc20Approve = await approveErc20ToPermit2(signerTronWeb, networkKey, tokenBase58)
  }
  const p2Allow = await getPermit2AllowanceForRouter(networkKey, ownerBase58, tokenBase58)
  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  if (p2Allow.amount < amount || p2Allow.expiration < nowSec) {
    txs.permit2Approve = await approveRouterViaPermit2(signerTronWeb, networkKey, tokenBase58)
  }
  return txs
}
