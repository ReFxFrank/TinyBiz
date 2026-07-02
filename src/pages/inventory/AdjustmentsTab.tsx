import { History } from 'lucide-react'
import { Badge, DataTable, EmptyState, type Column, type BadgeTone } from '@/components/ui'
import type { AdjustmentReason, StockAdjustment } from '@/data/types'
import { fmtDateTime, num } from '@/lib/format'
import { cn } from '@/lib/utils'

const REASON_TONE: Partial<Record<AdjustmentReason, BadgeTone>> = {
  Damaged: 'red',
  Lost: 'red',
  Received: 'green',
  Production: 'green',
}

const columns: Array<Column<StockAdjustment>> = [
  {
    key: 'date',
    header: 'Date',
    render: (a) => <span className="whitespace-nowrap text-ink-2">{fmtDateTime(a.date)}</span>,
    sortValue: (a) => new Date(a.date).getTime(),
  },
  {
    key: 'item',
    header: 'Item',
    render: (a) => (
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-ink">{a.itemName}</span>
        <Badge tone={a.itemType === 'product' ? 'blue' : 'violet'}>{a.itemType}</Badge>
      </div>
    ),
    sortValue: (a) => a.itemName,
  },
  {
    key: 'delta',
    header: 'Change',
    align: 'right',
    render: (a) => (
      <span className={cn('tnum font-semibold', a.delta >= 0 ? 'text-[#006300] dark:text-good' : 'text-critical')}>
        {a.delta >= 0 ? '+' : '−'}
        {num(Math.abs(a.delta))}
      </span>
    ),
    sortValue: (a) => a.delta,
  },
  {
    key: 'reason',
    header: 'Reason',
    render: (a) => <Badge tone={REASON_TONE[a.reason] ?? 'neutral'}>{a.reason}</Badge>,
    sortValue: (a) => a.reason,
  },
  {
    key: 'notes',
    header: 'Notes',
    hideBelow: 'md',
    render: (a) => <span className="block max-w-xs truncate text-ink-3">{a.notes || '—'}</span>,
  },
]

export default function AdjustmentsTab({ adjustments }: { adjustments: StockAdjustment[] }) {
  return (
    <DataTable
      columns={columns}
      rows={adjustments}
      rowKey={(a) => a.id}
      initialSort={{ key: 'date', dir: 'desc' }}
      emptyState={
        <EmptyState
          icon={<History />}
          title="No adjustments yet"
          description="Stock changes — recounts, damage, production runs — will be logged here automatically."
        />
      }
    />
  )
}
