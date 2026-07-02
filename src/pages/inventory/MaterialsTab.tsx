import { useMemo, useState } from 'react'
import { AlertTriangle, Layers, MoreHorizontal, PackageMinus, Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
  SearchInput,
  Select,
  StockBadge,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Material, MaterialCategory } from '@/data/types'
import { money, num } from '@/lib/format'
import { cn, useDebounced } from '@/lib/utils'

const CATEGORIES: MaterialCategory[] = [
  'Filament',
  'Packaging',
  'Stickers',
  'Boxes',
  'Shipping supplies',
  'Components',
  'Inserts',
]

export interface MaterialsTabProps {
  materials: Material[]
  query: string
  onQueryChange: (q: string) => void
  onAdjust: (material: Material, damaged?: boolean) => void
  onEdit: (material: Material) => void
  onAdd: () => void
}

export default function MaterialsTab({ materials, query, onQueryChange, onAdjust, onEdit, onAdd }: MaterialsTabProps) {
  const removeItem = useStore((s) => s.removeItem)
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [deleting, setDeleting] = useState<Material | null>(null)

  const q = useDebounced(query.trim().toLowerCase(), 200)

  const filtered = useMemo(
    () =>
      materials.filter((m) => {
        if (category && m.category !== category) return false
        if (lowOnly && m.stock > m.reorderPoint) return false
        if (q && !`${m.name} ${m.sku}`.toLowerCase().includes(q)) return false
        return true
      }),
    [materials, category, lowOnly, q],
  )

  const hasFilters = Boolean(q || category || lowOnly)

  const columns: Array<Column<Material>> = [
    {
      key: 'name',
      header: 'Material',
      render: (m) => {
        const low = m.stock <= m.reorderPoint
        return (
          <div className={cn('min-w-0 rounded-lg', low && '-mx-2 -my-1 bg-serious-wash/40 px-2 py-1')}>
            <div className="truncate font-medium text-ink">{m.name}</div>
            <div className="truncate font-mono text-xs text-ink-3">{m.sku}</div>
          </div>
        )
      },
      sortValue: (m) => m.name,
    },
    {
      key: 'category',
      header: 'Category',
      hideBelow: 'md',
      render: (m) => <Badge>{m.category}</Badge>,
      sortValue: (m) => m.category,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (m) => <StockBadge stock={m.stock} reorderPoint={m.reorderPoint} unit={m.unit} />,
      sortValue: (m) => m.stock,
    },
    {
      key: 'reorder',
      header: 'Reorder at',
      align: 'right',
      hideBelow: 'lg',
      render: (m) => (
        <span className="tnum text-ink-2">
          {num(m.reorderPoint)} {m.unit}
        </span>
      ),
      sortValue: (m) => m.reorderPoint,
    },
    {
      key: 'cost',
      header: 'Cost/unit',
      align: 'right',
      hideBelow: 'sm',
      render: (m) => <span className="tnum text-ink-2">{money(m.costPerUnit)}</span>,
      sortValue: (m) => m.costPerUnit,
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (m) => <span className="tnum font-medium text-ink">{money(m.stock * m.costPerUnit)}</span>,
      sortValue: (m) => m.stock * m.costPerUnit,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 'w-12',
      render: (m) => (
        <Menu
          trigger={
            <IconButton label={`Actions for ${m.name}`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<SlidersHorizontal />} onSelect={() => onAdjust(m)}>
            Adjust stock
          </MenuItem>
          <MenuItem icon={<PackageMinus />} onSelect={() => onAdjust(m, true)}>
            Record damaged
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={() => onEdit(m)}>
            Edit
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(m)}>
            Delete
          </MenuItem>
        </Menu>
      ),
    },
  ]

  return (
    <div>
      <FilterBar>
        <SearchInput
          aria-label="Search materials"
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
          onChange={(e) => setCategory(e.target.value)}
          className="w-44"
        />
        <Button
          variant="outline"
          size="sm"
          icon={<AlertTriangle />}
          aria-pressed={lowOnly}
          onClick={() => setLowOnly((v) => !v)}
          className={cn(lowOnly && 'border-serious/40 bg-serious-wash text-ink')}
        >
          Low stock only
        </Button>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(m) => m.id}
        initialSort={{ key: 'name', dir: 'asc' }}
        emptyState={
          <EmptyState
            icon={<Layers />}
            title={hasFilters ? 'No materials match your filters' : 'No materials yet'}
            description={
              hasFilters
                ? 'Try clearing the search, category, or low-stock filter.'
                : 'Track filament, packaging, and supplies so production never runs dry.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onQueryChange('')
                    setCategory('')
                    setLowOnly(false)
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button icon={<Plus />} onClick={onAdd}>
                  Add material
                </Button>
              )
            }
          />
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            removeItem('materials', deleting.id)
            toast('Material deleted', { description: `${deleting.name} removed from inventory.`, tone: 'success' })
          }
        }}
        title="Delete material?"
        description={deleting ? `“${deleting.name}” and its stock level will be removed. This cannot be undone.` : undefined}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
