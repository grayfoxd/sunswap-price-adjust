// 池子选择器
// V3: pool 地址 直接输入 OR token0+token1+fee
// V4: token0 + token1 + fee + tickSpacing + hooks

import React, { useMemo } from 'react'
import { Alert, Button, Form, Input, Select, InputNumber, Radio, Space } from 'antd'
import TokenSelect from './TokenSelect.jsx'
import { toEvmHex } from '../lib/addr'
import { useStore } from '../state/store'

export const FEE_TIER_OPTIONS = [
  { label: '100 (0.01%)', value: 100 },
  { label: '500 (0.05%)', value: 500 },
  { label: '1000 (0.10%)', value: 1000 },
  { label: '3000 (0.30%)', value: 3000 },
  { label: '10000 (1.00%)', value: 10000 },
]

export const TICK_SPACING_OPTIONS = [
  { label: '1', value: 1 },
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '60', value: 60 },
  { label: '200', value: 200 },
]

// values = { version, mode (v3 only), poolAddress (v3), token0, token1, fee, tickSpacing (v4), hooks (v4) }
export default function PoolSelector({ value, onChange, requireVersion = true, defaultVersion = 'v4' }) {
  const network = useStore((s) => s.network)
  function patch(p) {
    onChange({ ...(value || {}), ...p })
  }
  const v = value || { version: defaultVersion, mode: 'tokens' }

  // V4 tokens 模式下，currency0 必须 < currency1（字节序）
  const orderInfo = useMemo(() => {
    if (v.version !== 'v4' || v.mode === 'poolId' || !v.token0 || !v.token1) return null
    try {
      const a = toEvmHex(v.token0, network).toLowerCase()
      const b = toEvmHex(v.token1, network).toLowerCase()
      if (a === b) return { error: 'token0 与 token1 相同' }
      return { swapped: a > b }
    } catch {
      return null
    }
  }, [v.version, v.mode, v.token0, v.token1, network])

  return (
    <Form layout="vertical" size="middle">
      {requireVersion && (
        <Form.Item label="版本">
          <Radio.Group value={v.version} onChange={(e) => patch({ version: e.target.value })}>
            <Radio.Button value="v3">V3</Radio.Button>
            <Radio.Button value="v4">V4</Radio.Button>
          </Radio.Group>
        </Form.Item>
      )}

      {(v.version === 'v3' || v.version === 'v4') && (
        <Form.Item label="查询方式">
          <Radio.Group value={v.mode || 'tokens'} onChange={(e) => patch({ mode: e.target.value })}>
            <Radio.Button value="tokens">tokens + fee{v.version === 'v4' ? ' + spacing' : ''}</Radio.Button>
            {v.version === 'v3' && <Radio.Button value="address">直接输入池地址</Radio.Button>}
            {v.version === 'v4' && <Radio.Button value="poolId">直接输入 poolId</Radio.Button>}
          </Radio.Group>
        </Form.Item>
      )}

      {v.version === 'v3' && v.mode === 'address' && (
        <Form.Item label="池地址 (Base58 T...)">
          <Input value={v.poolAddress || ''} onChange={(e) => patch({ poolAddress: e.target.value.trim() })} placeholder="T..." />
        </Form.Item>
      )}

      {v.version === 'v4' && v.mode === 'poolId' && (
        <>
          <Form.Item label="poolId (bytes32)" help="keccak256(abi.encode(poolKey))，0x + 64 位 hex。该模式下读 slot0/liquidity，但 token 元数据/decimals 需要手动填。">
            <Input
              className="value-mono"
              value={v.poolId || ''}
              onChange={(e) => patch({ poolId: e.target.value.trim() })}
              placeholder="0x..."
            />
          </Form.Item>
          <Space size="large" wrap>
            <Form.Item label="token0 decimals (可选)">
              <InputNumber min={0} max={36} value={v.dec0} onChange={(x) => patch({ dec0: x })} />
            </Form.Item>
            <Form.Item label="token1 decimals (可选)">
              <InputNumber min={0} max={36} value={v.dec1} onChange={(x) => patch({ dec1: x })} />
            </Form.Item>
          </Space>
        </>
      )}

      {((v.version === 'v3' && (v.mode === 'tokens' || !v.mode)) ||
        (v.version === 'v4' && (v.mode === 'tokens' || !v.mode))) && (
        <>
          <Form.Item label="Token0">
            <TokenSelect value={v.token0 || ''} onChange={(x) => patch({ token0: x })} />
          </Form.Item>
          <Form.Item label="Token1">
            <TokenSelect value={v.token1 || ''} onChange={(x) => patch({ token1: x })} />
          </Form.Item>
          {orderInfo?.error && (
            <Alert type="error" showIcon message={orderInfo.error} style={{ marginBottom: 12 }} />
          )}
          {orderInfo?.swapped && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="V4 要求 token0 字节序 < token1"
              description="当前 token0 > token1，按现在的顺序算出来的 poolId 在链上不存在。"
              action={
                <Button size="small" type="primary" onClick={() => patch({ token0: v.token1, token1: v.token0 })}>
                  一键互换
                </Button>
              }
            />
          )}
          <Space size="large" wrap>
            <Form.Item label="fee (pips)">
              <Select style={{ width: 200 }} value={v.fee} onChange={(x) => patch({ fee: x })} options={FEE_TIER_OPTIONS} placeholder="选择 fee" />
            </Form.Item>
            {v.version === 'v4' && (
              <>
                <Form.Item label="tickSpacing">
                  <Select style={{ width: 160 }} value={v.tickSpacing} onChange={(x) => patch({ tickSpacing: x })} options={TICK_SPACING_OPTIONS} placeholder="选择 spacing" />
                </Form.Item>
                <Form.Item label="hooks (留空=无)">
                  <Input value={v.hooks || ''} onChange={(e) => patch({ hooks: e.target.value.trim() })} placeholder="T... 或 0x... 留空=0 地址" style={{ width: 320 }} />
                </Form.Item>
              </>
            )}
          </Space>
        </>
      )}
    </Form>
  )
}
