// 功能 ④：流动性辅助
// 输入价格区间 + 一边 token 数量 → 计算 L 与另一边数量；
// 支持单边场景（当前价不在区间内时只需要一种 token）
//
// 执行：标记 V3/V4 mint/burn 流程的合约方法与参数，提示用户在官方 UI 完成（PositionManager 的编码复杂度过高，
// 留作后续扩展）

import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Card, Descriptions, Divider, Form, Input, InputNumber, Radio, Space, Tag } from 'antd'
import Decimal from 'decimal.js'
import { useStore } from '../state/store'
import { humanPriceToSqrtPriceX96, sqrtPriceX96ToHumanPrice } from '../math/sqrtPrice'
import { getSqrtRatioAtTick, getTickAtSqrtRatio, alignTick } from '../math/tickMath'
import { getAmountsForLiquidity, getLiquidityForAmounts } from '../math/liquidityMath'

function rawToHuman(raw, dec) {
  return new Decimal(raw.toString()).div(new Decimal(10).pow(dec)).toSignificantDigits(18).toString()
}
function humanToRaw(human, dec) {
  return BigInt(new Decimal(human).mul(new Decimal(10).pow(dec)).floor().toFixed(0))
}

export default function Liquidity() {
  const network = useStore((s) => s.network)

  const [dec0, setDec0] = useState(18)
  const [dec1, setDec1] = useState(6)
  const [tickSpacing, setTickSpacing] = useState(60)
  const [mode, setMode] = useState('price') // 'price' | 'tick'

  const [lowerPrice, setLowerPrice] = useState('3000')
  const [upperPrice, setUpperPrice] = useState('4000')
  const [tickLower, setTickLower] = useState(null)
  const [tickUpper, setTickUpper] = useState(null)

  const [currentPrice, setCurrentPrice] = useState('3623')
  const [currentSqrt, setCurrentSqrt] = useState('')

  const [inputSide, setInputSide] = useState('token0') // 'token0' | 'token1'
  const [inputAmount, setInputAmount] = useState('1')

  const [err, setErr] = useState('')

  // 计算 tickLower / tickUpper（与 price 双向同步）
  useEffect(() => {
    try {
      if (mode === 'price') {
        const sl = humanPriceToSqrtPriceX96(lowerPrice, dec0, dec1)
        const su = humanPriceToSqrtPriceX96(upperPrice, dec0, dec1)
        const tl = alignTick(getTickAtSqrtRatio(sl), tickSpacing)
        const tu = alignTick(getTickAtSqrtRatio(su), tickSpacing)
        setTickLower(tl); setTickUpper(tu)
      }
    } catch (e) { setErr(e.message) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowerPrice, upperPrice, dec0, dec1, tickSpacing, mode])

  useEffect(() => {
    try {
      if (mode === 'tick' && tickLower != null && tickUpper != null) {
        setLowerPrice(sqrtPriceX96ToHumanPrice(getSqrtRatioAtTick(Number(tickLower)), dec0, dec1).toSignificantDigits(18).toString())
        setUpperPrice(sqrtPriceX96ToHumanPrice(getSqrtRatioAtTick(Number(tickUpper)), dec0, dec1).toSignificantDigits(18).toString())
      }
    } catch (e) { setErr(e.message) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickLower, tickUpper, dec0, dec1, mode])

  // 同步 currentSqrt
  useEffect(() => {
    try {
      if (currentPrice) {
        const sq = humanPriceToSqrtPriceX96(currentPrice, dec0, dec1)
        setCurrentSqrt(sq.toString())
      }
    } catch (e) { setErr(e.message) }
  }, [currentPrice, dec0, dec1])

  const result = useMemo(() => {
    setErr('')
    try {
      if (!tickLower || !tickUpper) return null
      if (tickLower === tickUpper) return null
      const sqrtLower = getSqrtRatioAtTick(Math.min(Number(tickLower), Number(tickUpper)))
      const sqrtUpper = getSqrtRatioAtTick(Math.max(Number(tickLower), Number(tickUpper)))
      const sqrtP = BigInt(currentSqrt || '0')
      if (sqrtP === 0n) return null

      const raw = humanToRaw(inputAmount, inputSide === 'token0' ? dec0 : dec1)
      let liquidity
      if (sqrtP <= sqrtLower) {
        // 全 token0
        if (inputSide !== 'token0') return { error: '当前价低于下界，只需提供 token0' }
        liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, raw, 0n)
      } else if (sqrtP >= sqrtUpper) {
        // 全 token1
        if (inputSide !== 'token1') return { error: '当前价高于上界，只需提供 token1' }
        liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, 0n, raw)
      } else {
        // 范围内：仅用输入侧反推 L
        if (inputSide === 'token0') liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, raw, 1n << 127n)
        else liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, 1n << 127n, raw)
      }
      const amounts = getAmountsForLiquidity(sqrtP, sqrtLower, sqrtUpper, liquidity)
      return {
        liquidity,
        amount0Raw: amounts.amount0,
        amount1Raw: amounts.amount1,
        amount0Human: rawToHuman(amounts.amount0, dec0),
        amount1Human: rawToHuman(amounts.amount1, dec1),
        sqrtLower, sqrtUpper, sqrtP,
      }
    } catch (e) {
      return { error: e.message }
    }
  }, [tickLower, tickUpper, currentSqrt, inputAmount, inputSide, dec0, dec1])

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>④ 流动性辅助</h2>
      <p style={{ color: '#888' }}>
        计算给定价格区间下，单边输入 token 数量后对应的 liquidity L 与另一边数量。
        当前价不在区间内时支持单边场景。
      </p>

      <Card title="基本参数" size="small" style={{ marginBottom: 16 }}>
        <Space size="large" wrap>
          <Form.Item label="token0 decimals" style={{ marginBottom: 0 }}>
            <InputNumber min={0} max={36} value={dec0} onChange={(v) => setDec0(Number(v) || 0)} />
          </Form.Item>
          <Form.Item label="token1 decimals" style={{ marginBottom: 0 }}>
            <InputNumber min={0} max={36} value={dec1} onChange={(v) => setDec1(Number(v) || 0)} />
          </Form.Item>
          <Form.Item label="tickSpacing" style={{ marginBottom: 0 }}>
            <InputNumber min={1} max={10000} value={tickSpacing} onChange={(v) => setTickSpacing(Number(v) || 1)} />
          </Form.Item>
          <Form.Item label="当前价 (token1/token0)" style={{ marginBottom: 0 }}>
            <Input value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} style={{ width: 200 }} />
          </Form.Item>
        </Space>
      </Card>

      <Card title="价格区间" size="small" style={{ marginBottom: 16 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ marginBottom: 12 }}>
          <Radio.Button value="price">按 price 输入</Radio.Button>
          <Radio.Button value="tick">按 tick 输入</Radio.Button>
        </Radio.Group>
        <Space size="large" wrap>
          {mode === 'price' ? (
            <>
              <Form.Item label="下界 price">
                <Input value={lowerPrice} onChange={(e) => setLowerPrice(e.target.value)} style={{ width: 200 }} />
              </Form.Item>
              <Form.Item label="上界 price">
                <Input value={upperPrice} onChange={(e) => setUpperPrice(e.target.value)} style={{ width: 200 }} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item label="tickLower">
                <InputNumber value={tickLower} onChange={(v) => setTickLower(v)} style={{ width: 200 }} />
              </Form.Item>
              <Form.Item label="tickUpper">
                <InputNumber value={tickUpper} onChange={(v) => setTickUpper(v)} style={{ width: 200 }} />
              </Form.Item>
            </>
          )}
        </Space>
        <div style={{ color: '#888' }}>
          tickLower={tickLower} tickUpper={tickUpper}
          {(tickLower != null && tickUpper != null) && Number(tickLower) % tickSpacing !== 0 && (
            <Tag color="orange" style={{ marginLeft: 8 }}>tickLower 未对齐 spacing</Tag>
          )}
        </div>
      </Card>

      <Card title="输入金额" size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Radio.Group value={inputSide} onChange={(e) => setInputSide(e.target.value)}>
            <Radio.Button value="token0">token0</Radio.Button>
            <Radio.Button value="token1">token1</Radio.Button>
          </Radio.Group>
          <Input value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} placeholder="例如 1" style={{ width: 200 }} />
        </Space>
      </Card>

      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}

      {result && result.error && <Alert type="warning" message={result.error} showIcon />}
      {result && !result.error && (
        <Card title="计算结果" size="small">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="liquidity L"><span className="value-mono">{result.liquidity.toString()}</span></Descriptions.Item>
            <Descriptions.Item label="需要 token0 数量">
              <span className="value-mono">{result.amount0Human}</span>
              <Tag style={{ marginLeft: 8 }}>raw: {result.amount0Raw.toString()}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="需要 token1 数量">
              <span className="value-mono">{result.amount1Human}</span>
              <Tag style={{ marginLeft: 8 }}>raw: {result.amount1Raw.toString()}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="sqrtLower / sqrtUpper">
              <span className="value-mono">{result.sqrtLower.toString()}</span>
              <span> ... </span>
              <span className="value-mono">{result.sqrtUpper.toString()}</span>
            </Descriptions.Item>
            <Descriptions.Item label="当前 sqrtPriceX96">
              <span className="value-mono">{result.sqrtP.toString()}</span>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Divider />
      <Alert
        type="info"
        showIcon
        message="mint / burn 执行"
        description={
          <div>
            <p>本页面提供 liquidity 数量计算（L、amount0、amount1）。<b>实际 mint / burn 的链上调用</b>涉及：</p>
            <ul>
              <li>V3：<code>NonfungiblePositionManager.mint/increaseLiquidity/decreaseLiquidity/collect/burn</code></li>
              <li>V4：<code>CLPositionManager.modifyLiquidities(MINT_POSITION/BURN_POSITION + SETTLE_PAIR/TAKE_PAIR)</code></li>
            </ul>
            <p>这部分编码复杂度高，建议拿到本页计算出的数量后到官方 UI 提交；
            后续版本会在 services/v3/positions.js 和 services/v4/positions.js 内补全。</p>
          </div>
        }
      />
    </div>
  )
}
