// Storefront product detail — big artwork (photo gallery when the product has
// photos, emoji tile otherwise), variant picker, quantity stepper, add-to-cart,
// specs, and related products. Keyed by product id so state (variant, qty,
// selected photo) resets cleanly when a shopper hops between related items.

import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Minus, PackageCheck, Plus, Printer, ShoppingBag, Sparkles, Truck } from 'lucide-react'
import { Badge, Button, Card, EmptyState } from '@/components/ui'
import { useCatalog } from '@/store/useCatalog'
import { useCart, FREE_SHIPPING_OVER } from '@/store/useCart'
import { toast } from '@/store/useUI'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StoreProductCard } from './StoreProductCard'
import type { Product, ProductVariant } from '@/data/types'

/** "45 min" under an hour and a half, otherwise "3.5 hours" */
function printDuration(min: number): string {
  if (min < 90) return `${Math.round(min)} min`
  const h = min / 60
  const rounded = Math.round(h * 10) / 10
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} hours`
}

function tileGradient(hue: number): string {
  return `linear-gradient(135deg, hsl(${hue}, 70%, 92%), hsl(${(hue + 40) % 360}, 60%, 86%))`
}

export default function StoreProduct() {
  const { id } = useParams()
  const products = useCatalog((s) => s.products)
  const product = products.find((p) => p.id === id && p.active)

  if (!product) {
    return (
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center px-4 py-20 sm:px-6">
        <EmptyState
          icon={<ShoppingBag />}
          title="This product is no longer available"
          description="It may have sold out for good or been retired. There's plenty more to explore in the shop."
          action={
            <Link to="/shop">
              <Button>Back to the shop</Button>
            </Link>
          }
        />
      </div>
    )
  }

  // Key resets variant + qty + gallery state whenever the shopper navigates to another product
  return <ProductView key={product.id} product={product} />
}

function ProductView({ product }: { product: Product }) {
  const products = useCatalog((s) => s.products)
  const freeShippingOver = useCatalog((s) => s.shop?.freeShippingOver ?? FREE_SHIPPING_OVER)
  const add = useCart((s) => s.add)
  const setDrawerOpen = useCart((s) => s.setDrawerOpen)

  const hasVariants = product.variants.length > 0
  const photos = product.photos ?? []
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    () => product.variants.find((v) => v.stock > 0)?.id,
  )
  const [qty, setQty] = useState(1)
  const [photoIdx, setPhotoIdx] = useState(0)

  const selectedVariant = hasVariants ? product.variants.find((v) => v.id === selectedVariantId) : undefined
  const available = hasVariants ? (selectedVariant?.stock ?? 0) : product.stock
  const price = selectedVariant?.price ?? product.price
  const soldOut = available <= 0
  const lowStock = !soldOut && available <= product.reorderPoint

  const pickVariant = (v: ProductVariant) => {
    if (v.stock <= 0) return
    setSelectedVariantId(v.id)
    setQty((q) => Math.min(Math.max(1, q), v.stock))
  }

  const addToCart = () => {
    if (soldOut) return
    // The cart line accumulates across adds — never let it grow past stock
    const inCart =
      useCart.getState().items.find((i) => i.productId === product.id && i.variantId === selectedVariant?.id)?.qty ?? 0
    const room = available - inCart
    if (room <= 0) {
      toast(`Only ${available} in stock — they're all in your cart already`, { tone: 'error' })
      return
    }
    const adding = Math.min(qty, room)
    add(product.id, selectedVariant?.id, adding, available)
    const label = selectedVariant ? `${product.name} — ${selectedVariant.name}` : product.name
    toast(adding < qty ? `Only ${available} in stock — added the last ${adding}` : `${label} added to cart`, {
      tone: 'success',
    })
    setDrawerOpen(true)
    setQty(1)
  }

  const related = useMemo(() => {
    const others = products.filter((p) => p.active && p.id !== product.id)
    const same = others.filter((p) => p.category === product.category)
    const rest = others.filter((p) => p.category !== product.category)
    return [...same, ...rest].slice(0, 4)
  }, [products, product.id, product.category])

  const specSku = hasVariants ? (selectedVariant ?? product.variants[0]).sku : product.sku
  const { l, w, h } = product.dimensionsCm

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"
    >
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        <Link to="/shop" className="transition-colors hover:text-ink">
          Shop
        </Link>
        <span aria-hidden>/</span>
        <Link
          to={`/shop?cat=${encodeURIComponent(product.category)}`}
          className="transition-colors hover:text-ink"
        >
          {product.category}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-2">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-10">
        {/* Artwork */}
        <div className="relative">
          {/* Faint aurora bloom behind the tile — decorative only */}
          <div className="pointer-events-none absolute -inset-8 overflow-hidden rounded-3xl" aria-hidden>
            <div
              className="aurora-orb left-[-8%] top-[-10%] h-64 w-64"
              style={{ background: 'var(--accent)', opacity: 0.28 }}
            />
            <div
              className="aurora-orb bottom-[-12%] right-[-6%] h-56 w-56"
              style={{ background: 'var(--pop)', opacity: 0.2, animationDelay: '-6s' }}
            />
          </div>
          <div
            className="glow-card tb-noise group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-hairline"
            style={{ background: tileGradient(product.imageHue) }}
          >
            {photos.length > 0 ? (
              <img
                src={photos[Math.min(photoIdx, photos.length - 1)]}
                alt={product.name}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <span
                className="text-8xl transition-transform duration-300 group-hover:scale-105 sm:text-9xl"
                aria-hidden
              >
                {product.image}
              </span>
            )}
          </div>
          {photos.length > 1 && (
            <div className="relative mt-3 flex flex-wrap gap-2">
              {photos.map((url, i) => {
                const selected = i === photoIdx
                return (
                  <button
                    key={`${url}-${i}`}
                    onClick={() => setPhotoIdx(i)}
                    aria-label={`View photo ${i + 1} of ${photos.length}`}
                    aria-current={selected}
                    className={cn(
                      'h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-all',
                      selected
                        ? 'border-accent ring-1 ring-accent'
                        : 'border-hairline opacity-70 hover:opacity-100',
                    )}
                  >
                    <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{product.category}</div>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{product.name}</h1>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tracking-tight text-ink">{money(price)}</span>
            {soldOut ? (
              <span className="text-sm font-medium text-critical">Sold out</span>
            ) : lowStock ? (
              <span className="text-sm font-medium text-[#8a6100] dark:text-warn">Only {available} left</span>
            ) : (
              <span className="text-sm font-medium text-[#006300] dark:text-good">In stock</span>
            )}
          </div>

          <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{product.description}</p>

          {hasVariants && (
            <div className="mt-6">
              <div className="mb-2 text-[13px] font-medium text-ink-2">Options</div>
              <div
                className="flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="Product options"
                onKeyDown={(e) => {
                  // ARIA radio pattern: one tab stop, arrows move selection between in-stock options
                  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return
                  e.preventDefault()
                  const inStock = product.variants.filter((v) => v.stock > 0)
                  if (!inStock.length) return
                  const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
                  const at = inStock.findIndex((v) => v.id === selectedVariantId)
                  const next = inStock[(at + dir + inStock.length) % inStock.length]
                  pickVariant(next)
                  ;(e.currentTarget.querySelector(`[data-variant="${next.id}"]`) as HTMLElement | null)?.focus()
                }}
              >
                {product.variants.map((v) => {
                  const out = v.stock <= 0
                  const selected = v.id === selectedVariantId
                  return (
                    <button
                      key={v.id}
                      data-variant={v.id}
                      role="radio"
                      aria-checked={selected}
                      tabIndex={selected ? 0 : -1}
                      disabled={out}
                      onClick={() => pickVariant(v)}
                      className={cn(
                        'rounded-xl border px-3.5 py-2 text-left text-sm transition-all',
                        selected
                          ? 'border-accent bg-accent-wash shadow-pop ring-1 ring-accent'
                          : 'border-edge bg-surface hover:border-ink-3',
                        out && 'cursor-not-allowed opacity-45 hover:border-edge',
                      )}
                    >
                      <span
                        className={cn(
                          'font-medium',
                          selected ? 'text-accent-strong dark:text-accent' : 'text-ink',
                          out && 'line-through',
                        )}
                      >
                        {v.name}
                      </span>
                      <span className="ml-2 text-xs text-ink-3">{out ? 'Sold out' : money(v.price)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-stretch gap-3">
            <div className="flex items-center rounded-xl border border-edge bg-surface shadow-soft">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={soldOut || qty <= 1}
                aria-label="Decrease quantity"
                className="flex h-11 w-10 items-center justify-center rounded-l-xl text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:pointer-events-none disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm font-semibold tabular-nums text-ink" aria-live="polite">
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => Math.min(available, q + 1))}
                disabled={soldOut || qty >= available}
                aria-label="Increase quantity"
                className="flex h-11 w-10 items-center justify-center rounded-r-xl text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className={cn('isolate flex-1 rounded-xl', !soldOut && 'glow-halo')}>
              <Button size="lg" icon={<ShoppingBag />} disabled={soldOut} onClick={addToCart} className="w-full">
                {soldOut ? 'Sold out' : 'Add to cart'}
              </Button>
            </div>
          </div>

          <ul className="mt-7 space-y-3.5 border-t border-hairline pt-6 text-sm text-ink-2">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent-strong dark:text-accent">
                <Truck className="h-4 w-4" aria-hidden />
              </span>
              Free shipping on orders over {money(freeShippingOver)}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent-strong dark:text-accent">
                <Printer className="h-4 w-4" aria-hidden />
              </span>
              {product.productionTimeMin > 0
                ? `Printed fresh for you — about ${printDuration(product.productionTimeMin)} on the printer`
                : 'Made in small batches in our studio'}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-wash text-accent-strong dark:text-accent">
                <PackageCheck className="h-4 w-4" aria-hidden />
              </span>
              Ships in 3–5 business days
            </li>
          </ul>
        </div>
      </div>

      {/* Specs */}
      <Card className="mt-10" padding="lg">
        <h2 className="text-[15px] font-semibold text-ink">Details</h2>
        <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <SpecRow label="SKU">{specSku}</SpecRow>
          <SpecRow label="Weight">{product.weightGrams} g</SpecRow>
          <SpecRow label="Dimensions">
            {l} × {w} × {h} cm
          </SpecRow>
          {product.productionTimeMin > 0 && (
            <SpecRow label="Print time">{printDuration(product.productionTimeMin)}</SpecRow>
          )}
          <SpecRow label="Category">{product.category}</SpecRow>
          {product.tags.length > 0 && (
            <SpecRow label="Tags">
              <span className="flex flex-wrap gap-1.5">
                {product.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </span>
            </SpecRow>
          )}
        </dl>
      </Card>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-12">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-strong dark:text-accent">
              Keep exploring
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent-strong dark:text-accent" aria-hidden />
              <h2 className="text-lg font-semibold text-ink">You might also like</h2>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <StoreProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </motion.div>
  )
}

function SpecRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-hairline pt-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  )
}
