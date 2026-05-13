import { Buffer } from 'buffer'
import process from 'process/browser'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import App from './App.jsx'
import './styles.css'

// TronWeb / 一些 deps 假设 Node 环境，注入 Buffer / process polyfill
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer
if (typeof globalThis.process === 'undefined') globalThis.process = process

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={{ token: { colorPrimary: '#ff6b35' } }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
)
