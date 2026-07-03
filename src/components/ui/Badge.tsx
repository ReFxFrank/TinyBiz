import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { BatchStatus, OrderStatus, ShipmentStatus, TaskPriority } from '@/data/types'

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'yellow' | 'red' | 'violet' | 'orange'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-ink-2',
  blue: 'bg-accent-wash text-accent-strong dark:text-accent',
  green: 'bg-good-wash text-[#006300] dark:text-good',
  yellow: 'bg-warn-wash text-[#8a6100] dark:text-warn',
  red: 'bg-critical-wash text-critical',
  violet: 'bg-pop-soft text-pop',
  orange: 'bg-serious-wash text-[#b4491f] dark:text-serious',
}

export interface BadgeProps {
  tone?: BadgeTone
  /** Show a small leading status dot */
  dot?: boolean
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', dot, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  )
}

export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  New: 'blue',
  Processing: 'violet',
  Printing: 'violet',
  Packaging: 'yellow',
  'Ready to Ship': 'yellow',
  Shipped: 'blue',
  Delivered: 'green',
  Cancelled: 'neutral',
  Returned: 'red',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_STATUS_TONE[status]} dot>
      {status}
    </Badge>
  )
}

const SHIPMENT_TONE: Record<ShipmentStatus, BadgeTone> = {
  'Label created': 'neutral',
  'In transit': 'blue',
  'Out for delivery': 'yellow',
  Delivered: 'green',
  'Needs attention': 'red',
}

export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <Badge tone={SHIPMENT_TONE[status]} dot>
      {status}
    </Badge>
  )
}

const BATCH_TONE: Record<BatchStatus, BadgeTone> = {
  Queued: 'neutral',
  'In Progress': 'blue',
  Completed: 'green',
  Failed: 'red',
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  return (
    <Badge tone={BATCH_TONE[status]} dot>
      {status}
    </Badge>
  )
}

const PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  low: 'neutral',
  medium: 'yellow',
  high: 'red',
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>
}

/** Stock level pill: red when out, orange at/below reorder, green otherwise */
export function StockBadge({ stock, reorderPoint, unit }: { stock: number; reorderPoint: number; unit?: string }) {
  const label = unit ? `${stock.toLocaleString()} ${unit}` : stock.toLocaleString()
  if (stock <= 0)
    return (
      <Badge tone="red" dot>
        Out · {label}
      </Badge>
    )
  if (stock <= reorderPoint)
    return (
      <Badge tone="orange" dot>
        Low · {label}
      </Badge>
    )
  return (
    <Badge tone="green" dot>
      {label}
    </Badge>
  )
}
