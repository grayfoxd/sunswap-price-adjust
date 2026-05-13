import { create } from 'zustand'
import { DEFAULT_NETWORK } from '../config/networks'

export const useStore = create((set, get) => ({
  network: localStorage.getItem('network') || DEFAULT_NETWORK,
  account: null,
  signerTronWeb: null,

  setNetwork(k) {
    localStorage.setItem('network', k)
    set({ network: k })
  },
  setAccount(addr, tw) {
    set({ account: addr, signerTronWeb: tw })
  },
  disconnect() {
    set({ account: null, signerTronWeb: null })
  },
}))
