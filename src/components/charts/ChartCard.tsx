import { useState, type ReactNode } from 'react'
import { Table2, BarChart3 } from 'lucide-react'
import { CardHeader } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export interface ChartTableView {
  headers: string[]
  rows: Array<Array<string | number>>
}

export interface ChartCardProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Right-side controls (e.g. a <Segmented> range picker) */
  actions?: ReactNode
  /**
   * The accessible table twin of the chart. Providing it adds a chart/table
   * toggle so every value is reachable without hover or color.
   */
  table?: ChartTableView
  children: ReactNode
  className?: string
}

/** Card wrapper for charts: header, actions, and a table-view twin toggle */
export function ChartCard({ title, subtitle, actions, table, children, className }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className={cn('card p-5', className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {actions}
            {table && (
              <IconButton
                label={showTable ? 'Show chart' : 'Show data table'}
                size="sm"
                active={showTable}
                onClick={() => setShowTable((v) => !v)}
              >
                {showTable ? <BarChart3 /> : <Table2 />}
              </IconButton>
            )}
          </>
        }
      />
      {showTable && table ? (
        <div className="max-h-[300px] overflow-auto rounded-xl border border-edge">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sunken">
              <tr>
                {table.headers.map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn(
                      'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3',
                      i === 0 ? 'text-left' : 'text-right',
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-hairline">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn('px-3 py-1.5', ci === 0 ? 'text-left text-ink-2' : 'text-right font-medium text-ink tnum')}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

export interface LegendItem {
  name: string
  color: string
  /** 'line' for line series, 'rect' for bars/areas */
  shape?: 'line' | 'rect'
}

/** Chart legend row — always render for two or more series */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <div className={cn('mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <span key={item.name} className="flex items-center gap-1.5 text-xs text-ink-2">
          {item.shape === 'rect' ? (
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />
          ) : (
            <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: item.color }} />
          )}
          {item.name}
        </span>
      ))}
    </div>
  )
}
