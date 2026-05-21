// 添加流动性卡片（嵌入 PushPrice 页面）
// 目标价默认为 current tick 对应的人类价格；可编辑
// 价格区间 = [目标价 × 下限比例, 目标价 × 上限比例]，默认 [10%, 1000%]
// 用户输入单边 token 数量 → 自动算 L 与另一边数量；
// 当目标价不在区间内时只需要一边 token
//
// 执行：根据当前池子 kind 调 V3 NFPM.mint 或 V4 PositionManager.modifyLiquidities

import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Radio, Space, Tag, message } from 'antd'
import Decimal from 'decimal.js'
import { humanPriceToSqrtPriceX96, sqrtPriceX96ToHumanPrice } from '../math/sqrtPrice'
import { getSqrtRatioAtTick, getTickAtSqrtRatio, alignTick, MIN_TICK, MAX_TICK } from '../math/tickMath'
import { getAmountsForLiquidity, getLiquidityForAmounts } from '../math/liquidityMath'
import { mintV3Position, ensureNfpmApprovals } from '../services/v3/positions'
import { mintV4Position } from '../services/v4/positions'
import { isNativeTrxAddress } from '../services/v4/pool'
import { assertWalletMatchesNetwork } from '../lib/contract'

function humanToRaw(human, dec) {
  return BigInt(new Decimal(human).mul(new Decimal(10).pow(dec)).floor().toFixed(0))
}
function rawToHuman(raw, dec) {
  return new Decimal(raw.toString()).div(new Decimal(10).pow(dec)).toSignificantDigits(18).toString()
}

// 应用滑点上调（用作 amountMax）
function bumpUp(raw, slippageBps) {
  if (raw === 0n) return 0n
  return (raw * BigInt(10000 + slippageBps)) / 10000n
}
// 应用滑点下调（用作 amountMin）
function bumpDown(raw, slippageBps) {
  if (raw === 0n) return 0n
  return (raw * BigInt(10000 - slippageBps)) / 10000n
}

