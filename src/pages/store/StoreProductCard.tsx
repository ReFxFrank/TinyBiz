// Shared storefront product card — used by the home page's best sellers and the
// shop grid. The whole card links to the product page; simple products get a
// hover quick-add button, variant products send the shopper to choose options.

import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useCart } from '@/store/useCart'
import { toast } from '@/store/useUI'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from '@/data/types'

/** Sellable stock — variant products sell from variant stock, not the base */
export function productAvailableStock(p: Product): number {
  return p.variants.length ? p.variants.reduce((a, v) => a + v.stock, 0) : p.stock
}

export function StoreProductCard({ product, badge }: { product: Product; badge?: ReactNode }) {
  const add = useCart((s) => s.add)
  const stock = productAvailableStock(product)
  const soldOut = stock <= 0
  const lowStock = !soldOut && stock <= product.reorderPoint
  const hasVariants = product.variants.length > 0
  const fromPrice = hasVariants ? Math.min(product.price, ...product.variants.map((v) => v.price)) : product.price

  const quickAdd = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const inCart = useCart.getState().items.find((i) => i.productId === product.id && !i.variantId)?.qty ?? 0
    if (inCart >= stock) {
      toast(`Only ${stock} in stock — you have them all in your cart`, { tone: 'error' })
      return
    }
    add(product.id, undefined, 1, stock)
    toast(`${product.name} added to cart`, { tone: 'success' })
  }

  return (
    <Link
      to={`/product/${product.id}`}
      className="group card glow-card flex h-full flex-col gap-3 !border-hairline p-3 hover:-translate-y-0.5"
    >
      <div
        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl ring-1 ring-inset ring-black/5 transition-shadow duration-300 group-hover:shadow-[inset_0_0_44px_rgba(255,255,255,0.5)]"
        style={{
          background: `linear-gradient(135deg, hsl(${product.imageHue}, 70%, 92%), hsl(${(product.imageHue + 40) % 360}, 60%, 86%))`,
        }}
      >
        {product.photos?.[0] ? (
          <img
            src={product.photos[0]}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="text-6xl transition-transform duration-300 group-hover:scale-110" aria-hidden>
            {product.image}
          </span>
        )}
        {badge && <div className="absolute left-2 top-2">{badge}</div>}
        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <span className="rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-neutral-900 shadow-lifted">
              Sold out
            </span>
          </div>
        )}
        {!soldOut && !hasVariants && (
          <button
            onClick={quickAdd}
            aria-label={`Add ${product.name} to cart`}
            className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[color:var(--accent-fg)] shadow-pop transition-all hover:scale-105 active:scale-95 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
      <div className="min-w-0 px-1 pb-1">
        <div className="truncate text-sm font-semibold text-ink">{product.name}</div>
        <div className="mt-0.5 text-xs text-ink-3">{product.category}</div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-base font-extrabold tracking-tight text-ink">
            {hasVariants && <span className="mr-1 text-xs font-medium tracking-normal text-ink-3">from</span>}
            {money(fromPrice)}
          </span>
          <span className={cn('text-[11px] font-medium', lowStock ? 'text-[#8a6100] dark:text-warn' : 'text-transparent')}>
            {lowStock ? `Only ${stock} left` : '·'}
          </span>
        </div>
      </div>
    </Link>
  )
}
