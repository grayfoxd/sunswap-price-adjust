# SunSwap 调价工具

一个用于在 TRON 链上查询并调节 SunSwap V3/V4 流动性池价格的浏览器 dApp。

## 功能

1. **池子信息**：读取 sqrtPriceX96 / tick / 流动性 / 当前价格（V3 与 V4，主网与 Nile）
2. **价格计算器**：price ↔ sqrtPriceX96 ↔ tick 三向联动（Phase 2）
3. **推动价格**：根据目标价格计算所需 swap 数量并执行（Phase 3）
4. **流动性辅助**：单边流动性、价格区间 mint/burn 辅助（Phase 4）

## 开发

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 静态构建到 dist/
npm run preview      # 预览构建产物
```

## 环境变量

复制 `.env.example` → `.env.local` 后按需修改：

- `VITE_DEFAULT_NETWORK` —— 默认 `nile`，可选 `mainnet`
- `VITE_MAINNET_RPC` / `VITE_NILE_RPC` —— 自定义 RPC
- `VITE_TRONGRID_API_KEY` —— 可选，避免被限频

## 钱包

UI 仅支持 **TronLink** 浏览器扩展。读链路独立于钱包（自建 TronWeb 实例 + 配置中的 RPC），写链路（swap、mint、burn）才需要连接钱包签名。

## 网络与合约地址

见 `src/config/networks.js`。地址留空（`''`）的功能在 UI 上会被禁用。当前已知缺口：

- V3 主网 Quoter / SwapRouter
- V3 Nile 全部地址
- V4 主网 UniversalRouter / Permit2

## 部署

`npm run build` 输出的 `dist/` 是纯静态资源，可直接部署到：

- Vercel / Netlify（推荐，自动 SPA fallback）
- GitHub Pages
- IPFS（`vite.config.js` 中 `base: './'` 已配置）

## 代码组织

- `src/config/` 网络、合约地址、token、ABI
- `src/lib/` TronWeb 包装、钱包、ABI/选择器、合约调用
- `src/math/` sqrtPrice / tick / liquidity / swap / poolId 数学
- `src/services/v3/` `services/v4/` 业务封装（pool / quoter / swap / positions）
- `src/components/` 通用组件
- `src/pages/` 4 个功能页
- `src/state/store.js` Zustand 状态（network + wallet）
