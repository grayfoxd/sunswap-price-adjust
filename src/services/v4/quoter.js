// V4 CLQuoter.quoteExactInputSingle / quoteExactOutputSingle 调用
// 输入 tuple { poolKey, zeroForOne, exactAmount, hookData }
// 实际部署的 CLQuoter（PancakeSwap-style，sunswap-v4-periphery）使用 5 字段 PoolKey：
//   (currency0, currency1, hooks, fee, parameters)
// 参考: sunswap-v4-periphery/contracts/pool-cl/lens/CLQuoter.sol
//       sunswap-v4-core/contracts/types/PoolKey.sol

import quoterAbi from '../../config/abis/v4CLQuoter.json'
import { callRead } from '../../lib/contract'
import { getNetwork } from '../../config/networks'
import { encodeCLPoolParameters } from '../../math/poolId'
import { toEvmHex, ZERO_EVM_ADDRESS } from '../../lib/addr'
import { isNativeTrxAddress, sortPoolKey } from './pool'

function tokenToEvm(base58, networkKey) {
  if (isNativeTrxAddress(base58)) return ZERO_EVM_ADDRESS
  return toEvmHex(base58, networkKey)
}

// 把 PoolKey 转成 Quoter ABI 期望的字段结构（已排过序的 currency0/currency1）
function buildQuoterPoolKey(poolKey, networkKey) {
  const sorted = sortPoolKey(poolKey, networkKey)
  return {
    poolKey: {
      currency0: tokenToEvm(sorted.currency0, networkKey),
      currency1: tokenToEvm(sorted.currency1, networkKey),
      hooks: tokenToEvm(sorted.hooks || ZERO_EVM_ADDRESS, networkKey),
      fee: sorted.fee,
      parameters: encodeCLPoolParameters(sorted.tickSpacing),
    },
    swapped: sorted._swapped,
  }
}

export async function quoteV4ExactInputSingle(networkKey, poolKey, zeroForOne, exactAmount) {
  const net = getNetwork(networkKey)
  if (!net.v4.CL_QUOTER) throw new Error('该网络未配置 V4 CL_QUOTER 地址')

  const { poolKey: pk } = buildQuoterPoolKey(poolKey, networkKey)
  const params = {
    poolKey: pk,
    zeroForOne,
    exactAmount: exactAmount.toString(),
    hookData: '0x',
  }
  return callRead(networkKey, net.v4.CL_QUOTER, quoterAbi, 'quoteExactInputSingle', [params])
}

export async function quoteV4ExactOutputSingle(networkKey, poolKey, zeroForOne, exactAmount) {
  const net = getNetwork(networkKey)
  if (!net.v4.CL_QUOTER) throw new Error('该网络未配置 V4 CL_QUOTER 地址')

  const { poolKey: pk } = buildQuoterPoolKey(poolKey, networkKey)
  const params = {
    poolKey: pk,
    zeroForOne,
    exactAmount: exactAmount.toString(),
    hookData: '0x',
  }
  return callRead(networkKey, net.v4.CL_QUOTER, quoterAbi, 'quoteExactOutputSingle', [params])
}
