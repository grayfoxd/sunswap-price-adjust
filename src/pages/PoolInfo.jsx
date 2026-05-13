// 功能 ①：查询当前池子价格
// V3: factory.getPool(t0, t1, fee) → pool.slot0 + pool.liquidity
// V4: PoolKey → poolId → PoolManager.getSlot0 + getLiquidity

import React, { useState } from 'react'
import { Button, Space, Alert, Divider } from 'antd'
import PoolSelector from '../components/PoolSelector.jsx'
import PriceCard from '../components/PriceCard.jsx'
import { useStore } from '../state/store'
import { getV4Slot0, getV4Liquidity, getTokenDecimals, isNativeTrxAddress } from '../services/v4/pool'
import { getV3PoolAddress, getV3Slot0, getV3Liquidity, getV3PoolMeta } from '../services/v3/pool'
import { sqrtPriceX96ToHumanPrice } from '../math/sqrtPrice'
import { fromEvmHex } from '../lib/addr'
import { findToken } from '../config/tokens'
import erc20Abi from '../config/abis/erc20.json'
import { callRead } from '../lib/contract'

// 构造一个完整的 tokenInfo：尝试从注册表读，否则查链
async function buildTokenInfo(networkKey, base58Address) {
  // 原生 TRX 特判：不是合约，没有 ERC20 接口
  if (isNativeTrxAddress(base58Address)) {
    return { address: base58Address, symbol: 'TRX', name: 'TRX (native)', decimals: 6, native: true }
  }
  const known = findToken(networkKey, base58Address)
  const info = {
    address: base58Address,
    symbol: known?.symbol,
    name: known?.name,
    decimals: known?.decimals,
  }
  if (info.decimals === undefined) {
    try {
      info.decimals = await getTokenDecimals(networkKey, base58Address)
    } catch {}
  }
  if (!info.symbol) {
    try {
      const r = await callRead(networkKey, base58Address, erc20Abi, 'symbol', [])
      info.symbol = Object.values(r)[0]
    } catch {}
  }
  return info
}

export default function PoolInfo() {
  const network = useStore((s) => s.network)
  const [form, setForm] = useState({ version: 'v4', mode: 'tokens', hooks: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  async function query() {
    setErr('')
    setResult(null)
    setLoading(true)
    try {
      if (form.version === 'v4') {
        if (form.mode === 'poolId') {
          if (!form.poolId) throw new Error('请填写 poolId (0x + 64 hex)')
          const [slot0, liq] = await Promise.all([
            getV4Slot0(network, form.poolId),
            getV4Liquidity(network, form.poolId),
          ])
          const d0 = form.dec0, d1 = form.dec1
          const humanPrice = d0 != null && d1 != null
            ? sqrtPriceX96ToHumanPrice(slot0.sqrtPriceX96, d0, d1).toSignificantDigits(18).toString()
            : null
          setResult({
            ...slot0,
            liquidity: liq.liquidity,
            humanPrice,
            decString: d0 != null && d1 != null ? `dec0=${d0}, dec1=${d1}` : '未填 decimals · 仅展示 raw 数据',
          })
        } else {
          if (!form.token0 || !form.token1 || !form.fee || !form.tickSpacing) {
            throw new Error('请填写 token0/token1/fee/tickSpacing')
          }
          const poolKey = {
            currency0: form.token0,
            currency1: form.token1,
            hooks: form.hooks || undefined,
            fee: form.fee,
            tickSpacing: form.tickSpacing,
          }
          const [slot0, liq, t0Info, t1Info] = await Promise.all([
            getV4Slot0(network, poolKey),
            getV4Liquidity(network, poolKey),
            buildTokenInfo(network, form.token0),
            buildTokenInfo(network, form.token1),
          ])
          let humanPrice = null
          if (t0Info.decimals !== undefined && t1Info.decimals !== undefined) {
            humanPrice = sqrtPriceX96ToHumanPrice(slot0.sqrtPriceX96, t0Info.decimals, t1Info.decimals)
              .toSignificantDigits(18)
              .toString()
          }
          setResult({
            ...slot0,
            liquidity: liq.liquidity,
            token0: t0Info,
            token1: t1Info,
            humanPrice,
            decString: `dec0=${t0Info.decimals ?? '?'}, dec1=${t1Info.decimals ?? '?'}`,
          })
        }
      } else {
        // V3
        let poolAddr = form.poolAddress
        if (form.mode === 'tokens') {
          if (!form.token0 || !form.token1 || !form.fee) throw new Error('请填写 token0/token1/fee')
          poolAddr = await getV3PoolAddress(network, form.token0, form.token1, form.fee)
        }
        if (!poolAddr) throw new Error('池地址未知')
        const [slot0, liq, meta] = await Promise.all([
          getV3Slot0(network, poolAddr),
          getV3Liquidity(network, poolAddr),
          getV3PoolMeta(network, poolAddr),
        ])
        let t0Info, t1Info, humanPrice
        if (meta?.token0) t0Info = await buildTokenInfo(network, fromEvmHex(meta.token0, network))
        if (meta?.token1) t1Info = await buildTokenInfo(network, fromEvmHex(meta.token1, network))
        if (t0Info?.decimals !== undefined && t1Info?.decimals !== undefined) {
          humanPrice = sqrtPriceX96ToHumanPrice(slot0.sqrtPriceX96, t0Info.decimals, t1Info.decimals)
            .toSignificantDigits(18)
            .toString()
        }
        if (meta?.errors && Object.keys(meta.errors).length) {
          console.warn('V3 pool meta partial failure:', meta.errors)
        }
        setResult({
          poolAddress: poolAddr,
          ...slot0,
          liquidity: Object.values(liq)[0],
          fee: meta?.fee ?? undefined,
          tickSpacing: meta?.tickSpacing ?? undefined,
          token0: t0Info,
          token1: t1Info,
          humanPrice,
          decString: t0Info && t1Info ? `dec0=${t0Info.decimals ?? '?'}, dec1=${t1Info.decimals ?? '?'}` : '',
          metaErrors: meta?.errors,
        })
      }
    } catch (e) {
      console.error(e)
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>① 池子信息查询</h2>
      <p style={{ color: '#888' }}>
        读取池子的当前 sqrtPriceX96 / tick / 流动性 / token0&amp;token1 元数据。所有读操作走只读 TronWeb，不需要连接钱包。
      </p>
      <PoolSelector value={form} onChange={setForm} />
      <Space>
        <Button type="primary" onClick={query} loading={loading}>查询</Button>
      </Space>

      <Divider />
      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 16 }} />}
      {result && (
        <PriceCard
          title={`${form.version.toUpperCase()} · ${useStore.getState().network}`}
          data={result}
        />
      )}
    </div>
  )
}
