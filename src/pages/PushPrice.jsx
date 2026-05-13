// 功能 ③：推动价格至目标
// V3：本地估算 + Quoter 校准 + 一键执行 SwapRouter.exactInputSingle
// V4：本地估算 + Quoter 给参考（实际 swap 执行涉及 UniversalRouter+Permit2，标"预览模式"）

import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Descriptions, Divider, Form, Input, message, Space, Tag, Modal, InputNumber } from 'antd'
import PoolSelector from '../components/PoolSelector.jsx'
import PoolStateCard from '../components/PoolStateCard.jsx'
import { useStore } from '../state/store'
import { humanPriceToSqrtPriceX96, sqrtPriceX96ToHumanPrice } from '../math/sqrtPrice'
import { planV3PushPrice, planV4PushPrice } from '../services/pushPrice'
import { getTokenDecimals, getV4Slot0, getV4Liquidity, isNativeTrxAddress } from '../services/v4/pool'
import { getV3PoolAddress, getV3Slot0, getV3Liquidity, getV3PoolMeta } from '../services/v3/pool'
import { ensurePermit2Approvals } from '../services/permit2'
import { v3SwapExactInViaRouter, v4SwapExactInViaRouter } from '../services/router'
import { toEvmHex, fromEvmHex } from '../lib/addr'
import { getNetwork } from '../config/networks'
import { findToken } from '../config/tokens'
import erc20Abi from '../config/abis/erc20.json'
import { callRead } from '../lib/contract'

async function resolveSymbol(networkKey, base58Address) {
  if (isNativeTrxAddress(base58Address)) return 'TRX'
  const known = findToken(networkKey, base58Address)
  if (known?.symbol) return known.symbol
  try {
    const r = await callRead(networkKey, base58Address, erc20Abi, 'symbol', [])
    return Object.values(r)[0]
  } catch { return null }
}

function fmt(b) {
  if (b === undefined || b === null) return '—'
  if (typeof b === 'bigint') return b.toString()
  return String(b)
}

function formChanged(a, b) {
  return ['version', 'mode', 'poolAddress', 'poolId', 'token0', 'token1', 'fee', 'tickSpacing', 'hooks', 'dec0', 'dec1'].some((k) => a[k] !== b[k])
}

function formReadyToQuery(p) {
  if (p.version === 'v3') {
    if (p.mode === 'address') return !!p.poolAddress
    return !!(p.token0 && p.token1 && p.fee)
  }
  // v4
  if (p.mode === 'poolId') return !!p.poolId
  return !!(p.token0 && p.token1 && p.fee && p.tickSpacing)
}

