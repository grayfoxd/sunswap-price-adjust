import React, { useEffect } from 'react'
import { Button, message, Space, Tag } from 'antd'
import { useStore } from '../state/store'
import { connectWallet, onWalletMessage } from '../lib/wallet'

function short(addr) {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

export default function ConnectWallet() {
  const account = useStore((s) => s.account)
  const setAccount = useStore((s) => s.setAccount)
  const disconnect = useStore((s) => s.disconnect)

  useEffect(() => {
    const off = onWalletMessage((m) => {
      if (m.action === 'accountsChanged') {
        const tw = window.tronWeb
        if (tw && tw.defaultAddress?.base58) {
          setAccount(tw.defaultAddress.base58, tw)
        } else {
          disconnect()
        }
      }
    })
    return off
  }, [setAccount, disconnect])

  async function onConnect() {
    try {
      const { address, tronWeb } = await connectWallet()
      setAccount(address, tronWeb)
      message.success('已连接 ' + short(address))
    } catch (e) {
      message.error(e.message || '连接失败')
    }
  }

  if (account) {
    return (
      <Space>
        <Tag color="green">TronLink</Tag>
        <span className="value-mono">{short(account)}</span>
        <Button size="small" onClick={disconnect}>断开</Button>
      </Space>
    )
  }
  return <Button type="primary" onClick={onConnect}>连接 TronLink</Button>
}
