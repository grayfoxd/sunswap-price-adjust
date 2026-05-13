// TRON 网络配置 + 合约地址表
// 留空的地址会在 UI 上禁用对应按钮，避免误操作

export const NETWORKS = {
  mainnet: {
    name: 'TRON Mainnet',
    key: 'mainnet',
    rpc: import.meta.env.VITE_MAINNET_RPC || 'https://api.trongrid.io',
    explorer: 'https://tronscan.org',
    v3: {
      FACTORY: 'TThJt8zaJzJMhCEScH7zWKnp5buVZqys9x',
      NFPM: 'TLSWrv7eC1AZCXkRjpqMZUmvgd99cj7pPF',
      QUOTER: 'TLhZ48yfHygMLM2uZr87zJJusHjGen97gh',
      SWAP_ROUTER: 'TQAvWQpT9H916GckwWDJNhYZvQMkuRL7PN',
    },
    v4: {
      POOL_MANAGER: 'TVjuTE3V5bMVdpfNhid8kD2v35T2k1u1Br',
      CL_QUOTER: 'TSupQTJWWoVpUqA7KGVYb8dB97n3civwiJ',
      POSITION_MANAGER: 'TC8xQzPHfn5KceZV6s6GmZkBCFWWUoPXs1',
      UNIVERSAL_ROUTER: 'TSJEtPuqHpvSaVnSwvCsngaeBxrGUzp95Q',
      PERMIT2: 'TTJxU3P8rHycAyFY4kVtGNfmnMH4ezcuM9',
    },
  },
  nile: {
    name: 'TRON Nile Testnet',
    key: 'nile',
    rpc: import.meta.env.VITE_NILE_RPC || 'https://nile.trongrid.io',
    explorer: 'https://nile.tronscan.org',
    v3: {
      FACTORY: 'TUTGcsGDRScK1gsDPMELV2QZxeESWb1Gac',
      NFPM: 'TPQzqHbCzQfoVdAV6bLwGDos8Lk2UjXz2R',
      QUOTER: 'TUcM2gkpWEJxBpkweLdVoRp6DAUsw2vWR6',
      SWAP_ROUTER: 'TFkswj6rUfK3cQtFGzungCkNXxD2UCpEVD',
    },
    v4: {
      POOL_MANAGER: 'TVivLPeq7FMmTG8Z7HaiBgHTsMwCEcipKT',
      CL_QUOTER: 'TWbsXKMjoDPjW4kjqv4qs5gbesnJ8wKref',
      POSITION_MANAGER: 'TMTQ1BYo15aGgZXHcsBWXyae8bVaAdgfLP',
      UNIVERSAL_ROUTER: 'TLmHD2TJoGVEMkGiE1JzSwd6CEPa8jXumJ',
      PERMIT2: 'TYQuuhGbEMxF7nZxUHV3uHJxAVVAegNU9h',
    },
  },
}

export const DEFAULT_NETWORK = import.meta.env.VITE_DEFAULT_NETWORK || 'nile'
export const NETWORK_OPTIONS = Object.values(NETWORKS).map((n) => ({ label: n.name, value: n.key }))

export function getNetwork(key) {
  return NETWORKS[key] || NETWORKS[DEFAULT_NETWORK]
}
