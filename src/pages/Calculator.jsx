// 功能 ②：价格计算器（美化版）
// 三个独立"输入依据"，任意编辑一个其余自动同步。

import React, { useState } from 'react'
import {
  Alert, Button, Card, Col, Form, Input, InputNumber, Row, Space, Statistic, Tag, Tooltip, Typography,
} from 'antd'
import {
  CalculatorOutlined, FunctionOutlined, NumberOutlined, SwapOutlined,
  CheckCircleFilled, ExclamationCircleOutlined, ThunderboltOutlined, AimOutlined,
} from '@ant-design/icons'
import Decimal from 'decimal.js'
import {
  humanPriceToSqrtPriceX96, sqrtPriceX96ToHumanPrice,
} from '../math/sqrtPrice'
import {
  getSqrtRatioAtTick, getTickAtSqrtRatio, alignTick,
  MIN_TICK, MAX_TICK, MIN_SQRT_RATIO, MAX_SQRT_RATIO,
} from '../math/tickMath'

Decimal.set({ precision: 80 })
const { Text, Title } = Typography
const TICK_SPACING_PRESETS = [1, 10, 50, 60, 200]

// 智能数字格式化
function fmtHuman(n) {
  if (n === null || n === undefined || n === '') return '—'
  let d
  try { d = new Decimal(n) } catch { return String(n) }
  if (d.isZero()) return '0'
  const abs = d.abs()
  if (abs.gte('0.0001') && abs.lt('1e9')) {
    const fixed = d.toSignificantDigits(8).toFixed()
    return Number(fixed).toLocaleString('en-US', { maximumFractionDigits: 8 })
  }
  return d.toSignificantDigits(8).toExponential()
}

function shortenStr(s, head = 22, tail = 8) {
  if (!s) return '—'
  return s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s
}

// 卡片配色
const CARD_STYLES = {
  human: { borderTop: '3px solid #1677ff', background: 'linear-gradient(180deg, #f0f7ff 0%, #ffffff 30%)' },
  sqrt:  { borderTop: '3px solid #722ed1', background: 'linear-gradient(180deg, #f8f3ff 0%, #ffffff 30%)' },
  tick:  { borderTop: '3px solid #fa8c16', background: 'linear-gradient(180deg, #fff7e6 0%, #ffffff 30%)' },
  hero:  { background: 'linear-gradient(135deg, #1677ff 0%, #722ed1 100%)', color: '#fff', border: 'none' },
}

