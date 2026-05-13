// 当前池子状态展示卡片（推价页 / 流动性页可复用）
// 突出：双向价格（token1/token0 与 token0/token1），其次 tick + sqrtPrice，最后 liquidity / fee / 池子标识

import React from 'react'
import { Alert, Button, Card, Col, Divider, Row, Statistic, Tag, Tooltip, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import Decimal from 'decimal.js'
import { MIN_SQRT_RATIO, MAX_SQRT_RATIO, MIN_TICK, MAX_TICK } from '../math/tickMath'

const { Text } = Typography

// 判断池子是否"不可用"：未初始化 / 流动性为 0 / 价格被推到上下界
function diagnosePool(c) {
  if (!c) return null
  const issues = []
  const liq = typeof c.liquidity === 'bigint' ? c.liquidity : (c.liquidity != null ? BigInt(c.liquidity) : null)
  const sq = typeof c.sqrtPriceX96 === 'bigint' ? c.sqrtPriceX96 : (c.sqrtPriceX96 != null ? BigInt(c.sqrtPriceX96) : null)
  const tick = c.tick != null ? Number(c.tick) : null

  // V4 mapping 查不存在 key 时全 0；V3 池子不存在则合约调用直接 revert，所以 sq=0 几乎一定是 V4 未初始化
  if (sq === 0n) {
    issues.push('该池子未初始化（PoolManager 返回全 0，对应 poolId 在链上不存在）')
    issues.push('排查：① V4 PoolKey 必须 currency0 < currency1（字节序升序）—— 顺序错了 poolId 也算错；② fee / tickSpacing / hooks 任何一项对不上都会产生不同 poolId；③ 如果你直接粘贴的 poolId，请确认它确实对应已 init 的池子')
    return issues
  }
  if (liq === 0n) issues.push('liquidity = 0 — 池子无流动性（可能未初始化或已抽干）')
  if (sq != null) {
    if (sq <= MIN_SQRT_RATIO + 1n) issues.push('sqrtPriceX96 在下界附近 — 价格已被推至最低')
    else if (sq >= MAX_SQRT_RATIO - 1n) issues.push('sqrtPriceX96 在上界附近 — 价格已被推至最高')
  }
  if (tick === MIN_TICK) issues.push(`tick = ${MIN_TICK} (MIN_TICK) — 价格触底`)
  else if (tick === MAX_TICK) issues.push(`tick = ${MAX_TICK} (MAX_TICK) — 价格触顶`)
  return issues.length ? issues : null
}

// 智能格式化人类可读数字：
// - 0 → "0"
// - |x| ≥ 0.0001 且 |x| < 1e8 → 千分位 + 自动保留 6 位有效数字
// - 其他 → 科学计数
function fmtHuman(n) {
  if (n === null || n === undefined || n === '') return '—'
  let d
  try { d = new Decimal(n) } catch { return String(n) }
  if (d.isZero()) return '0'
  const abs = d.abs()
  if (abs.gte('0.0001') && abs.lt('1e8')) {
    const fixed = d.toSignificantDigits(8).toFixed()
    return Number(fixed).toLocaleString('en-US', { maximumFractionDigits: 8 })
  }
  return d.toSignificantDigits(8).toExponential()
}

function fmtBig(b) {
  if (b === null || b === undefined) return '—'
  const s = typeof b === 'bigint' ? b.toString() : String(b)
  return s
}

// 千分位分组（仅整数部分）
function withGroup(intStr) {
  const neg = intStr.startsWith('-')
  const body = neg ? intStr.slice(1) : intStr
  return (neg ? '-' : '') + body.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function feePct(fee) {
  if (fee === undefined || fee === null) return null
  const n = Number(fee)
  if (!isFinite(n)) return null
  return (n / 10000).toFixed(4).replace(/\.?0+$/, '') + '%'
}

function shortAddr(a) {
  if (!a) return ''
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a
}

export default function PoolStateCard({
  title = '当前池子状态',
  current,
  loading,
  error,
  symbol0,
  symbol1,
  onRefresh,
  refreshDisabled,
}) {
  const s0 = symbol0 || 'token0'
  const s1 = symbol1 || 'token1'

  // 计算逆向价格（token0/token1）
  let inversePrice = null
  if (current?.humanPrice) {
    try {
      const d = new Decimal(current.humanPrice)
      if (!d.isZero()) inversePrice = new Decimal(1).div(d).toString()
    } catch {}
  }

  const feeShown = current ? (current.fee ?? current.lpFee) : null
  const feeP = feePct(feeShown)

  return (
    <Card
      title={title}
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        onRefresh && (
          <Button size="small" icon={<ReloadOutlined />} loading={loading} disabled={refreshDisabled} onClick={onRefresh}>
            刷新
          </Button>
        )
      }
    >
      {refreshDisabled && !current && !loading && (
        <Text type="secondary">填齐池子参数后自动查询</Text>
      )}
      {loading && !current && <Text type="secondary">查询中…</Text>}
      {error && <Alert type="error" message={error} showIcon />}
      {current && (
        <>
          {(() => {
            const issues = diagnosePool(current)
            if (!issues) return null
            return (
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
            )
          })()}
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} md={12}>
              <Statistic
                title={<span>价格 ({s1} per {s0})</span>}
                value={fmtHuman(current.humanPrice)}
                valueStyle={{ fontSize: 24, fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
              />
              {current.humanPrice && (
                <Tooltip title={current.humanPrice}>
                  <Text type="secondary" style={{ fontSize: 11 }}>full: {String(current.humanPrice).slice(0, 32)}{String(current.humanPrice).length > 32 ? '…' : ''}</Text>
                </Tooltip>
              )}
            </Col>
            <Col xs={24} md={12}>
              <Statistic
                title={<span>反向 ({s0} per {s1})</span>}
                value={fmtHuman(inversePrice)}
                valueStyle={{ fontSize: 24, fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace', color: '#666' }}
              />
              {inversePrice && (
                <Tooltip title={inversePrice}>
                  <Text type="secondary" style={{ fontSize: 11 }}>full: {String(inversePrice).slice(0, 32)}{String(inversePrice).length > 32 ? '…' : ''}</Text>
                </Tooltip>
              )}
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={[16, 8]}>
            <Col xs={12} md={6}>
              <Text type="secondary">tick</Text>
              <div className="value-mono" style={{ fontSize: 16 }}>{fmtBig(current.tick)}</div>
            </Col>
            <Col xs={12} md={6}>
              <Text type="secondary">fee</Text>
              <div>
                <Tag color="geekblue" style={{ fontSize: 13, marginRight: 6 }}>{feeP || '—'}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{feeShown ? `${feeShown} pips` : ''}</Text>
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Text type="secondary">tickSpacing</Text>
              <div className="value-mono" style={{ fontSize: 16 }}>{fmtBig(current.tickSpacing) || '—'}</div>
            </Col>
            <Col xs={12} md={6}>
              <Text type="secondary">decimals</Text>
              <div>
                <Tag>dec0={current.dec0 ?? '?'}</Tag>
                <Tag>dec1={current.dec1 ?? '?'}</Tag>
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          <Row gutter={[16, 8]}>
            <Col xs={24} md={12}>
              <Text type="secondary" style={{ display: 'block' }}>liquidity</Text>
              <Tooltip title={String(current.liquidity ?? '')}>
                <Text className="value-mono" style={{ fontSize: 13 }}>{withGroup(fmtBig(current.liquidity))}</Text>
              </Tooltip>
            </Col>
            <Col xs={24} md={12}>
              <Text type="secondary" style={{ display: 'block' }}>sqrtPriceX96</Text>
              <Tooltip title={String(current.sqrtPriceX96 ?? '')}>
                <Text className="value-mono" style={{ fontSize: 12 }}>
                  {(() => { const s = fmtBig(current.sqrtPriceX96); return s.length > 36 ? s.slice(0, 30) + '…' + s.slice(-4) : s })()}
                </Text>
              </Tooltip>
            </Col>
          </Row>

          {(current.poolAddress || current.poolId) && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Row gutter={[16, 4]}>
                {current.poolAddress && (
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12 }}>pool: </Text>
                    <Tooltip title={current.poolAddress}>
                      <Text className="value-mono" style={{ fontSize: 12 }} copyable={{ text: current.poolAddress, tooltips: ['复制', '已复制'] }}>
                        {shortAddr(current.poolAddress)}
                      </Text>
                    </Tooltip>
                  </Col>
                )}
                {current.poolId && (
                  <Col span={24}>
                    <Text type="secondary" style={{ fontSize: 12 }}>poolId: </Text>
                    <Tooltip title={current.poolId}>
                      <Text className="value-mono" style={{ fontSize: 12 }} copyable={{ text: current.poolId, tooltips: ['复制', '已复制'] }}>
                        {shortAddr(current.poolId)}
                      </Text>
                    </Tooltip>
                  </Col>
                )}
              </Row>
            </>
          )}
        </>
      )}
    </Card>
  )
}
