import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Box, PackageSearch, Percent, Plus, Wallet } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  ProductTile,
  SearchInput,
  Segmented,
  Select,
  SkeletonStats,
  SkeletonTable,
  Stat,
  StockBadge,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Product } from '@/data/types'
import { lowStockProducts } from '@/lib/metrics'
import { minutesToHours, money, moneyCompact, num, pct } from '@/lib/format'
import { cn, sum, useDebounced, useLoaded } from '@/lib/utils'
import ProductDrawer, { marginClass, marginPct } from './products/ProductDrawer'
import ProductModal, { PRODUCT_CATEGORIES } from './products/ProductModal'

type View = 'grid' | 'table'
type SortKey = 'name' | 'price' | 'stock' | 'margin'

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'price', label: 'Price (high–low)' },
  { value: 'stock', label: 'Stock (high–low)' },
  { value: 'margin', label: 'Margin (high–low)' },
]

function MarginBadge({ product }: { product: Product }) {
  const m = marginPct(product.price, product.cost)
  return (
    <Badge tone={m > 60 ? 'green' : 'neutral'} className="tnum">
      {pct(m, 0)} margin
    </Badge>
  )
}

/** One catalog card in the grid view */
function ProductCard({ product, onOpen }: { product: Product; onOpen: () => void }) {
  const extraTags = product.tags.length - 2
  return (
    <button
      onClick={onOpen}
      className={cn(
        'card group overflow-hidden text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted',
        !product.active && 'opacity-60',
      )}
    >
      <div className="brand-gradient-soft flex items-center justify-center py-6">
        <ProductTile emoji={product.image} hue={product.imageHue} size="xl" className="transition-transform duration-200 group-hover:scale-105" />
      </div>
      <div className="space-y-2.5 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{product.name}</span>
            {!product.active && <Badge>Inactive</Badge>}
          </div>
          <div className="mt-0.5 font-mono text-xs text-ink-3">{product.sku}</div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="tnum font-semibold text-ink">{money(product.price)}</span>
          <MarginBadge product={product} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StockBadge stock={product.stock} reorderPoint={product.reorderPoint} />
          <Badge>{product.category}</Badge>
        </div>
        {product.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {product.tags.slice(0, 2).map((t) => (
              <span key={t} className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-3">
                {t}
              </span>
            ))}
            {extraTags > 0 && <span className="text-[11px] font-medium text-ink-3">+{extraTags}</span>}
          </div>
        )}
      </div>
    </button>
  )
}

