import React from 'react'
import { Alert, Card, Descriptions, Tag } from 'antd'
import { MIN_SQRT_RATIO, MAX_SQRT_RATIO, MIN_TICK, MAX_TICK } from '../math/tickMath'

function diagnose(data) {
  if (!data) return null
  const issues = []
  const liq = data.liquidity != null ? BigInt(data.liquidity) : null
  const sq = data.sqrtPriceX96 != null ? BigInt(data.sqrtPriceX96) : null
  const tick = data.tick != null ? Number(data.tick) : null
  if (sq === 0n) {
    issues.push('该池子未初始化（PoolManager 返回全 0，对应 poolId 在链上不存在）')
    issues.push('排查：① V4 PoolKey 必须 currency0 < currency1（字节序升序）；② fee / tickSpacing / hooks 任何一项对不上都算不出同一个 poolId')
    return issues
  }
  if (liq === 0n) issues.push('liquidity = 0 — 池子无流动性')
  if (sq != null) {
    if (sq <= MIN_SQRT_RATIO + 1n) issues.push('sqrtPriceX96 在下界附近 — 价格已被推至最低')
    else if (sq >= MAX_SQRT_RATIO - 1n) issues.push('sqrtPriceX96 在上界附近 — 价格已被推至最高')
  }
  if (tick === MIN_TICK) issues.push(`tick = ${MIN_TICK} (MIN_TICK) — 触底`)
  else if (tick === MAX_TICK) issues.push(`tick = ${MAX_TICK} (MAX_TICK) — 触顶`)
  return issues.length ? issues : null
}

function TokenInfo({ t }) {
  if (!t) return <span style={{ color: '#888' }}>—</span>
  return (
    <span>
      {t.symbol && <Tag color="blue">{t.symbol}</Tag>}
      {t.name && <span style={{ color: '#888', marginRight: 8 }}>{t.name}</span>}
      <span className="value-mono">{t.address}</span>
      {t.decimals !== undefined && <Tag style={{ marginLeft: 8 }}>dec={t.decimals}</Tag>}
    </span>
  )
}

export default function PriceCard({ title, data }) {
  if (!data) return null
  const issues = diagnose(data)
  return (
    <Card title={title} size="small">
      {issues && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="该池子状态异常 —— 价格数值可能没有实际意义"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {issues.map((it, i) => <li key={i}>{it}</li>)}
              <li style={{ color: '#666' }}>建议换 fee tier 或确认池子是否已初始化 / 有 LP</li>
            </ul>
          }
        />
      )}
      <Descriptions column={1} size="small">
        {data.poolId && (
          <Descriptions.Item label="poolId">
            <span className="value-mono">{data.poolId}</span>
          </Descriptions.Item>
        )}
        {data.poolAddress && (
          <Descriptions.Item label="池地址">
            <span className="value-mono">{data.poolAddress}</span>
          </Descriptions.Item>
        )}
        {data.token0 && (
          <Descriptions.Item label="token0">
            <TokenInfo t={data.token0} />
          </Descriptions.Item>
        )}
        {data.token1 && (
          <Descriptions.Item label="token1">
            <TokenInfo t={data.token1} />
          </Descriptions.Item>
        )}
        <Descriptions.Item label="sqrtPriceX96">
          <span className="value-mono">{data.sqrtPriceX96?.toString?.() ?? '—'}</span>
        </Descriptions.Item>
        <Descriptions.Item label="tick">
          <Tag>{data.tick?.toString?.() ?? '—'}</Tag>
        </Descriptions.Item>
        {data.humanPrice && (
          <Descriptions.Item label={`人类价格 (token1/token0${data.decString ? ` · ${data.decString}` : ''})`}>
            <span className="value-mono">{data.humanPrice}</span>
          </Descriptions.Item>
        )}
        {data.liquidity !== undefined && (
          <Descriptions.Item label="liquidity">
            <span className="value-mono">{data.liquidity.toString()}</span>
          </Descriptions.Item>
        )}
        {data.lpFee !== undefined && (
          <Descriptions.Item label="lpFee / protocolFee">
            <Tag>{data.lpFee?.toString?.()}</Tag>
            <Tag>{data.protocolFee?.toString?.()}</Tag>
          </Descriptions.Item>
        )}
        {data.fee !== undefined && !data.lpFee && (
          <Descriptions.Item label="fee (pips)">
            <Tag>{data.fee?.toString?.()}</Tag>
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  )
}
