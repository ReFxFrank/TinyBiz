// Storefront cart — separate from the admin store so a shopper's cart never
// mixes with business data. Persisted so the cart survives reloads. Prices,
// stock, and promo validity all come from the server (via useCatalog and the
// public promo endpoint); the server re-validates everything at checkout.

import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { migrateKey } from '@/lib/legacyStorage'
import { effectiveTaxRate } from '@/lib/tax'
import { useCatalog } from '@/store/useCatalog'
import type { Product, ProductVariant } from '@/data/types'

export interface CartItem {
  productId: string
  /** Undefined = the base product */
  variantId?: string
  qty: number
}

/** A promo the server has validated — set via api.promo() */
export interface AppliedPromo {
  code: string
  /** undefined = 'percent' (older persisted promos) */
  type?: 'percent' | 'fixed' | 'freeship'
  discountPct: number
  amountOff?: number
}

const itemKey = (productId: string, variantId?: string) => `${productId}::${variantId ?? ''}`

interface CartState {
  items: CartItem[]
  promo: AppliedPromo | null
  /** Cart drawer visibility — any store page can open it (not persisted) */
  drawerOpen: boolean
  /** maxQty caps the line's ACCUMULATED quantity (pass available stock) */
  add: (productId: string, variantId?: string, qty?: number, maxQty?: number) => void
  setQty: (productId: string, variantId: string | undefined, qty: number) => void
  remove: (productId: string, variantId?: string) => void
  clear: () => void
  setPromo: (promo: AppliedPromo | null) => void
  setDrawerOpen: (open: boolean) => void
}

// Carry shoppers' carts over from the pre-rename key
migrateKey('tinybiz-cart', 'tms-cart')

// Persisted carts arrive from EVERY version this app has ever shipped (the
// legacy key is copied verbatim), so trust nothing: one null entry or a
// non-array items value used to crash the header on boot — and since the bad
// value re-persists, that browser stayed black forever until cleared by hand.
function sanitizeItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (i): i is CartItem =>
        Boolean(i) &&
        typeof i === 'object' &&
        typeof (i as CartItem).productId === 'string' &&
        Number.isFinite((i as CartItem).qty) &&
        (i as CartItem).qty > 0,
    )
    .map((i) => ({
      productId: i.productId,
      ...(typeof i.variantId === 'string' && i.variantId ? { variantId: i.variantId } : {}),
      qty: Math.floor(i.qty),
    }))
}

function sanitizePromo(raw: unknown): AppliedPromo | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as AppliedPromo
  return typeof p.code === 'string' && Number.isFinite(p.discountPct) ? { code: p.code, discountPct: p.discountPct } : null
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      promo: null,
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
      clear: () => set({ items: [], promo: null }),
      setPromo: (promo) => set({ promo }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    {
      name: 'tms-cart',
      version: 2, // v2: promoCode string → server-validated promo object
      migrate: (persisted) => {
        const p = persisted as Partial<CartState> & { promoCode?: unknown }
        return { items: sanitizeItems(p?.items), promo: null }
      },
      // merge runs on EVERY rehydrate (migrate only on version skew) — this is
      // the gate that keeps hostile persisted shapes out of render code
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CartState>
        return { ...current, items: sanitizeItems(p.items), promo: sanitizePromo(p.promo) }
      },
      partialize: (s) => ({ items: s.items, promo: s.promo }),
    },
  ),
)

// ── Derived cart details (joined with the live catalog) ──────────────────────

export interface CartLine {
  item: CartItem
  product: Product
  variant?: ProductVariant
  name: string
  unitPrice: number
  /** Unit price with the promo baked in, rounded to cents — mirrors the server */
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
  promo: AppliedPromo | null
  discount: number
  /** True when the applied promo is a free-shipping code */
  freeShip: boolean
  /** Free over the threshold; flat rate below it */
  shipping: number
  freeShippingThreshold: number
  taxRate: number
  tax: number
  total: number
}

export const FREE_SHIPPING_OVER = 50
export const FLAT_SHIPPING = 4.99

/** Human label for what a promo does — "−15%", "−$5.00", "free shipping" */
export function promoLabel(p: AppliedPromo): string {
  const t = p.type ?? 'percent'
  if (t === 'freeship') return 'free shipping'
  if (t === 'fixed') return `−$${(p.amountOff ?? 0).toFixed(2)}`
  return `−${p.discountPct}%`
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Cart lines joined with the catalog, plus all the checkout math in one place.
 *  `province` (typed at checkout) switches Canadian shops to the destination
 *  GST/HST/PST rate — mirrors server/store-math.js, which stays authoritative. */
export function useCartDetails(province?: string): CartDetails {
  const items = useCart((s) => s.items)
  const promo = useCart((s) => s.promo)
  const products = useCatalog((s) => s.products)
  const shop = useCatalog((s) => s.shop)
  const taxRate = effectiveTaxRate(shop?.caTaxTable, shop?.taxRate ?? 0, province)
  const freeShippingThreshold = shop?.freeShippingOver ?? FREE_SHIPPING_OVER
  const flatShipping = shop?.flatShipping ?? FLAT_SHIPPING

  return useMemo(() => {
    const promoType = promo ? (promo.type ?? 'percent') : null
    const pct = promoType === 'percent' ? (promo?.discountPct ?? 0) : 0
    const lines: CartLine[] = []
    // Belt over braces: the persist merge sanitizes, but this runs in the
    // HEADER on every page — it must survive anything
    const safeItems = Array.isArray(items) ? items.filter((i) => i && typeof i.productId === 'string') : []
    for (const item of safeItems) {
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
        discountedUnitPrice: round2(unitPrice * (1 - pct / 100)),
        lineTotal: unitPrice * item.qty,
        available: variant ? variant.stock : product.stock,
      })
    }
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0)
    const discountedSubtotal = round2(lines.reduce((a, l) => a + l.discountedUnitPrice * l.item.qty, 0))
    // Fixed-amount promos discount the ORDER, not the unit prices; free
    // shipping zeroes the shipping line — mirrors server computePromoTotals
    const fixedOff = promoType === 'fixed' ? Math.min(discountedSubtotal, round2(promo?.amountOff ?? 0)) : 0
    const goods = round2(discountedSubtotal - fixedOff)
    const freeShip = promoType === 'freeship'
    const discount = round2(subtotal - discountedSubtotal + fixedOff)
    const shipping = lines.length === 0 || freeShip || goods >= freeShippingThreshold ? 0 : flatShipping
    // Tax applies to what's charged: discounted goods AND shipping
    const tax = round2(((goods + shipping) * taxRate) / 100)
    return {
      lines,
      count: lines.reduce((a, l) => a + l.item.qty, 0),
      subtotal,
      promo,
      discount,
      freeShip,
      shipping,
      freeShippingThreshold,
      taxRate,
      tax,
      total: round2(goods + shipping + tax),
    }
  }, [items, promo, products, taxRate, freeShippingThreshold, flatShipping])
}