export default function PushPrice() {
  const network = useStore((s) => s.network)
  const account = useStore((s) => s.account)
  const signerTronWeb = useStore((s) => s.signerTronWeb)

  const [form, setForm] = useState({ version: 'v3', mode: 'tokens', hooks: '' })
  const [targetMode, setTargetMode] = useState('human')
  const [targetHuman, setTargetHuman] = useState('')
  const [targetSqrt, setTargetSqrt] = useState('')
  const [dec0, setDec0] = useState(null)
  const [dec1, setDec1] = useState(null)
  const [current, setCurrent] = useState(null)
  const [currentLoading, setCurrentLoading] = useState(false)
  const [currentErr, setCurrentErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState(null)
  const [slippageBps, setSlippageBps] = useState(100)
  const [err, setErr] = useState('')

  const net = getNetwork(network)
  // 所有 swap 走 UniversalRouter；V3 还需 QUOTER 做 amountIn 校准
  const swapEnabled = !!net.v4.UNIVERSAL_ROUTER && !!net.v4.PERMIT2
  const v3QuoterEnabled = !!net.v3.QUOTER

  // 防抖：表单关键字段稳定 600ms 后查链上当前状态
  const debounceRef = useRef(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!formReadyToQuery(form)) {
      setCurrent(null); setCurrentErr('')
      return
    }
    debounceRef.current = setTimeout(() => fetchCurrent(form), 600)
    return () => clearTimeout(debounceRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.version, form.mode, form.poolAddress, form.poolId, form.token0, form.token1, form.fee, form.tickSpacing, form.hooks, form.dec0, form.dec1, network])

  async function fetchCurrent(p) {
    setCurrentLoading(true); setCurrentErr('')
    try {
      if (p.version === 'v3') {
        let poolAddr = p.poolAddress
        if (p.mode === 'tokens') poolAddr = await getV3PoolAddress(network, p.token0, p.token1, p.fee)
        if (!poolAddr) throw new Error('池地址未知')
        const [slot0, liq, meta] = await Promise.all([
          getV3Slot0(network, poolAddr),
          getV3Liquidity(network, poolAddr),
          getV3PoolMeta(network, poolAddr),
        ])
        let d0, d1, sym0, sym1
        if (meta?.token0 && meta?.token1) {
          const t0b = fromEvmHex(meta.token0, network)
          const t1b = fromEvmHex(meta.token1, network)
          ;[d0, d1, sym0, sym1] = await Promise.all([
            getTokenDecimals(network, t0b),
            getTokenDecimals(network, t1b),
            resolveSymbol(network, t0b),
            resolveSymbol(network, t1b),
          ])
          setDec0(d0); setDec1(d1)
        }
        const humanPrice = d0 != null && d1 != null
          ? sqrtPriceX96ToHumanPrice(slot0.sqrtPriceX96, d0, d1).toSignificantDigits(18).toString()
          : null
        setCurrent({
          kind: 'v3',
          poolAddress: poolAddr,
          sqrtPriceX96: slot0.sqrtPriceX96,
          tick: slot0.tick,
          liquidity: Object.values(liq)[0],
          fee: meta?.fee,
          tickSpacing: meta?.tickSpacing,
          humanPrice,
          dec0: d0, dec1: d1,
          symbol0: sym0, symbol1: sym1,
        })
      } else if (p.mode === 'poolId') {
        // V4 直接 poolId 模式：token 信息未知，仅展示 slot0 + liquidity；decimals 取自表单
        const [slot0, liq] = await Promise.all([
          getV4Slot0(network, p.poolId),
          getV4Liquidity(network, p.poolId),
        ])
        const d0 = p.dec0 ?? null, d1 = p.dec1 ?? null
        setDec0(d0); setDec1(d1)
        const humanPrice = d0 != null && d1 != null
          ? sqrtPriceX96ToHumanPrice(slot0.sqrtPriceX96, d0, d1).toSignificantDigits(18).toString()
          : null
        setCurrent({
          kind: 'v4',
          poolId: slot0.poolId,
          sqrtPriceX96: slot0.sqrtPriceX96,
          tick: slot0.tick,
          liquidity: liq.liquidity,
          lpFee: slot0.lpFee,
          protocolFee: slot0.protocolFee,
          humanPrice,
          dec0: d0, dec1: d1,
        })
      } else {
        const poolKey = {
          currency0: p.token0,
          currency1: p.token1,
          hooks: p.hooks || undefined,
          fee: p.fee,
          tickSpacing: p.tickSpacing,
        }
        const [slot0, liq, d0, d1, sym0, sym1] = await Promise.all([
          getV4Slot0(network, poolKey),
          getV4Liquidity(network, poolKey),
          getTokenDecimals(network, p.token0),
          getTokenDecimals(network, p.token1),
          resolveSymbol(network, p.token0),
          resolveSymbol(network, p.token1),
        ])
        setDec0(d0); setDec1(d1)
        const humanPrice = sqrtPriceX96ToHumanPrice(slot0.sqrtPriceX96, d0, d1).toSignificantDigits(18).toString()
        setCurrent({
          kind: 'v4',
          poolId: slot0.poolId,
          sqrtPriceX96: slot0.sqrtPriceX96,
          tick: slot0.tick,
          liquidity: liq.liquidity,
          lpFee: slot0.lpFee,
          protocolFee: slot0.protocolFee,
          tickSpacing: p.tickSpacing,
          humanPrice,
          dec0: d0, dec1: d1,
          symbol0: sym0, symbol1: sym1,
        })
      }
    } catch (e) {
      setCurrent(null); setCurrentErr(e.message || String(e))
    } finally {
      setCurrentLoading(false)
    }
  }

  function onFormChange(p) {
    const changed = formChanged(form, p)
    setForm(p)
    if (changed) { setPlan(null); setErr('') }
  }

  function computeTargetSqrt() {
    if (targetMode === 'sqrt' && targetSqrt) return BigInt(targetSqrt)
    if (targetMode === 'human' && targetHuman && dec0 != null && dec1 != null) {
      return humanPriceToSqrtPriceX96(targetHuman, dec0, dec1)
    }
    return null
  }

  async function onPlan() {
    setErr(''); setPlan(null); setLoading(true)
    try {
      const sq = computeTargetSqrt()
      if (!sq) throw new Error('请填写目标价格（human 或 sqrtPriceX96），并确保已查到 decimals')
      if (form.version === 'v3') {
        if (!v3QuoterEnabled) throw new Error('当前网络未配置 V3 QUOTER 地址，无法校准估算')
        const r = await planV3PushPrice(network, {
          poolAddress: form.mode === 'address' ? form.poolAddress : null,
          token0: form.token0,
          token1: form.token1,
          fee: form.fee,
          targetSqrtPriceX96: sq.toString(),
        })
        setPlan({ kind: 'v3', ...r })
      } else {
        let poolKey
        if (form.mode === 'poolId') {
          if (!form.poolId) throw new Error('请填写 V4 poolId')
          poolKey = { poolId: form.poolId }
        } else {
          if (!form.token0 || !form.token1 || !form.fee || !form.tickSpacing) {
            throw new Error('V4 需要 token0/token1/fee/tickSpacing')
          }
          poolKey = {
            currency0: form.token0,
            currency1: form.token1,
            hooks: form.hooks || undefined,
            fee: form.fee,
            tickSpacing: form.tickSpacing,
          }
        }
        const r = await planV4PushPrice(network, { poolKey, targetSqrtPriceX96: sq.toString() })
        setPlan({ kind: 'v4', ...r })
      }
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  async function onExecuteV4() {
    if (!plan || plan.kind !== 'v4') return
    if (!signerTronWeb || !account) { message.error('请先连接 TronLink 钱包'); return }
    if (!swapEnabled) { message.error('当前网络缺 UNIVERSAL_ROUTER / PERMIT2 地址'); return }
    if (!plan.poolKey || !plan.tokenIn || !plan.tokenOut) {
      message.error('当前 plan 缺 poolKey/tokenIn —— poolId 直输模式不支持执行，请改回 tokens + fee + tickSpacing'); return
    }
    if (plan.quoter?.skipped || plan.quoter?.error) {
      message.warning({ content: '当前 plan 的 Quoter 校准未完成，无法估算 amountOutMin，建议先解决 Quoter 报错', key: 'tx', duration: 6 })
      return
    }

    // V4 Quoter 在给定 amountIn 下返回 amountOut（没有 sqrtPriceLimitX96，所以可能超调）
    // amountOutMin 用 quoter.amountOut * (1 - slippage)
    const amountIn = plan.quoter?.amountInUsed || plan.estimateLocal
    const amountOutExpected = plan.quoter?.amountOut || 0n
    const minOut = amountOutExpected ? (amountOutExpected * BigInt(10000 - slippageBps)) / 10000n : 0n

    Modal.confirm({
      title: '确认推动价格 (V4 UniversalRouter)',
      width: 620,
      content: (
        <div>
          <p>方向：{plan.zeroForOne ? '卖 token0 换 token1（价格下行）' : '卖 token1 换 token0（价格上行）'}</p>
          <p>tokenIn：<span className="value-mono">{plan.tokenIn}</span>{plan.tokenInIsNative ? <Tag color="gold" style={{ marginLeft: 8 }}>native TRX</Tag> : null}</p>
          <p>tokenOut：<span className="value-mono">{plan.tokenOut}</span></p>
          <p>amountIn：<span className="value-mono">{fmt(amountIn)}</span> {plan.quoter?.amountInUsed ? '(本地估算)' : ''}</p>
          <p>amountOutMin（slippage {slippageBps/100}%）：<span className="value-mono">{fmt(minOut)}</span></p>
          <p>fee / tickSpacing：<Tag>{plan.fee}</Tag> · <Tag>{plan.poolKey.tickSpacing}</Tag></p>
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="V4 swap 没有 sqrtPriceLimit 保护"
            description="V4 的 CL_SWAP_EXACT_IN_SINGLE 不暴露 sqrtPriceLimitX96，amountIn 给多了会越过目标价继续向下/上推。amountOutMin 只能防成交价被砸穿，不能防超调。建议先把目标变动幅度控制在小范围。"
          />
          <p style={{ marginTop: 12 }}>授权步骤：</p>
          <ul style={{ marginTop: 0 }}>
            {plan.tokenInIsNative ? (
              <li>native TRX 通过 <code>msg.value</code> 注入，<b>无需</b> Permit2 授权</li>
            ) : (
              <>
                <li>ERC20.approve(Permit2) — 缺失则发起</li>
                <li>Permit2.approve(token, UniversalRouter, ...) — 缺失/过期则发起</li>
              </>
            )}
            <li>UniversalRouter.execute([V4_SWAP=0x12], [actionPlan], deadline)</li>
            <li>actionPlan = CL_SWAP_EXACT_IN_SINGLE + SETTLE(in, OPEN_DELTA, payerIsUser=true) + TAKE(out, recipient, OPEN_DELTA)</li>
          </ul>
        </div>
      ),
      onOk: async () => {
        try {
          setLoading(true)
          if (!plan.tokenInIsNative) {
            message.loading({ content: '检查并补齐 Permit2 授权...', key: 'tx' })
            const approvals = await ensurePermit2Approvals(signerTronWeb, network, account, plan.tokenIn, amountIn)
            if (approvals.erc20Approve) console.log('ERC20→Permit2 approve tx:', approvals.erc20Approve)
            if (approvals.permit2Approve) console.log('Permit2→Router approve tx:', approvals.permit2Approve)
          }

          message.loading({ content: '发送 UniversalRouter V4 swap 交易...', key: 'tx' })
          const txid = await v4SwapExactInViaRouter(signerTronWeb, network, {
            recipient: account,
            poolKey: plan.poolKey,
            zeroForOne: plan.zeroForOne,
            amountIn,
            amountOutMin: minOut,
          })
          message.success({ content: `V4 swap 已广播: ${txid}`, key: 'tx', duration: 8 })
          fetchCurrent(form)
        } catch (e) {
          message.error({ content: e.message || String(e), key: 'tx' })
        } finally {
          setLoading(false)
        }
      },
    })
  }

  async function onExecuteV3() {
    if (!plan || plan.kind !== 'v3') return
    if (!signerTronWeb || !account) { message.error('请先连接 TronLink 钱包'); return }
    if (!swapEnabled) { message.error('当前网络缺 UNIVERSAL_ROUTER / PERMIT2 地址'); return }
    // 优先使用 Quoter 的"精确 amountIn"（exactOutput 反推）；缺失才回退到本地估算
    const amountIn = plan.quoter?.amountInExact || plan.estimateLocal
    const amountOutExpected = plan.quoter?.amountOut || 0n
    const minOut = amountOutExpected ? (amountOutExpected * BigInt(10000 - slippageBps)) / 10000n : 0n
    if (plan.quoter?.reachable === false) {
      message.warning({ content: '目标价超出当前流动性可达范围；建议缩小变动幅度', key: 'tx', duration: 6 })
      return
    }

    Modal.confirm({
      title: '确认推动价格 (UniversalRouter)',
      width: 560,
      content: (
        <div>
          <p>方向：{plan.zeroForOne ? '卖 token0 换 token1（价格下行）' : '卖 token1 换 token0（价格上行）'}</p>
          <p>amountIn：<span className="value-mono">{fmt(amountIn)}</span> {plan.quoter?.amountInExact ? '(Quoter 反推精确值)' : '(本地估算)'}</p>
          <p>amountOutMin（slippage {slippageBps/100}%）：<span className="value-mono">{fmt(minOut)}</span></p>
          <p>路径：tokenIn → fee {plan.fee} → tokenOut</p>
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message="注意"
            description="UniversalRouter 的 V3_SWAP_EXACT_IN 不暴露 sqrtPriceLimitX96，无法在链上硬性限制成交价。靠 Quoter 预先计算的 amountIn + amountOutMinimum 来约束滑点。如要严格不超调可改回 SwapRouter 直接调用。"
          />
          <p style={{ marginTop: 12 }}>授权步骤：</p>
          <ul style={{ marginTop: 0 }}>
            <li>ERC20.approve(Permit2) — 缺失则发起</li>
            <li>Permit2.approve(token, UniversalRouter, ...) — 缺失/过期则发起</li>
            <li>UniversalRouter.execute([V3_SWAP_EXACT_IN], [input], deadline)</li>
          </ul>
        </div>
      ),
      onOk: async () => {
        try {
          setLoading(true)
          message.loading({ content: '检查并补齐授权...', key: 'tx' })
          const approvals = await ensurePermit2Approvals(signerTronWeb, network, account, plan.tokenIn, amountIn)
          if (approvals.erc20Approve) console.log('ERC20→Permit2 approve tx:', approvals.erc20Approve)
          if (approvals.permit2Approve) console.log('Permit2→Router approve tx:', approvals.permit2Approve)

          message.loading({ content: '发送 UniversalRouter swap 交易...', key: 'tx' })
          const txid = await v3SwapExactInViaRouter(signerTronWeb, network, {
            recipient: account,
            tokenIn: plan.tokenIn,
            tokenOut: plan.tokenOut,
            fee: plan.fee,
            amountIn,
            amountOutMin: minOut,
            payerIsUser: true,
          })
          message.success({ content: `Swap 已广播: ${txid}`, key: 'tx', duration: 8 })
          fetchCurrent(form)
        } catch (e) {
          message.error({ content: e.message || String(e), key: 'tx' })
        } finally {
          setLoading(false)
        }
      },
    })
  }

  const target = computeTargetSqrt()
  const targetHumanShown = target && dec0 != null && dec1 != null
    ? sqrtPriceX96ToHumanPrice(target, dec0, dec1).toSignificantDigits(18).toString()
    : null

  // 与当前价相比的方向预览（无需点估算就能看）
  const previewDir = (current && target) ? (target < current.sqrtPriceX96 ? 'zeroForOne' : target > current.sqrtPriceX96 ? 'oneForZero' : 'same') : null
  const previewDeltaPct = (current?.humanPrice && targetHumanShown)
    ? (() => {
        try {
          const cur = Number(current.humanPrice)
          const tgt = Number(targetHumanShown)
          if (!isFinite(cur) || cur === 0) return null
          return ((tgt - cur) / cur * 100).toFixed(4)
        } catch { return null }
      })()
    : null

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>③ 推动价格至目标</h2>
      <p style={{ color: '#888' }}>
        基于当前 sqrtPrice + 流动性，估算并校准所需 amountIn，然后调用 SwapRouter 执行。
        sqrtPriceLimitX96 设为目标价，确保不会被超调。
      </p>

      <Card title="池子" size="small" style={{ marginBottom: 16 }}>
        <PoolSelector value={form} onChange={onFormChange} />
      </Card>

      <PoolStateCard
        current={current}
        loading={currentLoading}
        error={currentErr}
        symbol0={current?.symbol0}
        symbol1={current?.symbol1}
        onRefresh={() => fetchCurrent(form)}
        refreshDisabled={!formReadyToQuery(form)}
      />

      <Card title="目标价格" size="small" style={{ marginBottom: 16 }}>
        <Form layout="vertical">
          <Space size="large" wrap>
            <Form.Item label="输入模式">
              <Space>
                <Tag color={targetMode === 'human' ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => setTargetMode('human')}>human price</Tag>
                <Tag color={targetMode === 'sqrt' ? 'blue' : 'default'} style={{ cursor: 'pointer' }} onClick={() => setTargetMode('sqrt')}>sqrtPriceX96</Tag>
              </Space>
            </Form.Item>
            {targetMode === 'human' ? (
              <Form.Item label={`human price (dec0=${dec0 ?? '?'}, dec1=${dec1 ?? '?'})`} style={{ width: 360 }}>
                <Input value={targetHuman} onChange={(e) => setTargetHuman(e.target.value)} placeholder={current?.humanPrice ? `当前 ${current.humanPrice}` : '例如 3623'} />
              </Form.Item>
            ) : (
              <Form.Item label="sqrtPriceX96" style={{ width: 400 }}>
                <Input className="value-mono" value={targetSqrt} onChange={(e) => setTargetSqrt(e.target.value)} placeholder={current?.sqrtPriceX96 ? `当前 ${current.sqrtPriceX96}` : '例如 4768605873228743255922197'} />
              </Form.Item>
            )}
            <Form.Item label="滑点 (bps)">
              <InputNumber min={0} max={5000} value={slippageBps} onChange={(v) => setSlippageBps(Number(v) || 0)} />
            </Form.Item>
          </Space>

          {target && (
            <div style={{ color: '#666' }}>
              <Space wrap>
                <span>目标 sqrtPriceX96 = <span className="value-mono">{target.toString()}</span></span>
                {targetHumanShown && <span>· human ≈ {targetHumanShown}</span>}
                {previewDir === 'zeroForOne' && <Tag color="red">价格将下行 (zeroForOne)</Tag>}
                {previewDir === 'oneForZero' && <Tag color="green">价格将上行 (oneForZero)</Tag>}
                {previewDir === 'same' && <Tag>等于当前价</Tag>}
                {previewDeltaPct != null && <Tag color="purple">变动 {previewDeltaPct}%</Tag>}
              </Space>
            </div>
          )}
        </Form>
      </Card>

      <Space>
        <Button type="primary" onClick={onPlan} loading={loading}>估算 / 校准</Button>
        {plan && plan.kind === 'v3' && (
          <Button type="primary" danger onClick={onExecuteV3} disabled={!swapEnabled || !account} loading={loading}>
            {swapEnabled ? '执行 V3 swap (UniversalRouter)' : 'UR/PERMIT2 地址未配置'}
          </Button>
        )}
        {plan && plan.kind === 'v4' && (
          <Button
            type="primary"
            danger
            onClick={onExecuteV4}
            disabled={!swapEnabled || !account || !plan.poolKey || !!plan.quoter?.error || !!plan.quoter?.skipped}
            loading={loading}
            title={
              !swapEnabled ? 'UR/PERMIT2 地址未配置'
              : !account ? '请先连接钱包'
              : !plan.poolKey ? 'poolId 直输模式不支持执行'
              : plan.quoter?.error ? 'Quoter 报错，先解决再执行'
              : ''
            }
          >
            执行 V4 swap (UniversalRouter)
          </Button>
        )}
      </Space>

      {err && <Alert style={{ marginTop: 16 }} type="error" message={err} showIcon />}

      {plan && (
        <>
          <Divider />
          <Card title="估算结果" size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="方向">
                {plan.zeroForOne ? <Tag color="red">zeroForOne (价格下行)</Tag> : <Tag color="green">oneForZero (价格上行)</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="当前 sqrtPriceX96"><span className="value-mono">{fmt(plan.currentSqrt)}</span></Descriptions.Item>
              <Descriptions.Item label="目标 sqrtPriceX96"><span className="value-mono">{fmt(plan.targetSqrt)}</span></Descriptions.Item>
              <Descriptions.Item label="流动性 L"><span className="value-mono">{fmt(plan.liquidity)}</span></Descriptions.Item>
              <Descriptions.Item label="fee (pips)"><Tag>{fmt(plan.fee)}</Tag></Descriptions.Item>
              <Descriptions.Item label="本地估算 amountIn（含费）"><span className="value-mono">{fmt(plan.estimateLocal)}</span></Descriptions.Item>
              {plan.quoter && !plan.quoter.error && (
                <>
                  {plan.quoter.amountInExact !== undefined && plan.quoter.amountInExact !== null && (
                    <Descriptions.Item label="✅ 推荐 amountIn (精确)">
                      <span className="value-mono" style={{ fontWeight: 'bold', color: '#1677ff' }}>
                        {fmt(plan.quoter.amountInExact)}
                      </span>
                      <span style={{ color: '#888', marginLeft: 8 }}>
                        — 实际执行使用此值，恰好到达目标价
                      </span>
                    </Descriptions.Item>
                  )}
                  {plan.quoter.reachable === false && (
                    <Descriptions.Item label="⚠️ 可达性">
                      <span style={{ color: '#cf1322' }}>当前流动性不足以推到目标价，请缩小目标变动幅度</span>
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="Quoter 探测 amountIn 上限"><span className="value-mono">{fmt(plan.quoter.amountInUpperUsed || plan.quoter.amountInUsed)}</span></Descriptions.Item>
                  <Descriptions.Item label="Quoter 预计 amountOut"><span className="value-mono">{fmt(plan.quoter.amountOut)}</span></Descriptions.Item>
                  {plan.quoter.sqrtPriceX96After !== undefined && (
                    <Descriptions.Item label="Quoter 预计 sqrtAfter"><span className="value-mono">{fmt(plan.quoter.sqrtPriceX96After)}</span></Descriptions.Item>
                  )}
                  {plan.quoter.initializedTicksCrossed !== undefined && (
                    <Descriptions.Item label="预计跨越 tick 数"><Tag>{fmt(plan.quoter.initializedTicksCrossed)}</Tag></Descriptions.Item>
                  )}
                  {plan.quoter.gasEstimate !== undefined && (
                    <Descriptions.Item label="Quoter gasEstimate"><span className="value-mono">{fmt(plan.quoter.gasEstimate)}</span></Descriptions.Item>
                  )}
                </>
              )}
              {plan.quoter && plan.quoter.error && (
                <Descriptions.Item label="Quoter 错误"><Alert type="warning" message={plan.quoter.error} showIcon /></Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </>
      )}
    </div>
  )
}