export default function AddLiquidityCard({ current, account, signerTronWeb, network, onAfterMint }) {
  const [targetPrice, setTargetPrice] = useState('')
  const [lowerPct, setLowerPct] = useState(10)      // 10%
  const [upperPct, setUpperPct] = useState(1000)    // 1000%
  const [inputSide, setInputSide] = useState('token0')
  const [inputAmount, setInputAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(100)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // 池子切换时重置 + 用 current 价格作为目标价默认值
  useEffect(() => {
    setErr('')
    if (current?.humanPrice) setTargetPrice(current.humanPrice)
    else setTargetPrice('')
    setInputAmount('')
  }, [current?.kind, current?.token0, current?.token1, current?.poolId, current?.poolAddress])

  // 自动跟随 current.humanPrice 直到用户手动改过
  // （这里简化为：每次 current 变化就同步，避免用户被旧值困住）
  useEffect(() => {
    if (current?.humanPrice && !targetPrice) setTargetPrice(current.humanPrice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.humanPrice])

  const tickSpacing = current?.tickSpacing
  const dec0 = current?.dec0
  const dec1 = current?.dec1

  const result = useMemo(() => {
    setErr('')
    if (!current) return null
    if (!current.token0 || !current.token1) return { error: 'V4 poolId 直输模式不支持，请改用 tokens+fee+tickSpacing' }
    if (tickSpacing == null) return { error: '未读取到 tickSpacing' }
    if (dec0 == null || dec1 == null) return { error: 'decimals 未加载' }
    if (!targetPrice) return null
    if (!inputAmount) return null
    const lo = Number(lowerPct)
    const hi = Number(upperPct)
    if (!(lo > 0 && hi > 0 && lo < hi)) return { error: '区间比例无效（要求 0 < 下限 < 上限）' }

    try {
      const tp = new Decimal(targetPrice)
      if (!(tp.gt(0))) return { error: '目标价必须 > 0' }
      const lowerHuman = tp.mul(lo).div(100).toString()
      const upperHuman = tp.mul(hi).div(100).toString()
      const sqrtLowerRaw = humanPriceToSqrtPriceX96(lowerHuman, dec0, dec1)
      const sqrtUpperRaw = humanPriceToSqrtPriceX96(upperHuman, dec0, dec1)
      const tickLowerRaw = getTickAtSqrtRatio(sqrtLowerRaw)
      const tickUpperRaw = getTickAtSqrtRatio(sqrtUpperRaw)
      let tickLower = alignTick(tickLowerRaw, tickSpacing)
      let tickUpper = alignTick(tickUpperRaw, tickSpacing)
      // 边界保护
      if (tickLower < MIN_TICK) tickLower = alignTick(MIN_TICK + tickSpacing, tickSpacing)
      if (tickUpper > MAX_TICK) tickUpper = alignTick(MAX_TICK - tickSpacing, tickSpacing)
      if (tickLower >= tickUpper) return { error: '区间过窄，对齐 tickSpacing 后 tickLower >= tickUpper' }

      const sqrtLower = getSqrtRatioAtTick(tickLower)
      const sqrtUpper = getSqrtRatioAtTick(tickUpper)
      const sqrtP = current.sqrtPriceX96

      const raw = humanToRaw(inputAmount, inputSide === 'token0' ? dec0 : dec1)
      if (raw <= 0n) return { error: '输入数量必须 > 0' }

      let liquidity
      if (sqrtP <= sqrtLower) {
        if (inputSide !== 'token0') return { error: '当前价低于下界，请用 token0 输入' }
        liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, raw, 0n)
      } else if (sqrtP >= sqrtUpper) {
        if (inputSide !== 'token1') return { error: '当前价高于上界，请用 token1 输入' }
        liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, 0n, raw)
      } else {
        // 范围内，仅用输入侧反推 L
        if (inputSide === 'token0') liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, raw, 1n << 127n)
        else liquidity = getLiquidityForAmounts(sqrtP, sqrtLower, sqrtUpper, 1n << 127n, raw)
      }
      if (liquidity <= 0n) return { error: '反推 L 为 0，请检查输入' }

      const amounts = getAmountsForLiquidity(sqrtP, sqrtLower, sqrtUpper, liquidity)

      return {
        lowerHuman, upperHuman,
        tickLower, tickUpper,
        sqrtLower, sqrtUpper,
        liquidity,
        amount0Raw: amounts.amount0,
        amount1Raw: amounts.amount1,
        amount0Human: rawToHuman(amounts.amount0, dec0),
        amount1Human: rawToHuman(amounts.amount1, dec1),
      }
    } catch (e) {
      return { error: e.message || String(e) }
    }
  }, [current, targetPrice, lowerPct, upperPct, inputAmount, inputSide, dec0, dec1, tickSpacing])

  function quickFillTarget(mult) {
    if (!current?.humanPrice) return
    try {
      setTargetPrice(new Decimal(current.humanPrice).mul(mult).toString())
    } catch { /* noop */ }
  }

  async function onAddLiquidity() {
    setErr('')
    if (!signerTronWeb || !account) { message.error('请先连接 TronLink 钱包'); return }
    try { assertWalletMatchesNetwork(signerTronWeb, network) }
    catch (e) { setErr(e.message); message.error(e.message); return }
    if (!result || result.error) { setErr(result?.error || '请先填写完整参数'); return }
    if (!current.fee) { setErr('未读取到 fee'); return }

    const { tickLower, tickUpper, liquidity, amount0Raw, amount1Raw } = result
    const amount0Max = bumpUp(amount0Raw, slippageBps)
    const amount1Max = bumpUp(amount1Raw, slippageBps)
    const amount0Min = bumpDown(amount0Raw, slippageBps)
    const amount1Min = bumpDown(amount1Raw, slippageBps)
    const isV3 = current.kind === 'v3'
    const nativeIn0 = isNativeTrxAddress(current.token0)
    const nativeIn1 = isNativeTrxAddress(current.token1)
    if (isV3 && (nativeIn0 || nativeIn1)) {
      setErr('V3 池子不支持 native TRX，请用 WTRX 包装代币'); return
    }

    Modal.confirm({
      title: `确认添加流动性 (${isV3 ? 'V3 NFPM' : 'V4 PositionManager'})`,
      width: 640,
      content: (
        <div>
          <p>tick 区间：<Tag>{tickLower}</Tag> ~ <Tag>{tickUpper}</Tag>（spacing={tickSpacing}）</p>
          <p>price 区间：{result.lowerHuman} ~ {result.upperHuman}</p>
          <p>liquidity L：<span className="value-mono">{liquidity.toString()}</span></p>
          <p>token0 用量：<span className="value-mono">{result.amount0Human}</span>
            （max <span className="value-mono">{rawToHuman(amount0Max, dec0)}</span>，含 {slippageBps/100}% 缓冲）
            {nativeIn0 ? <Tag color="gold" style={{ marginLeft: 8 }}>native TRX</Tag> : null}</p>
          <p>token1 用量：<span className="value-mono">{result.amount1Human}</span>
            （max <span className="value-mono">{rawToHuman(amount1Max, dec1)}</span>，含 {slippageBps/100}% 缓冲）
            {nativeIn1 ? <Tag color="gold" style={{ marginLeft: 8 }}>native TRX</Tag> : null}</p>
          {isV3 ? (
            <Alert type="info" showIcon style={{ marginTop: 12 }} message="V3 流程：先 ERC20.approve(NFPM) → NFPM.mint(MintParams)" />
          ) : (
            <Alert type="info" showIcon style={{ marginTop: 12 }} message="V4 流程：ERC20.approve(Permit2) + Permit2.approve(PositionManager) → modifyLiquidities([CL_MINT_POSITION, SETTLE_PAIR])" />
          )}
        </div>
      ),
      onOk: async () => {
        let step = 'start'
        try {
          setLoading(true)
          if (isV3) {
            step = 'v3-approvals'
            message.loading({ content: '检查并补齐 ERC20→NFPM 授权...', key: 'mint' })
            await ensureNfpmApprovals(signerTronWeb, network, account, current.token0, current.token1, amount0Max, amount1Max)
            step = 'v3-mint'
            message.loading({ content: '发送 V3 NFPM.mint...', key: 'mint' })
            const txid = await mintV3Position(signerTronWeb, network, {
              token0: current.token0,
              token1: current.token1,
              fee: current.fee,
              tickLower, tickUpper,
              amount0Desired: amount0Max,
              amount1Desired: amount1Max,
              amount0Min, amount1Min,
              recipient: account,
            })
            message.success({ content: `V3 mint 已广播: ${txid}`, key: 'mint', duration: 8 })
          } else {
            step = 'v4-mint'
            message.loading({ content: '检查授权 + 发送 V4 modifyLiquidities...', key: 'mint' })
            const poolKey = {
              currency0: current.token0,
              currency1: current.token1,
              fee: current.fee,
              tickSpacing: current.tickSpacing,
              hooks: current.hooks || undefined,
            }
            const txid = await mintV4Position(signerTronWeb, network, {
              poolKey,
              tickLower, tickUpper,
              liquidity,
              amount0Max,
              amount1Max,
              owner: account,
            })
            message.success({ content: `V4 mint 已广播: ${txid}`, key: 'mint', duration: 8 })
          }
          onAfterMint && onAfterMint()
        } catch (e) {
          console.error(`[mint] step=${step} failed:`, e)
          const msg = `[${step}] ${e?.message || String(e)}`
          message.error({ content: msg, key: 'mint' })
          setErr(msg)
        } finally {
          setLoading(false)
        }
      },
    })
  }

  const inSym0 = current?.symbol0
  const inSym1 = current?.symbol1
  const targetSqrt = (current && targetPrice && dec0 != null && dec1 != null)
    ? (() => { try { return humanPriceToSqrtPriceX96(targetPrice, dec0, dec1) } catch { return null } })()
    : null
  const targetTick = targetSqrt ? getTickAtSqrtRatio(targetSqrt) : null
  const targetTickAligned = (targetTick != null && tickSpacing) ? alignTick(targetTick, tickSpacing) : null

  return (
    <Card title="🪙 添加流动性 (V3 / V4)" size="small" style={{ marginTop: 16 }}>
      <p style={{ color: '#888', marginTop: 0 }}>
        以「目标价」为中心，按下限/上限百分比生成价格区间，给当前池子注入流动性。
        默认目标价 = 当前 tick 的人类价格；可任意编辑。
      </p>

      {!current && <Alert type="info" showIcon message="请先在上方填写池子信息并加载当前状态" />}

      {current && (!current.token0 || !current.token1) && (
        <Alert
          type="warning"
          showIcon
          message="V4 poolId 直输模式不支持添加流动性"
          description="切换到 tokens + fee + tickSpacing 模式重新填写后再使用本功能。"
        />
      )}

      {current?.token0 && current?.token1 && (
        <Form layout="vertical">
          <Space size="large" wrap align="end">
            <Form.Item label={`目标价 (token1/token0 — dec0=${dec0 ?? '?'}, dec1=${dec1 ?? '?'})`} style={{ marginBottom: 0 }}>
              <Input
                style={{ width: 240 }}
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder={current?.humanPrice || '例如 3623'}
              />
            </Form.Item>
            <Form.Item label="下限 %" style={{ marginBottom: 0 }}>
              <InputNumber min={0.0001} max={99.9999} step={1} value={lowerPct} onChange={(v) => setLowerPct(Number(v) || 0)} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item label="上限 %" style={{ marginBottom: 0 }}>
              <InputNumber min={100.0001} max={1000000} step={50} value={upperPct} onChange={(v) => setUpperPct(Number(v) || 0)} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item label="滑点 bps" style={{ marginBottom: 0 }}>
              <InputNumber min={0} max={5000} value={slippageBps} onChange={(v) => setSlippageBps(Number(v) || 0)} style={{ width: 100 }} />
            </Form.Item>
          </Space>

          <div style={{ margin: '8px 0' }}>
            <Space wrap>
              <span style={{ color: '#888' }}>快捷目标价：</span>
              <Tag style={{ cursor: 'pointer' }} onClick={() => quickFillTarget(1)}>= 当前</Tag>
              <Tag style={{ cursor: 'pointer' }} onClick={() => quickFillTarget(0.5)}>× 0.5</Tag>
              <Tag style={{ cursor: 'pointer' }} onClick={() => quickFillTarget(2)}>× 2</Tag>
              <Tag style={{ cursor: 'pointer' }} onClick={() => quickFillTarget(5)}>× 5</Tag>
              <Tag style={{ cursor: 'pointer' }} onClick={() => quickFillTarget(10)}>× 10</Tag>
            </Space>
          </div>

          <Form.Item label="输入金额（选择一边，链上按当前 sqrtP 自动求另一边）" style={{ marginBottom: 12 }}>
            <Space>
              <Radio.Group value={inputSide} onChange={(e) => setInputSide(e.target.value)}>
                <Radio.Button value="token0">{inSym0 ?? 'token0'}</Radio.Button>
                <Radio.Button value="token1">{inSym1 ?? 'token1'}</Radio.Button>
              </Radio.Group>
              <Input
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
                placeholder="human 数量，例如 100"
                style={{ width: 220 }}
              />
            </Space>
          </Form.Item>

          {targetSqrt && (
            <div style={{ color: '#666', marginBottom: 12 }}>
              <Space wrap>
                <span>目标 sqrtPriceX96 = <span className="value-mono">{targetSqrt.toString()}</span></span>
                {targetTick != null && <Tag>tick {targetTick} (aligned {targetTickAligned})</Tag>}
              </Space>
            </div>
          )}

          {result && result.error && <Alert type="warning" showIcon message={result.error} style={{ marginBottom: 12 }} />}

          {result && !result.error && (
            <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
              <Descriptions.Item label="价格区间">
                {result.lowerHuman} ~ {result.upperHuman}
              </Descriptions.Item>
              <Descriptions.Item label="tick 区间">
                <Tag>{result.tickLower}</Tag> ~ <Tag>{result.tickUpper}</Tag>
                <span style={{ color: '#888', marginLeft: 8 }}>spacing={tickSpacing}</span>
              </Descriptions.Item>
              <Descriptions.Item label="liquidity L">
                <span className="value-mono">{result.liquidity.toString()}</span>
              </Descriptions.Item>
              <Descriptions.Item label={`需要 ${inSym0 ?? 'token0'}`}>
                <span className="value-mono">{result.amount0Human}</span>
                <Tag style={{ marginLeft: 8 }}>raw: {result.amount0Raw.toString()}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={`需要 ${inSym1 ?? 'token1'}`}>
                <span className="value-mono">{result.amount1Human}</span>
                <Tag style={{ marginLeft: 8 }}>raw: {result.amount1Raw.toString()}</Tag>
              </Descriptions.Item>
            </Descriptions>
          )}

          <Button
            type="primary"
            onClick={onAddLiquidity}
            loading={loading}
            disabled={!result || !!result.error || !account}
          >
            添加流动性 ({current.kind?.toUpperCase()})
          </Button>

          {err && <Alert style={{ marginTop: 12 }} type="error" showIcon message={err} />}
        </Form>
      )}
    </Card>
  )
}
