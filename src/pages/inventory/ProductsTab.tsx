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
import type { Product, ProductCategory } from '@/data/types'
import { money, num } from '@/lib/format'
import { cn, useDebounced } from '@/lib/utils'

const CATEGORIES: ProductCategory[] = ['3D Prints', 'Stickers', 'Accessories', 'Home & Desk', 'Packaging Add-ons']

export interface ProductsTabProps {
  products: Product[]
  query: string
  onQueryChange: (q: string) => void
  /** Category + low-stock filters live in Inventory so its stat tiles can drive them */
  category: string
  onCategoryChange: (category: string) => void
  lowOnly: boolean
  onLowOnlyChange: (low: boolean) => void
  onAdjust: (product: Product, damaged?: boolean) => void
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

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (category && p.category !== category) return false
        if (lowOnly && p.stock > p.reorderPoint) return false
        if (q && !`${p.name} ${p.sku}`.toLowerCase().includes(q)) return false
        return true
      }),
    [products, category, lowOnly, q],
  )

  const hasFilters = Boolean(q || category || lowOnly)

  const columns: Array<Column<Product>> = [
    {
      key: 'name',
      header: 'Product',
      render: (p) => {
        const low = p.stock <= p.reorderPoint
        return (
          <div className={cn('flex min-w-0 items-center gap-3 rounded-lg', low && '-mx-2 -my-1 bg-serious-wash/40 px-2 py-1')}>
            <ProductTile emoji={p.image} hue={p.imageHue} size="sm" />
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{p.name}</div>
              <div className="truncate font-mono text-xs text-ink-3">{p.sku}</div>
            </div>
          </div>
        )
      },
      sortValue: (p) => p.name,
    },
    {
      key: 'category',
      header: 'Category',
      hideBelow: 'md',
      render: (p) => <Badge>{p.category}</Badge>,
      sortValue: (p) => p.category,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (p) => <StockBadge stock={p.stock} reorderPoint={p.reorderPoint} />,
      sortValue: (p) => p.stock,
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      hideBelow: 'lg',
      render: (p) => <span className="tnum text-ink-2">{num(p.reorderPoint)}</span>,
      sortValue: (p) => p.reorderPoint,
    },
    {
      key: 'cost',
      header: 'Unit cost',
      align: 'right',
      hideBelow: 'sm',
      render: (p) => <span className="tnum text-ink-2">{money(p.cost)}</span>,
      sortValue: (p) => p.cost,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (p) => <span className="tnum font-medium text-ink">{money(p.stock * p.cost)}</span>,
      sortValue: (p) => p.stock * p.cost,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 'w-12',
      render: (p) => (
        <Menu
          trigger={
            <IconButton label={`Actions for ${p.name}`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<SlidersHorizontal />} onSelect={() => onAdjust(p)}>
            Adjust stock
          </MenuItem>
          <MenuItem icon={<PackageMinus />} onSelect={() => onAdjust(p, true)}>
            Record damaged
          </MenuItem>
          <MenuItem icon={<ExternalLink />} onSelect={() => navigate(`/admin/products?q=${encodeURIComponent(p.name)}`)}>
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
          options={CATEGORIES}
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
        rows={filtered}
        rowKey={(p) => p.id}
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
