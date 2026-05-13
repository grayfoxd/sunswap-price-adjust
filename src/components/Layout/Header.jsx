import React from 'react'
import { Layout, Select, Space, Typography } from 'antd'
import { useStore } from '../../state/store'
import { NETWORK_OPTIONS } from '../../config/networks'
import ConnectWallet from '../ConnectWallet.jsx'

const { Header: AntHeader } = Layout
const { Title } = Typography

export default function Header() {
  const network = useStore((s) => s.network)
  const setNetwork = useStore((s) => s.setNetwork)
  return (
    <AntHeader style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Title level={4} style={{ margin: 0 }}>SunSwap 调价工具</Title>
      <Space size="large">
        <Space>
          <span style={{ color: '#888' }}>网络</span>
          <Select value={network} onChange={setNetwork} options={NETWORK_OPTIONS} style={{ width: 200 }} />
        </Space>
        <ConnectWallet />
      </Space>
    </AntHeader>
  )
}
