// 常用 TRC20 token 地址表
// 主网数据来源：https://list.justswap.io/justswap.json (SunSwap Default List)
// decimals 通过 ERC20.decimals() 现场查询并缓存，这里仅提供选择器候选与 logo

const NILE = {
  TRX: { symbol: 'TRX', address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', decimals: 6, native: true, name: 'TRX' },
  WTRX: { symbol: 'WTRX', address: 'TYsbWxNnyTgsZaTFaue9hqpxkU3Fkco94a', decimals: 6, name: 'Wrapped TRX' },
  USDT: { symbol: 'USDT', address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf', decimals: 6, name: 'Tether USD' },
  USDC: { symbol: 'USDC', address: 'TWMCMCoJPqCGw5RR7eChF2HoY3a9B8eYA3', decimals: 6, name: 'USD Coin' },
  SUN: { symbol: 'SUN', address: 'TDqjTkZ63yHB19w2n7vPm2qAkLHwn9fKKk', decimals: 18, name: 'SUN' },
  WIN: { symbol: 'WIN', address: 'TNDSHKGBmgRx9mDYA9CnxPx55nu672yQw2', decimals: 6, name: 'WINkLink' },
  JST: { symbol: 'JST', address: 'TF17BgPaZYbz8oxbjhriubPDsA7ArKoLX3', decimals: 18, name: 'JUST' },
}

const MAINNET = {
  TRX: {
    symbol: 'TRX',
    address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
    decimals: 6,
    native: true,
    name: 'TRX',
  },
  WTRX: {
    symbol: 'WTRX',
    address: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
    decimals: 6,
    name: 'Wrapped TRX',
    logoURI: 'https://static.tronscan.org/production/upload/logo/TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR.png',
  },
  USDT: {
    symbol: 'USDT',
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    name: 'Tether USD',
    logoURI: 'https://static.tronscan.org/production/logo/usdtlogo.png',
  },
  HTX: {
    symbol: 'HTX',
    address: 'TUPM7K8REVzD2UdV4R5fe5M8XbnR2DdoJ6',
    decimals: 18,
    name: 'HTX',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/HTX.png',
  },
  SUN: {
    symbol: 'SUN',
    address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
    decimals: 18,
    name: 'SUN',
    logoURI: 'https://static.tronscan.org/production/logo/TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S.png',
  },
  JST: {
    symbol: 'JST',
    address: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9',
    decimals: 18,
    name: 'JUST',
    logoURI: 'https://static.tronscan.org/production/logo/just_icon.png',
  },
  NFT: {
    symbol: 'NFT',
    address: 'TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq',
    decimals: 6,
    name: 'AINFT',
    logoURI: 'https://static.tronscan.org/production/upload/logo/TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq.png',
  },
  sTRX: {
    symbol: 'sTRX',
    address: 'TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5',
    decimals: 18,
    name: 'Staked TRX',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5.png',
  },
  BTT: {
    symbol: 'BTT',
    address: 'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4',
    decimals: 18,
    name: 'BitTorrent',
    logoURI: 'https://static.tronscan.org/production/logo/1002000.png',
  },
  USDD: {
    symbol: 'USDD',
    address: 'TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz',
    decimals: 18,
    name: 'Decentralized USD',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/TXDk8mbtRbXeYuMNS83CfKPaYYT8XWv9Hz.png',
  },
  TUSD: {
    symbol: 'TUSD',
    address: 'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4',
    decimals: 18,
    name: 'TrueUSD',
    logoURI: 'https://static.tronscan.org/production/logo/TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4.png',
  },
  BTC: {
    symbol: 'BTC',
    address: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
    decimals: 8,
    name: 'Bitcoin',
    logoURI: 'https://static.tronscan.org/production/logo/TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9.png',
  },
  SUNOLD: {
    symbol: 'SUNOLD',
    address: 'TKkeiboTkxXKJpbmVFbv4a8ov5rAfRDMf9',
    decimals: 18,
    name: 'SUNOLD',
    logoURI: 'https://static.tronscan.org/production/upload/logo/TKkeiboTkxXKJpbmVFbv4a8ov5rAfRDMf9.png',
  },
  U: {
    symbol: 'U',
    address: 'TFNirp6PbqYE1ZTtWuCMUKJWLNZkoCoeFJ',
    decimals: 18,
    name: 'United Stables',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/TFNirp6PbqYE1ZTtWuCMUKJWLNZkoCoeFJ.png',
  },
  USD1: {
    symbol: 'USD1',
    address: 'TPFqcBAaaUMCSVRCqPaQ9QnzKhmuoLR6Rc',
    decimals: 18,
    name: 'World Liberty Financial USD',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/TPFqcBAaaUMCSVRCqPaQ9QnzKhmuoLR6Rc.png',
  },
  USDDOLD: {
    symbol: 'USDDOLD',
    address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
    decimals: 18,
    name: 'Decentralized USDOLD',
    logoURI: 'https://static.tronscan.org/production/upload/logo/TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn.png',
  },
  WIN: {
    symbol: 'WIN',
    address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    decimals: 6,
    name: 'WINkLink',
    logoURI: 'https://static.tronscan.org/profile_images/JKtJTydD_400x400.jpg',
  },
  ETHB: {
    symbol: 'ETHB',
    address: 'TRFe3hT5oYhjSZ6f3ji5FJ7YCfrkWnHRvh',
    decimals: 18,
    name: 'Ethereum BTTC-Bridged',
    logoURI: 'https://static.tronscan.org/production/logo/TRFe3hT5oYhjSZ6f3ji5FJ7YCfrkWnHRvh.png',
  },
  ETH: {
    symbol: 'ETH',
    address: 'THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF',
    decimals: 18,
    name: 'Ethereum',
    logoURI: 'https://static.tronscan.org/production/logo/THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF.png',
  },
  USDJ: {
    symbol: 'USDJ',
    address: 'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT',
    decimals: 18,
    name: 'JUST Stablecoin',
    logoURI: 'https://static.tronscan.org/production/logo/usdj.png',
  },
  USDCOLD: {
    symbol: 'USDCOLD',
    address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    decimals: 6,
    name: 'USD Coin Old',
    logoURI: 'https://static.tronscan.org/production/upload/logo/TEkxiTehnzSmSe2XqrBj4w32RUN966rdz81.png',
  },
  WBTT: {
    symbol: 'WBTT',
    address: 'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt',
    decimals: 6,
    name: 'Wrapped BTT',
    logoURI: 'https://static.tronscan.org/production/logo/TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt.png',
  },
  HT: {
    symbol: 'HT',
    address: 'TDyvndWuvX5xTBwHPYJi7J3Yq8pq8yh62h',
    decimals: 18,
    name: 'HuobiToken',
    logoURI: 'https://static.tronscan.org/production/logo/TDyvndWuvX5xTBwHPYJi7J3Yq8pq8yh62h.png',
  },
  WBTC: {
    symbol: 'WBTC',
    address: 'TYhWwKpw43ENFWBTGpzLHn3882f2au7SMi',
    decimals: 8,
    name: 'Wrapped BTC',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/TYhWwKpw43ENFWBTGpzLHn3882f2au7SMi.png',
  },
  stUSDT: {
    symbol: 'stUSDT',
    address: 'TThzxNRLrW2Brp9DcTQU8i4Wd9udCWEdZ3',
    decimals: 18,
    name: 'Staked USDT',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/stUSDT_logo.png',
  },
  LTC: {
    symbol: 'LTC',
    address: 'TR3DLthpnDdCGabhVDbD3VMsiJoCXY3bZd',
    decimals: 8,
    name: 'Litecoin',
    logoURI: 'https://static.tronscan.org/production/logo/TR3DLthpnDdCGabhVDbD3VMsiJoCXY3bZd.png',
  },
  TRUMP: {
    symbol: 'TRUMP',
    address: 'TXZQuyCasxN42bjAcYpP2xwYVMCF6gHBnv',
    decimals: 18,
    name: 'OFFICIAL TRUMP',
    logoURI: 'https://static.tronscan.org/production/upload/logo/new/TXZQuyCasxN42bjAcYpP2xwYVMCF6gHBnv.jpg',
  },
}

export const TOKEN_REGISTRY = {
  mainnet: MAINNET,
  nile: NILE,
}

export function listTokens(network) {
  return Object.values(TOKEN_REGISTRY[network] || {})
}

// 按地址查 token（base58）
export function findToken(network, address) {
  const reg = TOKEN_REGISTRY[network] || {}
  return Object.values(reg).find((t) => t.address === address) || null
}
