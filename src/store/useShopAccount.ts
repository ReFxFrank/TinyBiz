// The signed-in shopper, if any — powers the storefront's Account page,
// the header icon state, and checkout prefill. Loaded once per visit.

import { create } from 'zustand'
import { api, type ShopAccount } from '@/lib/api'

interface ShopAccountState {
  account: ShopAccount | null
  status: 'unknown' | 'ready'
  load: () => Promise<void>
  setAccount: (a: ShopAccount | null) => void
}

let loading = false

export const useShopAccount = create<ShopAccountState>()((set, get) => ({
  account: null,
  status: 'unknown',
  load: async () => {
    if (loading || get().status === 'ready') return
    loading = true
    try {
      const { account } = await api.account.me()
      set({ account, status: 'ready' })
    } catch {
      set({ status: 'ready' })
    } finally {
      loading = false
    }
  },
  setAccount: (account) => set({ account, status: 'ready' }),
}))
