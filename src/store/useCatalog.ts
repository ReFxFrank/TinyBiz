// The storefront's view of the world — fetched from the public API, never the
// owner's authenticated store. Customers see exactly what the server says is
// for sale, and their carts get validated against it.

import { create } from 'zustand'
import { api, type ShopInfo } from '@/lib/api'
import { setActiveCurrency } from '@/lib/format'
import type { Product } from '@/data/types'

interface CatalogState {
  products: Product[]
  shop: ShopInfo | null
  bestSellerIds: string[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  load: (force?: boolean) => Promise<void>
}

export const useCatalog = create<CatalogState>()((set, get) => ({
  products: [],
  shop: null,
  bestSellerIds: [],
  status: 'idle',
  load: async (force = false) => {
    const { status } = get()
    if (status === 'loading' || (status === 'ready' && !force)) return
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' }))
    try {
      const { products, shop, bestSellerIds } = await api.catalog()
      setActiveCurrency(shop.currency)
      set({ products, shop, bestSellerIds, status: 'ready' })
    } catch {
      set((s) => ({ status: s.products.length ? 'ready' : 'error' }))
    }
  },
}))
