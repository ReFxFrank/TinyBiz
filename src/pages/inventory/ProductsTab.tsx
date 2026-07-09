import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Box, ExternalLink, MoreHorizontal, PackageMinus, SlidersHorizontal } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  IconButton,
  Menu,
  MenuItem,
  ProductTile,
  SearchInput,
  Select,
  StockBadge,
  type Column,
} from '@/components/ui'
import type { Product, ProductVariant } from '@/data/types'
import { money, num } from '@/lib/format'
import { cn, useDebounced } from '@/lib/utils'

/** One adjustable stock line: the product itself, or one of its variants */
interface StockRow {
  product: Product
  variant: ProductVariant | null
  name: string
  sku: string
  stock: number
  cost: number
}

export interface ProductsTabProps {
  products: Product[]
  query: string
  onQueryChange: (q: string) => void
  /** Category + low-stock filters live in Inventory so its stat tiles can drive them */
  category: string
  onCategoryChange: (category: string) => void
  lowOnly: boolean
  onLowOnlyChange: (low: boolean) => void
  onAdjust: (product: Product, damaged?: boolean, variantId?: string) => void
}

export default function ProductsTab({
  products,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  lowOnly,
  onLowOnlyChange,
  onAdjust,
}: ProductsTabProps) {
  const navigate = useNavigate()

  const q = useDebounced(query.trim().toLowerCase(), 200)

  // Filter options come from the products themselves, so they always match reality
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b)),
    [products],
  )

  // Variant products get one row per option so every stock level is adjustable
  const rows = useMemo(() => {
    const out: StockRow[] = []
    for (const p of products) {
      if (category && p.category !== category) continue
      if (q && !`${p.name} ${p.sku} ${p.variants.map((v) => `${v.name} ${v.sku}`).join(' ')}`.toLowerCase().includes(q)) continue
      const total = p.stock + p.variants.reduce((a, v) => a + v.stock, 0)
      if (lowOnly && total > p.reorderPoint) continue
      out.push({
        product: p,
        variant: null,
        name: p.variants.length ? `${p.name} · Standard` : p.name,
        sku: p.sku,
        stock: p.stock,
        cost: p.cost,
      })
      for (const v of p.variants) {
        out.push({ product: p, variant: v, name: `${p.name} · ${v.name}`, sku: v.sku, stock: v.stock, cost: v.cost })
      }
    }
    return out
  }, [products, category, lowOnly, q])

  const hasFilters = Boolean(q || category || lowOnly)

  const columns: Array<Column<StockRow>> = [
    {
      key: 'name',
      header: 'Product',
      render: (r) => {
        const low = r.stock <= r.product.reorderPoint
        return (
          <div className={cn('flex min-w-0 items-center gap-3 rounded-lg', low && '-mx-2 -my-1 bg-serious-wash/40 px-2 py-1')}>
            <ProductTile emoji={r.product.image} hue={r.product.imageHue} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{r.name}</div>
              <div className="truncate font-mono text-xs text-ink-3">{r.sku}</div>
            </div>
          </div>
        )
      },
      sortValue: (r) => r.name,
    },
    {
      key: 'category',
      header: 'Category',
      hideBelow: 'md',
      render: (r) => <Badge>{r.product.category}</Badge>,
      sortValue: (r) => r.product.category,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (r) => <StockBadge stock={r.stock} reorderPoint={r.product.reorderPoint} />,
      sortValue: (r) => r.stock,
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      hideBelow: 'lg',
      render: (r) => <span className="tnum text-ink-2">{num(r.product.reorderPoint)}</span>,
      sortValue: (r) => r.product.reorderPoint,
    },
    {
      key: 'cost',
      header: 'Unit cost',
      align: 'right',
      hideBelow: 'sm',
      render: (r) => <span className="tnum text-ink-2">{money(r.cost)}</span>,
      sortValue: (r) => r.cost,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (r) => <span className="tnum font-medium text-ink">{money(r.stock * r.cost)}</span>,
      sortValue: (r) => r.stock * r.cost,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 'w-12',
      render: (r) => (
        <Menu
          trigger={
            <IconButton label={`Actions for ${r.name}`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<SlidersHorizontal />} onSelect={() => onAdjust(r.product, false, r.variant?.id)}>
            Adjust stock
          </MenuItem>
          <MenuItem icon={<PackageMinus />} onSelect={() => onAdjust(r.product, true, r.variant?.id)}>
            Record damaged
          </MenuItem>
          <MenuItem icon={<ExternalLink />} onSelect={() => navigate(`/admin/products?q=${encodeURIComponent(r.product.name)}`)}>
            View product
          </MenuItem>
        </Menu>
      ),
    },
  ]

  return (
    <div>
      <FilterBar>
        <SearchInput
          aria-label="Search products"
          placeholder="Search name or SKU…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          containerClassName="w-full sm:w-64"
        />
        <Select
          aria-label="Filter by category"
          placeholder="All categories"
          options={categories}
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-44"
        />
        <Button
          variant="outline"
          size="sm"
          icon={<AlertTriangle />}
          aria-pressed={lowOnly}
          onClick={() => onLowOnlyChange(!lowOnly)}
          className={cn(lowOnly && 'border-serious/40 bg-serious-wash text-ink')}
        >
          Low stock only
        </Button>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.product.id}:${r.variant?.id ?? 'base'}`}
        initialSort={{ key: 'name', dir: 'asc' }}
        emptyState={
          <EmptyState
            icon={<Box />}
            title={hasFilters ? 'No products match your filters' : 'No products yet'}
            description={
              hasFilters
                ? 'Try clearing the search, category, or low-stock filter.'
                : 'Products you add on the Products page will show up here with their stock levels.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onQueryChange('')
                    onCategoryChange('')
                    onLowOnlyChange(false)
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => navigate('/admin/products?new=1')}>Add a product</Button>
              )
            }
          />
        }
      />
    </div>
  )
}
