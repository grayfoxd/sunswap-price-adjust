// V3 Pool 读取：通过 Factory 找 pool 地址，再读 slot0 / liquidity

import factoryAbi from '../../config/abis/v3Factory.json'
import poolAbi from '../../config/abis/v3Pool.json'
import { callRead } from '../../lib/contract'
import { getNetwork } from '../../config/networks'
import { ZERO_EVM_ADDRESS, fromEvmHex } from '../../lib/addr'

export async function getV3PoolAddress(networkKey, tokenA, tokenB, fee) {
  const net = getNetwork(networkKey)
  if (!net.v3.FACTORY) throw new Error('该网络未配置 V3 FACTORY 地址')
  const r = await callRead(networkKey, net.v3.FACTORY, factoryAbi, 'getPool', [tokenA, tokenB, fee])
  const evmHex = r.pool || Object.values(r)[0]
  if (!evmHex || evmHex.toLowerCase() === ZERO_EVM_ADDRESS) {
    throw new Error('该参数的池子不存在')
  }
  return fromEvmHex(evmHex, networkKey)
}

export async function getV3Slot0(networkKey, poolBase58) {
  return callRead(networkKey, poolBase58, poolAbi, 'slot0', [])
}
export async function getV3Liquidity(networkKey, poolBase58) {
  return callRead(networkKey, poolBase58, poolAbi, 'liquidity', [])
}
// 4 个字段独立查询，任何单个失败不影响其他；返回的 errors map 便于排查
export async function getV3PoolMeta(networkKey, poolBase58) {
  const out = { token0: null, token1: null, fee: null, tickSpacing: null, errors: {} }
  async function safe(name) {
    try {
      const r = await callRead(networkKey, poolBase58, poolAbi, name, [])
      const v = Object.values(r)[0]
      if (name === 'fee' || name === 'tickSpacing') out[name] = Number(v)
      else out[name] = v
    } catch (e) {
      out.errors[name] = e.message || String(e)
      console.warn(`V3 pool.${name}() failed:`, e)
    }
  }
  await Promise.all([safe('token0'), safe('token1'), safe('fee'), safe('tickSpacing')])
  return out
}
