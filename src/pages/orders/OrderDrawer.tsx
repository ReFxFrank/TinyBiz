import { useEffect, useRef, useState } from 'react'
import { Copy, CopyPlus, Trash2 } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  DetailLabel,
  DetailRow,
  Drawer,
  Field,
  IconButton,
  OrderStatusBadge,
  ProductTile,
  Select,
  Textarea,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { ORDER_STATUSES, type Order, type OrderStatus } from '@/data/types'
import { orderCost, orderItemsTotal, orderProfit, orderRevenue } from '@/lib/metrics'
import { dueIn, fmtDateShort, fmtDateTime, money } from '@/lib/format'
import { addDays } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { toast } from '@/store/useUI'

export interface OrderDrawerProps {
  order: Order | null
  onClose: () => void
  /** Called after duplicating so the parent can jump to the new order */
  onOpenOrder: (id: string) => void
}

export default function OrderDrawer({ order, onClose, onOpenOrder }: OrderDrawerProps) {
  const products = useStore((s) => s.products)
  const orders = useStore((s) => s.orders)
  const setOrderStatus = useStore((s) => s.setOrderStatus)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const addItem = useStore((s) => s.addItem)

  // Keep the last order around so the slide-out animation has content
  const lastRef = useRef<Order | null>(order)
  useEffect(() => {
    if (order) lastRef.current = order
  }, [order])
  const o = order ?? lastRef.current

  const [notes, setNotes] = useState(o?.notes ?? '')
  useEffect(() => setNotes(order?.notes ?? ''), [order?.id, order?.notes])
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!o) return null

  const itemsTotal = orderItemsTotal(o)
  const revenue = orderRevenue(o)
  const cost = orderCost(o)
  const profit = orderProfit(o)
  const due = o.shipBy ? dueIn(o.shipBy) : null
  const isOpen = o.status !== 'Shipped' && o.status !== 'Delivered' && o.status !== 'Cancelled' && o.status !== 'Returned'

  const saveNotes = () => {
    if (notes !== (o.notes ?? '')) {
      updateItem('orders', o.id, { notes: notes || undefined })
      toast('Notes saved', { tone: 'success' })
    }
  }

  const copyTracking = async (tracking: string) => {
    try {
      await navigator.clipboard.writeText(tracking)
      toast('Tracking number copied', { tone: 'success' })
    } catch {
      toast('Could not copy tracking number', { tone: 'error' })
    }
  }

  const duplicate = () => {
    const now = new Date()
    const clone: Order = {
      ...o,
      id: uid('ord'),
      number: `NP-${1000 + orders.length + 1}`,
      status: 'New',
      items: o.items.map((i) => ({ ...i })),
      shippingAddress: { ...o.shippingAddress },
      trackingNumber: undefined,
      carrier: undefined,
      placedAt: now.toISOString(),
      shipBy: addDays(now, 4).toISOString(),
      shippedAt: undefined,
      deliveredAt: undefined,
    }
    addItem('orders', clone)
    toast(`Order duplicated as ${clone.number}`, { tone: 'success' })
    onOpenOrder(clone.id)
  }

  return (
    <>
      <Drawer
        open={order !== null}
        onClose={onClose}
        wide
        title={
          <span className="flex items-center gap-2.5">
            <span className="font-mono">{o.number}</span>
            <OrderStatusBadge status={o.status} />
          </span>
        }
        subtitle={`Placed ${fmtDateTime(o.placedAt)} · ${o.channel}`}
        footer={
          <>
            <Button variant="ghost" icon={<Trash2 />} className="mr-auto text-critical hover:text-critical" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            <Button variant="secondary" icon={<CopyPlus />} onClick={duplicate}>
              Duplicate
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <Field label="Status">
            <Select
              options={[...ORDER_STATUSES]}
              value={o.status}
              onChange={(e) => {
                const next = e.target.value as OrderStatus
                setOrderStatus(o.id, next)
                toast(`${o.number} moved to ${next}`, { tone: 'success' })
              }}
            />
          </Field>

          <section>
            <DetailLabel>Items</DetailLabel>
            <ul className="mt-2 divide-y divide-hairline">
              {o.items.map((item) => {
                const product = products.find((p) => p.id === item.productId)
                return (
                  <li key={item.productId} className="flex items-center gap-3 py-2.5">
                    <ProductTile emoji={product?.image ?? '📦'} hue={product?.imageHue ?? 210} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{item.name}</div>
                      <div className="text-xs text-ink-3 tnum">
                        {item.quantity} × {money(item.unitPrice)}
                      </div>
                    </div>
                    <div className="tnum text-sm font-medium text-ink">{money(item.quantity * item.unitPrice)}</div>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="rounded-xl bg-sunken/60 px-4 py-1">
            <DetailRow label="Items">
              <span className="tnum">{money(itemsTotal)}</span>
            </DetailRow>
            <DetailRow label="Shipping charged">
              <span className="tnum">{money(o.shippingCharged)}</span>
            </DetailRow>
            <div className="border-t border-hairline">
              <DetailRow label="Revenue">
                <span className="tnum">{money(revenue)}</span>
              </DetailRow>
            </div>
            <DetailRow label="Tax collected">
              <span className="tnum text-ink-2">{money(o.taxCollected)}</span>
            </DetailRow>
            <DetailRow label="Cost (incl. shipping)">
              <span className="tnum text-ink-2">{money(cost)}</span>
            </DetailRow>
            <div className="border-t border-hairline">
              <DetailRow label="Profit">
                <span className={cn('tnum', profit >= 0 ? 'text-[#006300] dark:text-good' : 'text-critical')}>
                  {money(profit)}
                </span>
              </DetailRow>
            </div>
          </section>

          <section>
            <DetailLabel>Customer</DetailLabel>
            <div className="mt-2 text-sm">
              <div className="font-medium text-ink">{o.customerName}</div>
              <div className="text-ink-3">{o.email}</div>
              <div className="mt-1.5 text-ink-2">
                {o.shippingAddress.line1 ? (
                  <>
                    {o.shippingAddress.line1}
                    <br />
                    {o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.zip} ·{' '}
                    {o.shippingAddress.country}
                  </>
                ) : (
                  <span className="text-ink-3">No shipping address on file</span>
                )}
              </div>
            </div>
          </section>

          <section>
            <DetailLabel>Fulfillment</DetailLabel>
            <div className="mt-1">
              <DetailRow label="Channel">{o.channel}</DetailRow>
              <DetailRow label="Ship by">
                {o.shipBy ? (
                  <span className={cn(due?.overdue && isOpen && 'text-critical')}>
                    {fmtDateShort(o.shipBy)}
                    {isOpen && due && <span className="ml-1.5 text-xs font-normal">({due.label})</span>}
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </DetailRow>
              <DetailRow label="Carrier">{o.carrier ?? <span className="text-ink-3">—</span>}</DetailRow>
              <DetailRow label="Tracking">
                {o.trackingNumber ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[13px]">{o.trackingNumber}</span>
                    <IconButton label="Copy tracking number" size="sm" onClick={() => copyTracking(o.trackingNumber!)}>
                      <Copy />
                    </IconButton>
                  </span>
                ) : (
                  <span className="text-ink-3">Not shipped yet</span>
                )}
              </DetailRow>
            </div>
          </section>

          <Field label="Notes" hint="Saved automatically when you click away.">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Add a note about this order…"
            />
          </Field>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title={`Delete ${o.number}?`}
        description="This permanently removes the order and its line items. This cannot be undone."
        confirmLabel="Delete order"
        onConfirm={() => {
          removeItem('orders', o.id)
          toast(`Order ${o.number} deleted`, { tone: 'success' })
          onClose()
        }}
      />
    </>
  )
}