export default function Calculator() {
  const [dec0, setDec0] = useState(6)
  const [dec1, setDec1] = useState(6)
  const [tickSpacing, setTickSpacing] = useState(10)

  const [sqrt, setSqrt] = useState(() => humanPriceToSqrtPriceX96('1', 6, 6))
  const [humanInput, setHumanInput] = useState('1')
  const [invHumanInput, setInvHumanInput] = useState('1')
  const [sqrtInput, setSqrtInput] = useState(() => humanPriceToSqrtPriceX96('1', 6, 6).toString())
  const [tickInput, setTickInput] = useState(() => getTickAtSqrtRatio(humanPriceToSqrtPriceX96('1', 6, 6)).toString())
  const [warns, setWarns] = useState({})
  const [lastEdited, setLastEdited] = useState(null)

  function syncFromSqrt(newSqrt, source) {
    setSqrt(newSqrt)
    setLastEdited(source)
    if (source !== 'sqrt') setSqrtInput(newSqrt.toString())
    try {
      const t = getTickAtSqrtRatio(newSqrt)
      if (source !== 'tick') setTickInput(t.toString())
    } catch {}
    try {
      const hp = sqrtPriceX96ToHumanPrice(newSqrt, dec0, dec1)
      if (source !== 'human') setHumanInput(hp.toSignificantDigits(15).toString())
      if (source !== 'invHuman') {
        setInvHumanInput(hp.isZero() ? '' : new Decimal(1).div(hp).toSignificantDigits(15).toString())
      }
    } catch {}
    setWarns({})
  }
  function setWarn(field, msg) { setWarns((w) => ({ ...w, [field]: msg })) }
  function clearWarn(field) { setWarns((w) => { const n = { ...w }; delete n[field]; return n }) }

  function onHumanChange(v) {
    setHumanInput(v)
    if (!v.trim()) { setWarn('human', '空值'); return }
    const n = Number(v)
    if (!isFinite(n) || n <= 0) { setWarn('human', '需要正数'); return }
    try {
      const sq = humanPriceToSqrtPriceX96(v, dec0, dec1)
      if (sq < MIN_SQRT_RATIO || sq > MAX_SQRT_RATIO) { setWarn('human', '换算后 sqrtPriceX96 越界'); return }
      clearWarn('human'); syncFromSqrt(sq, 'human')
    } catch (e) { setWarn('human', e.message) }
  }
  function onInvHumanChange(v) {
    setInvHumanInput(v)
    if (!v.trim()) { setWarn('invHuman', '空值'); return }
    const n = Number(v)
    if (!isFinite(n) || n <= 0) { setWarn('invHuman', '需要正数'); return }
    try {
      const hp = new Decimal(1).div(v).toFixed()
      const sq = humanPriceToSqrtPriceX96(hp, dec0, dec1)
      if (sq < MIN_SQRT_RATIO || sq > MAX_SQRT_RATIO) { setWarn('invHuman', '换算后 sqrtPriceX96 越界'); return }
      clearWarn('invHuman'); syncFromSqrt(sq, 'invHuman')
    } catch (e) { setWarn('invHuman', e.message) }
  }
  function onSqrtChange(v) {
    setSqrtInput(v)
    if (!/^\d+$/.test(v.trim())) { setWarn('sqrt', '需要非负整数'); return }
    try {
      const sq = BigInt(v.trim())
      if (sq < MIN_SQRT_RATIO) { setWarn('sqrt', `小于 MIN_SQRT_RATIO`); return }
      if (sq > MAX_SQRT_RATIO) { setWarn('sqrt', `大于 MAX_SQRT_RATIO`); return }
      clearWarn('sqrt'); syncFromSqrt(sq, 'sqrt')
    } catch (e) { setWarn('sqrt', e.message) }
  }
  function onTickChange(v) {
    setTickInput(v)
    if (!/^-?\d+$/.test(v.trim())) { setWarn('tick', '需要整数'); return }
    const t = Number(v)
    if (t < MIN_TICK) { setWarn('tick', `小于 MIN_TICK (${MIN_TICK})`); return }
    if (t > MAX_TICK) { setWarn('tick', `大于 MAX_TICK (${MAX_TICK})`); return }
    try {
      const sq = getSqrtRatioAtTick(t)
      clearWarn('tick'); syncFromSqrt(sq, 'tick')
    } catch (e) { setWarn('tick', e.message) }
  }
  function onDecimalsChange(d0, d1) {
    setDec0(d0); setDec1(d1)
    try {
      const hp = sqrtPriceX96ToHumanPrice(sqrt, d0, d1)
      setHumanInput(hp.toSignificantDigits(15).toString())
      setInvHumanInput(hp.isZero() ? '' : new Decimal(1).div(hp).toSignificantDigits(15).toString())
    } catch {}
  }

  const tickNum = Number(tickInput || '0')
  const aligned = alignTick(tickNum, tickSpacing)
  const isAligned = aligned === tickNum && !warns.tick

  const allOk = Object.keys(warns).length === 0
  const hp = (() => {
    try { return sqrtPriceX96ToHumanPrice(sqrt, dec0, dec1) } catch { return null }
  })()
  const invHp = hp && !hp.isZero() ? new Decimal(1).div(hp) : null
  const rawPrice = (() => {
    try { return new Decimal(sqrt.toString()).pow(2).div(new Decimal(2).pow(192)) } catch { return null }
  })()

  function FieldWarn({ field }) {
    if (!warns[field]) return null
    return (
      <div style={{ color: '#cf1322', fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <ExclamationCircleOutlined /> {warns[field]}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <CalculatorOutlined /> 价格计算器
        </Title>
        <Text type="secondary">三个独立输入依据 · 实时双向同步 · 本地计算无需联网</Text>
      </div>

      {/* Hero: 当前价格大图 */}
      <Card style={{ ...CARD_STYLES.hero, marginBottom: 16, overflow: 'hidden', position: 'relative' }} bodyStyle={{ padding: 24 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={9}>
            <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 4 }}>
              <ThunderboltOutlined /> token1 per token0
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, fontFamily: 'SFMono-Regular, Menlo, monospace', lineHeight: 1.1 }}>
              {fmtHuman(hp)}
            </div>
          </Col>
          <Col xs={0} md={2} style={{ textAlign: 'center', fontSize: 32, opacity: 0.6 }}>
            <SwapOutlined />
          </Col>
          <Col xs={24} md={9}>
            <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 4 }}>
              <ThunderboltOutlined /> token0 per token1
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, fontFamily: 'SFMono-Regular, Menlo, monospace', lineHeight: 1.1 }}>
              {fmtHuman(invHp)}
            </div>
          </Col>
          <Col xs={24} md={4} style={{ textAlign: 'right', opacity: 0.9 }}>
            <div style={{ fontSize: 12 }}>tick</div>
            <div style={{ fontSize: 24, fontFamily: 'SFMono-Regular, Menlo, monospace', fontWeight: 600 }}>{warns.tick ? '—' : tickInput}</div>
            <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>
              {isAligned ? <><CheckCircleFilled /> 对齐 spacing={tickSpacing}</> : `未对齐 (建议 ${aligned})`}
            </div>
          </Col>
        </Row>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: 12, opacity: 0.85 }}>
          <span>sqrtPriceX96 = </span>
          <Tooltip title={sqrtInput}>
            <span className="value-mono">{shortenStr(sqrtInput, 36, 12)}</span>
          </Tooltip>
          <span style={{ marginLeft: 16 }}>raw price (token1Raw/token0Raw) = </span>
          <span className="value-mono">{rawPrice ? rawPrice.toSignificantDigits(10).toString() : '—'}</span>
        </div>
      </Card>

      {/* 设置条 */}
      <Card size="small" style={{ marginBottom: 16, background: '#fafbfc' }} bodyStyle={{ padding: '12px 16px' }}>
        <Space size="middle" wrap>
          <Tag icon={<AimOutlined />} color="default" style={{ padding: '4px 10px' }}>参数</Tag>
          <Form.Item label="token0 decimals" style={{ marginBottom: 0 }}>
            <InputNumber size="small" min={0} max={36} value={dec0} onChange={(v) => onDecimalsChange(Number(v) || 0, dec1)} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item label="token1 decimals" style={{ marginBottom: 0 }}>
            <InputNumber size="small" min={0} max={36} value={dec1} onChange={(v) => onDecimalsChange(dec0, Number(v) || 0)} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item label="tickSpacing" style={{ marginBottom: 0 }}>
            <InputNumber size="small" min={1} max={10000} value={tickSpacing} onChange={(v) => setTickSpacing(Number(v) || 1)} style={{ width: 90 }} />
          </Form.Item>
          <Space size={4}>
            {TICK_SPACING_PRESETS.map((s) => (
              <Tag
                key={s}
                color={s === tickSpacing ? 'blue' : 'default'}
                style={{ cursor: 'pointer' }}
                onClick={() => setTickSpacing(s)}
              >
                {s}
              </Tag>
            ))}
          </Space>
        </Space>
      </Card>

      {/* 三依据 —— 竖向堆叠，每张卡片占整行；内部 label 横排 */}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card
          size="small"
          style={CARD_STYLES.human}
          title={
            <Space>
              <span style={{ background: '#1677ff', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>① 人类价格</span>
              <FunctionOutlined style={{ color: '#1677ff' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>正向 / 反向 双向输入</Text>
              {(lastEdited === 'human' || lastEdited === 'invHuman') && <Tag color="blue">刚刚编辑</Tag>}
            </Space>
          }
        >
          <Row gutter={16} align="middle">
            <Col xs={24} md={12}>
              <Form.Item
                label={<Text strong>正向 <Text type="secondary" style={{ fontWeight: 'normal', marginLeft: 4 }}>token1 / token0</Text></Text>}
                style={{ marginBottom: 0 }}
              >
                <Input
                  size="large"
                  value={humanInput}
                  onChange={(e) => onHumanChange(e.target.value)}
                  placeholder="例如 3623"
                  status={warns.human ? 'error' : ''}
                />
                <FieldWarn field="human" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={<Text strong>反向 <Text type="secondary" style={{ fontWeight: 'normal', marginLeft: 4 }}>token0 / token1</Text></Text>}
                style={{ marginBottom: 0 }}
              >
                <Input
                  size="large"
                  value={invHumanInput}
                  onChange={(e) => onInvHumanChange(e.target.value)}
                  placeholder="例如 0.000276"
                  status={warns.invHuman ? 'error' : ''}
                />
                <FieldWarn field="invHuman" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card
          size="small"
          style={CARD_STYLES.sqrt}
          title={
            <Space>
              <span style={{ background: '#722ed1', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>② sqrtPriceX96</span>
              <FunctionOutlined style={{ color: '#722ed1' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>uint160 (raw on-chain 值)</Text>
              {lastEdited === 'sqrt' && <Tag color="purple">刚刚编辑</Tag>}
            </Space>
          }
        >
          <Row gutter={16} align="middle">
            <Col xs={24} md={18}>
              <Form.Item label={<Text strong>uint160</Text>} style={{ marginBottom: 0 }}>
                <Input
                  size="large"
                  className="value-mono"
                  value={sqrtInput}
                  onChange={(e) => onSqrtChange(e.target.value)}
                  status={warns.sqrt ? 'error' : ''}
                />
                <FieldWarn field="sqrt" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
                <div>MIN = <span className="value-mono">{MIN_SQRT_RATIO.toString()}</span></div>
                <div>MAX = <span className="value-mono">{shortenStr(MAX_SQRT_RATIO.toString(), 20, 6)}</span></div>
              </div>
            </Col>
          </Row>
        </Card>

        <Card
          size="small"
          style={CARD_STYLES.tick}
          title={
            <Space>
              <span style={{ background: '#fa8c16', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 13, fontWeight: 600 }}>③ tick</span>
              <NumberOutlined style={{ color: '#fa8c16' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>int24, sqrtPrice = sqrt(1.0001^tick) · 2^96</Text>
              {lastEdited === 'tick' && <Tag color="orange">刚刚编辑</Tag>}
            </Space>
          }
        >
          <Row gutter={16} align="middle">
            <Col xs={24} md={10}>
              <Form.Item label={<Text strong>int24</Text>} style={{ marginBottom: 0 }}>
                <Input
                  size="large"
                  className="value-mono"
                  value={tickInput}
                  onChange={(e) => onTickChange(e.target.value)}
                  status={warns.tick ? 'error' : ''}
                />
                <FieldWarn field="tick" />
              </Form.Item>
            </Col>
            <Col xs={24} md={14}>
              <Space wrap size={8} align="center">
                {warns.tick ? null : (
                  <>
                    <Tag color={isAligned ? 'success' : 'warning'} icon={isAligned ? <CheckCircleFilled /> : null}>
                      {isAligned ? `对齐 spacing=${tickSpacing}` : '未对齐'}
                    </Tag>
                    {!isAligned && (
                      <Button size="small" type="primary" ghost onClick={() => onTickChange(String(aligned))}>
                        → 对齐到 {aligned}
                      </Button>
                    )}
                  </>
                )}
                <Text type="secondary" style={{ fontSize: 11 }}>范围 [{MIN_TICK}, {MAX_TICK}]</Text>
              </Space>
            </Col>
          </Row>
        </Card>
      </Space>

      {allOk ? (
        <Alert
          style={{ marginTop: 16 }}
          type="success"
          showIcon
          icon={<CheckCircleFilled />}
          message="三依据已同步"
        />
      ) : (
        <Alert
          style={{ marginTop: 16 }}
          type="warning"
          showIcon
          message="部分字段有问题"
          description={Object.entries(warns).map(([k, v]) => `${k}: ${v}`).join(' · ')}
        />
      )}
    </div>
  )
}
