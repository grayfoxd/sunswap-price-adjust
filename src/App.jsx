import React from 'react'
import { Layout, Menu } from 'antd'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import Header from './components/Layout/Header.jsx'
import PoolInfo from './pages/PoolInfo.jsx'
import Calculator from './pages/Calculator.jsx'
import PushPrice from './pages/PushPrice.jsx'
import Liquidity from './pages/Liquidity.jsx'

const { Sider, Content } = Layout

const MENU = [
  { key: '/pool', label: <Link to="/pool">① 池子信息</Link> },
  { key: '/calculator', label: <Link to="/calculator">② 价格计算器</Link> },
  { key: '/push', label: <Link to="/push">③ 推动价格</Link> },
  { key: '/liquidity', label: <Link to="/liquidity">④ 流动性</Link> },
]

export default function App() {
  const loc = useLocation()
  return (
    <Layout className="app-container">
      <Header />
      <Layout>
        <Sider width={200} theme="light">
          <Menu mode="inline" selectedKeys={[loc.pathname]} items={MENU} style={{ height: '100%' }} />
        </Sider>
        <Layout style={{ padding: 24 }}>
          <Content style={{ background: '#fff', padding: 24, borderRadius: 8, minHeight: 'calc(100vh - 112px)' }}>
            <Routes>
              <Route path="/" element={<Navigate to="/pool" replace />} />
              <Route path="/pool" element={<PoolInfo />} />
              <Route path="/calculator" element={<Calculator />} />
              <Route path="/push" element={<PushPrice />} />
              <Route path="/liquidity" element={<Liquidity />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}