export default function Products() {
  const loaded = useLoaded()
  const products = useStore((s) => s.products)
  const [searchParams, setSearchParams] = useSearchParams()

  const [view, setView] = useState<View>('grid')
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const [category, setCategory] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  // ?new=1 auto-opens the create modal
  useEffect(() => {
    if (searchParams.get('new')) {
      setEditing(null)
      setFormOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const q = useDebounced(query.trim().toLowerCase(), 200)

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (category && p.category !== category) return false
        if (q) {
          const hay = `${p.name} ${p.sku} ${p.tags.join(' ')}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      }),
    [products, q, category],
  )

  const gridSorted = useMemo(() => {
    const arr = [...filtered]
    switch (sortKey) {
      case 'price':
        arr.sort((a, b) => b.price - a.price)
        break
      case 'stock':
        arr.sort((a, b) => b.stock - a.stock)
        break
      case 'margin':
        arr.sort((a, b) => marginPct(b.price, b.cost) - marginPct(a.price, a.cost))
        break
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name))
    }
    return arr
  }, [filtered, sortKey])

  const stats = useMemo(() => {
    const active = products.filter((p) => p.active)
    return {
      active: active.length,
      retailValue: sum(active.map((p) => p.price * p.stock)),
      avgMargin: active.length ? sum(active.map((p) => marginPct(p.price, p.cost))) / active.length : 0,
      lowStock: lowStockProducts(products).length,
    }
  }, [products])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const columns: Array<Column<Product>> = [
    {
      key: 'name',
      header: 'Product',
      render: (p) => (
        <div className={cn('flex min-w-0 items-center gap-3', !p.active && 'opacity-60')}>
          <ProductTile emoji={p.image} hue={p.imageHue} size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">{p.name}</span>
              {!p.active && <Badge>Inactive</Badge>}
            </div>
            <div className="font-mono text-xs text-ink-3">{p.sku}</div>
          </div>
        </div>
      ),
      sortValue: (p) => p.name,
    },
    {
      key: 'category',
      header: 'Category',
      render: (p) => <Badge>{p.category}</Badge>,
      sortValue: (p) => p.category,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (p) => <span className="tnum font-medium text-ink">{money(p.price)}</span>,
      sortValue: (p) => p.price,
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      hideBelow: 'lg',
      render: (p) => <span className="tnum text-ink-2">{money(p.cost)}</span>,
      sortValue: (p) => p.cost,
    },
    {
      key: 'margin',
      header: 'Margin %',
      align: 'right',
      render: (p) => {
        const m = marginPct(p.price, p.cost)
        return <span className={cn('tnum font-medium', marginClass(m))}>{pct(m, 0)}</span>
      },
      sortValue: (p) => marginPct(p.price, p.cost),
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (p) => <StockBadge stock={p.stock} reorderPoint={p.reorderPoint} />,
      sortValue: (p) => p.stock,
    },
    {
      key: 'production',
      header: 'Production',
      align: 'right',
      hideBelow: 'lg',
      render: (p) => <span className="tnum text-ink-2">{minutesToHours(p.productionTimeMin)}</span>,
      sortValue: (p) => p.productionTimeMin,
    },
  ]

  const hasFilters = Boolean(q || category)
  const emptyState = (
    <EmptyState
      icon={<PackageSearch />}
      title={hasFilters ? 'No products match your filters' : 'No products yet'}
      description={
        hasFilters
          ? 'Try a different search or clear the category filter.'
          : 'Add your first product and it will show up here.'
      }
      action={
        hasFilters ? (
          <Button
            variant="secondary"
            onClick={() => {
              setQuery('')
              setCategory('')
            }}
          >
            Clear filters
          </Button>
        ) : (
          <Button icon={<Plus />} onClick={openCreate}>
            New product
          </Button>
        )
      }
    />
  )

  const selected = selectedId ? (products.find((p) => p.id === selectedId) ?? null) : null

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your catalog — pricing, margins, stock, and what it takes to make each one."
        actions={
          <>
            <Segmented<View>
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'table', label: 'Table' },
              ]}
              value={view}
              onChange={setView}
              size="md"
            />
            <Button icon={<Plus />} onClick={openCreate}>
              New product
            </Button>
          </>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonTable rows={8} />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Active products" value={num(stats.active)} icon={<Box />} />
            <Stat label="Total retail value" value={moneyCompact(stats.retailValue)} icon={<Wallet />} />
            <Stat label="Average margin" value={pct(stats.avgMargin, 1)} icon={<Percent />} />
            <Stat
              label="Low stock products"
              value={
                <span className={cn(stats.lowStock > 0 && 'text-critical')}>{num(stats.lowStock)}</span>
              }
              icon={<AlertTriangle />}
            />
          </div>

          <div>
            <FilterBar>
              <SearchInput
                aria-label="Search products"
                placeholder="Search name, SKU, tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                containerClassName="w-full sm:w-64"
              />
              <Select
                aria-label="Filter by category"
                placeholder="All categories"
                options={PRODUCT_CATEGORIES}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-44"
              />
              {view === 'grid' && (
                <Select
                  aria-label="Sort products"
                  options={SORT_OPTIONS}
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="ml-auto w-44"
                />
              )}
            </FilterBar>

            {view === 'grid' ? (
              gridSorted.length === 0 ? (
                <div className="card">{emptyState}</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {gridSorted.map((p) => (
                    <ProductCard key={p.id} product={p} onOpen={() => setSelectedId(p.id)} />
                  ))}
                </div>
              )
            ) : (
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(p) => p.id}
                onRowClick={(p) => setSelectedId(p.id)}
                initialSort={{ key: 'name', dir: 'asc' }}
                pageSize={10}
                emptyState={emptyState}
              />
            )}
          </div>
        </motion.div>
      )}

      <ProductDrawer
        product={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(p) => {
          setSelectedId(null)
          setEditing(p)
          setFormOpen(true)
        }}
        onDuplicated={(id) => setSelectedId(id)}
      />
      <ProductModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
    </div>
  )
}
