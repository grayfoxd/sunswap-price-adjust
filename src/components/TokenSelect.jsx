// token 选择器：基于 tokens.js 注册表的 AutoComplete
// 允许用户从已知列表挑，或粘贴任意地址

import React, { useMemo } from 'react'
import { AutoComplete, Input, Tag } from 'antd'
import { listTokens, findToken } from '../config/tokens'
import { useStore } from '../state/store'

export default function TokenSelect({ value, onChange, placeholder = 'T... 或选已知 token' }) {
  const network = useStore((s) => s.network)
  const tokens = listTokens(network)

  const options = useMemo(
    () =>
      tokens.map((t) => ({
        value: t.address,
        label: (
          <span>
            <b>{t.symbol}</b>
            <span style={{ color: '#888', marginLeft: 8 }}>{t.name}</span>
            <span style={{ color: '#ccc', marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>{t.address.slice(0, 6)}...{t.address.slice(-4)}</span>
          </span>
        ),
      })),
    [tokens],
  )

  const matched = findToken(network, value)

  return (
    <AutoComplete
      style={{ width: '100%' }}
      value={value || ''}
      onChange={(v) => onChange(typeof v === 'string' ? v.trim() : v)}
      options={options}
      placeholder={placeholder}
      filterOption={(input, option) => {
        if (!input) return true
        const inp = input.toLowerCase()
        const tok = tokens.find((t) => t.address === option.value)
        if (!tok) return false
        return (
          tok.address.toLowerCase().includes(inp) ||
          tok.symbol.toLowerCase().includes(inp) ||
          (tok.name || '').toLowerCase().includes(inp)
        )
      }}
    >
      <Input
        suffix={matched ? <Tag color="blue" style={{ marginRight: 0 }}>{matched.symbol}</Tag> : null}
      />
    </AutoComplete>
  )
}
