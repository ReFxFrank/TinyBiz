// Storefront cart — separate from the admin store so a shopper's cart never
// mixes with business data. Persisted so the cart survives reloads.

import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useStore } from '@/store/useStore'
import type { Product, ProductVariant, PromoCode } from '@/data/types'

export interface CartItem {
  productId: string
  /** Undefined = the base product */
  variantId?: string
  qty: number
}

const itemKey = (productId: string, variantId?: string) => `${productId}::${variantId ?? ''}`

interface CartState {
  items: CartItem[]
  promoCode: string | null
  /** Cart drawer visibility — any store page can open it (not persisted) */
  drawerOpen: boolean
  /** maxQty caps the line's ACCUMULATED quantity (pass available stock) */
  add: (productId: string, variantId?: string, qty?: number, maxQty?: number) => void
  setQty: (productId: string, variantId: string | undefined, qty: number) => void
  remove: (productId: string, variantId?: string) => void
  clear: () => void
  setPromoCode: (code: string | null) => void
  setDrawerOpen: (open: boolean) => void
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      promoCode: null,
      drawerOpen: false,
      add: (productId, variantId, qty = 1, maxQty) =>
        set((s) => {
          const key = itemKey(productId, variantId)
          const cap = (q: number) => (maxQty != null ? Math.min(q, maxQty) : q)
          const existing = s.items.find((i) => itemKey(i.productId, i.variantId) === key)
          if (existing) {
            return {
              items: s.items.map((i) =>
                itemKey(i.productId, i.variantId) === key ? { ...i, qty: cap(i.qty + qty) } : i,
              ),
            }
          }
          return { items: [...s.items, { productId, variantId, qty: cap(qty) }] }
        }),
      setQty: (productId, variantId, qty) =>
        set((s) => {
          const key = itemKey(productId, variantId)
          if (qty <= 0) return { items: s.items.filter((i) => itemKey(i.productId, i.variantId) !== key) }
          return { items: s.items.map((i) => (itemKey(i.productId, i.variantId) === key ? { ...i, qty } : i)) }
        }),
      remove: (productId, variantId) =>
        set((s) => ({ items: s.items.filter((i) => itemKey(i.productId, i.variantId) !== itemKey(productId, variantId)) })),
      clear: () => set({ items: [], promoCode: null }),
      setPromoCode: (promoCode) => set({ promoCode }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    {
      name: 'tinybiz-cart',
      partialize: (s) => ({ items: s.items, promoCode: s.promoCode }),
    },
  ),
)

// ── Derived cart details (joined with live shop data) ────────────────────────

export interface CartLine {
  item: CartItem
  product: Product
  variant?: ProductVariant
  name: string
  unitPrice: number
  /** Unit price with the promo baked in, rounded to cents — what checkout stores on the order */
  discountedUnitPrice: number
  lineTotal: number
  /** Sellable stock for this line's selection (variant stock, or base stock) */
  available: number
}

export interface CartDetails {
  lines: CartLine[]
  /** Total units in the cart */
  count: number
  subtotal: number
  promo: PromoCode | null
  discount: number
  /** Free over the threshold; flat rate below it */
  shipping: number
  freeShippingThreshold: number
  taxRate: number
  tax: number
  total: number
}

export const FREE_SHIPPING_OVER = 50
export const FLAT_SHIPPING = 4.99

const round2 = (n: number) => Math.round(n * 100) / 100

/** Cart lines joined with products, plus all the checkout math in one place */
export function useCartDetails(): CartDetails {
  const items = useCart((s) => s.items)
  const promoCode = useCart((s) => s.promoCode)
  const products = useStore((s) => s.products)
  const promoCodes = useStore((s) => s.promoCodes)
  const taxRate = useStore((s) => s.settings.taxRate)

  return useMemo(() => {
    const promo =
      (promoCode && promoCodes.find((p) => p.active && p.code.toLowerCase() === promoCode.toLowerCase())) || null
    const promoValid =
      promo && (!promo.expiresAt || new Date(promo.expiresAt).getTime() > Date.now()) &&
      (!promo.maxUses || promo.uses < promo.maxUses)
    const pct = promoValid && promo ? promo.discountPct : 0

    const lines: CartLine[] = []
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId)
      if (!product || !product.active) continue // deleted or retired — no longer for sale
      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : undefined
      if (item.variantId && !variant) continue // the exact option they chose is gone
      const unitPrice = variant?.price ?? product.price
      lines.push({
        item,
        product,
        variant,
        name: variant ? `${product.name} — ${variant.name}` : product.name,
        unitPrice,
        // Round per UNIT so the order we store (and the admin's books) match
        // what the shopper was quoted, to the cent.
        discountedUnitPrice: round2(unitPrice * (1 - pct / 100)),
        lineTotal: unitPrice * item.qty,
        available: variant ? variant.stock : product.stock,
      })
    }
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0)
    const discountedSubtotal = round2(lines.reduce((a, l) => a + l.discountedUnitPrice * l.item.qty, 0))
    const discount = round2(subtotal - discountedSubtotal)
    const shipping = lines.length === 0 || discountedSubtotal >= FREE_SHIPPING_OVER ? 0 : FLAT_SHIPPING
    const tax = round2((discountedSubtotal * taxRate) / 100)
    return {
      lines,
      count: lines.reduce((a, l) => a + l.item.qty, 0),
      subtotal,
      promo: promoValid ? promo : null,
      discount,
      shipping,
      freeShippingThreshold: FREE_SHIPPING_OVER,
      taxRate,
      tax,
      total: round2(discountedSubtotal + shipping + tax),
    }
  }, [items, promoCode, products, promoCodes, taxRate])
}
