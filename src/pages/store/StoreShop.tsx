// Storefront catalog — the full browsable shop grid with search, category
// chips, and sorting. Category selection syncs to ?cat= so footer/category
// links land here pre-filtered.

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PackageSearch } from 'lucide-react'
import { Button, EmptyState, SearchInput, Select } from '@/components/ui'
import { useCatalog } from '@/store/useCatalog'
import { StoreProductCard } from './StoreProductCard'
import { cn } from '@/lib/utils'
import type { Product } from '@/data/types'

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'newest' | 'name'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
]

/** The price a shopper sees on the card — cheapest option for variant products */
function displayPrice(p: Product): number {
  return p.variants.length ? Math.min(p.price, ...p.variants.map((v) => v.price)) : p.price
}

export default function StoreShop() {
  const products = useCatalog((s) => s.products)
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('featured')

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products])

  const categories = useMemo(() => {
    const seen: string[] = []
    for (const p of activeProducts) if (!seen.includes(p.category)) seen.push(p.category)
    return seen
  }, [activeProducts])

  // The URL param is the single source of truth for the category, so external
  // navigation (footer links, category tiles) re-syncs the chips automatically.
  const catParam = searchParams.get('cat')
  const category = catParam && categories.includes(catParam) ? catParam : 'All'

  const selectCategory = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'All') params.delete('cat')
        else params.set('cat', next)
        return params
      },
      { replace: true },
    )
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = activeProducts.filter((p) => {
      if (category !== 'All' && p.category !== category) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
    switch (sort) {
      case 'price-asc':
        return [...list].sort((a, b) => displayPrice(a) - displayPrice(b))
      case 'price-desc':
        return [...list].sort((a, b) => displayPrice(b) - displayPrice(a))
      case 'newest':
        return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      case 'name':
        return [...list].sort((a, b) => a.name.localeCompare(b.name))
      default:
        return list // Featured — keep curated source order
    }
  }, [activeProducts, category, query, sort])

  const clearFilters = () => {
    setQuery('')
    selectCategory('All')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"
    >
      <div className="relative">
        <div className="relative flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-strong dark:text-accent">
              The full catalog
            </p>
            <h1 className="shimmer-text mt-1 text-3xl font-bold tracking-tight">Shop</h1>
          </div>
          <p className="text-sm text-ink-3">
            {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          containerClassName="w-full sm:w-72"
        />
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          options={SORT_OPTIONS}
          aria-label="Sort products"
          className="w-full sm:w-52"
        />
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {['All', ...categories].map((c) => (
          <button
            key={c}
            onClick={() => selectCategory(c)}
            aria-pressed={category === c}
            className={cn(
              'shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all',
              category === c
                ? 'bg-accent text-[color:var(--accent-fg)] shadow-pop ring-1 ring-inset ring-white/20'
                : 'bg-sunken text-ink-2 ring-1 ring-inset ring-transparent hover:text-ink hover:ring-edge',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p, i) => (
            <motion.div
              key={p.id}
              className="h-full"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: (i % 4) * 0.05 }}
            >
              <StoreProductCard product={p} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card mt-6">
          <EmptyState
            icon={<PackageSearch />}
            title="No products match"
            description="Try a different search, or browse everything we make."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </div>
      )}
    </motion.div>
  )
}
