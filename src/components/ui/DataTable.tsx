import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  /** Providing a sort value enables the header sort toggle */
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right' | 'center'
  /** Tailwind width class, e.g. 'w-28' */
  width?: string
  /** Responsive: hide this column below the given breakpoint */
  hideBelow?: 'sm' | 'md' | 'lg'
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  /** Shown when rows is empty (post-filter) — pass an <EmptyState/> */
  emptyState?: ReactNode
  pageSize?: number
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  loading?: boolean
  className?: string
}

const hideClasses = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }
const alignClasses = { left: 'text-left', right: 'text-right', center: 'text-center' }

/** Sortable, paginated data table. Filter rows before passing them in. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyState,
  pageSize: initialPageSize = 10,
  initialSort,
  loading,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb)) * dir
    })
  }, [rows, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1)
  }, [page, pageCount])
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : undefined) : { key, dir: 'asc' }))
    setPage(0)
  }

  if (!loading && rows.length === 0 && emptyState) {
    return <div className={cn('card overflow-hidden', className)}>{emptyState}</div>
  }

  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge bg-sunken/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap',
                    alignClasses[col.align ?? 'left'],
                    col.width,
                    col.hideBelow && hideClasses[col.hideBelow],
                  )}
                >
                  {col.sortValue ? (
                    <button
                      onClick={() => toggleSort(col.key)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-ink transition-colors',
                        sort?.key === col.key && 'text-accent',
                      )}
                      aria-label={`Sort by ${typeof col.header === 'string' ? col.header : col.key}`}
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    {columns.map((col) => (
                      <td key={col.key} className={cn('px-4 py-3.5', col.hideBelow && hideClasses[col.hideBelow])}>
                        <div className="skeleton h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : pageRows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                              e.preventDefault()
                              onRowClick(row)
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      'border-b border-hairline last:border-0 transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-sunken/60 focus-visible:bg-sunken/60',
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 align-middle',
                          alignClasses[col.align ?? 'left'],
                          col.hideBelow && hideClasses[col.hideBelow],
                        )}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize || pageSize !== initialPageSize ? (
        <div className="flex items-center justify-between gap-3 border-t border-edge px-4 py-2.5">
          <span className="text-xs text-ink-3 tnum">
            {sorted.length === 0
              ? '0 results'
              : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, sorted.length)} of ${sorted.length.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-2">
            <Select
              aria-label="Rows per page"
              className="w-[74px]"
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(0)
              }}
              options={[
                { value: '10', label: '10' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
              ]}
            />
            <IconButton label="Previous page" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft />
            </IconButton>
            <span className="text-xs text-ink-3 tnum whitespace-nowrap">
              {page + 1} / {pageCount}
            </span>
            <IconButton
              label="Next page"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight />
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  )
}
