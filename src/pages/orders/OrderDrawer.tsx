import { useEffect, useRef, useState } from 'react'
import { Copy, CopyPlus, ExternalLink, Printer, Trash2, Undo2 } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DetailLabel,
  DetailRow,
  Drawer,
  Field,
  IconButton,
  Input,
  OrderStatusBadge,
  ProductTile,
  Select,
  Textarea,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { ORDER_STATUSES, type Carrier, type Order, type OrderStatus } from '@/data/types'

const CARRIERS: Carrier[] = ['Canada Post', 'USPS', 'UPS', 'FedEx', 'DHL']
import { nextOrderNumber, orderCost, orderItemsTotal, orderProfit, orderRevenue } from '@/lib/metrics'
import { dueIn, fmtDateShort, fmtDateTime, money } from '@/lib/format'
import { addDays } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'
import { toast } from '@/store/useUI'
import { printPackingSlip } from '@/lib/packingSlip'
import { api, ApiError } from '@/lib/api'

const round2 = (n: number) => Math.round(n * 100) / 100
/** What the customer actually paid (mirrors server/refunds.js) */
const paidTotal = (o: Order) =>
  round2(o.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0) + o.shippingCharged + o.taxCollected - (o.discountTotal ?? 0))
const refundedTotal = (o: Order) => round2((o.refunds ?? []).reduce((a, r) => a + r.amount, 0))

/** The refund trail inside the money summary */
function RefundRows({ order: o }: { order: Order }) {
  if (!o.refunds?.length) return null
  return (
    <div className="border-t border-hairline">
      {o.refunds.map((r) => (
        <DetailRow key={r.id} label={`Refunded ${fmtDateShort(r.at)}`}>
          <span className="tnum text-critical">−{money(r.amount)}</span>
        </DetailRow>
      ))}
    </div>
  )
}

/** One-click refunds — replaces the old "do it in the dashboard" links */
function RefundControl({ order: o }: { order: Order }) {
  const updateItem = useStore((s) => s.updateItem)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setOpen(false)
    setAmount('')
  }, [o.id])

  const refundable = o.payment?.provider === 'stripe' || o.payment?.provider === 'paypal'
  if (!refundable) return null
  const remaining = round2(paidTotal(o) - refundedTotal(o))
  if (remaining <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-sunken/60 px-4 py-3 text-sm text-ink-2">
        <Undo2 className="h-4 w-4 shrink-0 text-ink-3" />
        Fully refunded — the money went back through {o.payment?.provider === 'paypal' ? 'PayPal' : 'Stripe'}.
      </div>
    )
  }

  const parsed = amount.trim() === '' ? remaining : round2(Number(amount))
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= remaining

  const refund = async () => {
    if (busy || !valid) return
    setBusy(true)
    try {
      const r = await api.refundOrder(o.id, parsed === remaining ? undefined : parsed)
      updateItem('orders', o.id, { refunds: r.order.refunds })
      setOpen(false)
      setAmount('')
      toast(`Refunded ${money(r.refund.amount)}`, {
        description: 'The customer gets a confirmation email — banks show it within 5–10 days.',
        tone: 'success',
      })
    } catch (err) {
      toast('Refund failed', {
        description: err instanceof ApiError ? err.message : 'Try again in a moment.',
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-hairline bg-surface p-3.5">
      {open ? (
        <div>
          <div className="text-[13px] font-medium text-ink-2">
            Refund through {o.payment?.provider === 'paypal' ? 'PayPal' : 'Stripe'} — up to {money(remaining)}
            {refundedTotal(o) > 0 ? ` (${money(refundedTotal(o))} already refunded)` : ''}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={remaining.toFixed(2)}
              inputMode="decimal"
              aria-label="Refund amount"
              className="w-32 tnum"
            />
            <Button size="sm" disabled={busy || !valid} onClick={() => void refund()}>
              {busy ? 'Refunding…' : `Refund ${valid ? money(parsed) : ''}`.trim()}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Goes straight back to the customer's original payment method — they get an email confirmation.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] text-ink-2">
            {refundedTotal(o) > 0
              ? `${money(refundedTotal(o))} refunded so far · ${money(remaining)} left`
              : 'Need to send money back? One click, no dashboards.'}
          </span>
          <Button size="sm" variant="secondary" icon={<Undo2 />} onClick={() => setOpen(true)}>
            Refund…
          </Button>
        </div>
      )}
    </section>
  )
}

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
  useEffect(() => {
    setNotes(order?.notes ?? '')
  }, [order?.id, order?.notes])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [trackingDraft, setTrackingDraft] = useState(o?.trackingNumber ?? '')
  const [carrierDraft, setCarrierDraft] = useState<Carrier>(o?.carrier ?? 'Canada Post')
  useEffect(() => {
    setTrackingDraft(order?.trackingNumber ?? '')
    setCarrierDraft(order?.carrier ?? 'Canada Post')
  }, [order?.id, order?.trackingNumber, order?.carrier])

  if (!o) return null

  const saveTracking = () => {
    const tn = trackingDraft.trim()
    updateItem('orders', o.id, { trackingNumber: tn || undefined, carrier: tn ? carrierDraft : o.carrier })
    toast(tn ? 'Tracking saved' : 'Tracking cleared', {
      description:
        tn && o.status === 'Shipped'
          ? 'The customer gets an email with the tracking link.'
          : tn
            ? 'It goes out in the shipped email when you mark this shipped.'
            : undefined,
      tone: 'success',
    })
  }

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
      number: nextOrderNumber(orders),
      status: 'New',
      items: o.items.map((i) => ({ ...i })),
      shippingAddress: { ...o.shippingAddress },
      trackingNumber: undefined,
      carrier: undefined,
      placedAt: now.toISOString(),
      shipBy: addDays(now, 4).toISOString(),
      shippedAt: undefined,
      deliveredAt: undefined,
      payment: undefined, // the copy hasn't collected anything
      refunds: undefined,
      restockedAt: undefined,
      stockDeductedAt: undefined, // server deducts fresh stock for the copy
      etsyReceiptId: undefined,
      reviewRequestedAt: undefined,
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
            <Button
              variant="secondary"
              icon={<Printer />}
              onClick={() => printPackingSlip(o, products, useStore.getState().settings)}
            >
              Packing slip
            </Button>
            <Button variant="secondary" icon={<CopyPlus />} onClick={duplicate}>
              Duplicate
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <Field
            label="Status"
            hint={
              o.channel === 'Website'
                ? 'Cancelled/Returned puts website-order items back in stock and emails the customer.'
                : undefined
            }
          >
            <Select
              options={[...ORDER_STATUSES]}
              value={o.status}
              onChange={(e) => {
                const next = e.target.value as OrderStatus
                setOrderStatus(o.id, next)
                if (
                  (next === 'Cancelled' || next === 'Returned') &&
                  (o.payment?.provider === 'stripe' || o.payment?.provider === 'paypal')
                ) {
                  toast(`${o.number} ${next.toLowerCase()} — don't forget the refund`, {
                    description: 'Items restock automatically; the Refund button below sends the money back in one click.',
                    tone: 'default',
                  })
                } else {
                  toast(`${o.number} moved to ${next}`, { tone: 'success' })
                }
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
            {(o.discountTotal ?? 0) > 0 && (
              <DetailRow label="Discount">
                <span className="tnum text-[#006300] dark:text-good">−{money(o.discountTotal!)}</span>
              </DetailRow>
            )}
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
            {o.payment && (
              <div className="border-t border-hairline">
                <DetailRow label="Payment">
                  {o.payment.provider === 'stripe' || o.payment.provider === 'paypal' ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Badge tone="green">Paid via {o.payment.provider === 'paypal' ? 'PayPal' : 'Stripe'}</Badge>
                      <a
                        href={
                          o.payment.provider === 'paypal'
                            ? `https://www.paypal.com/activity/payment/${encodeURIComponent(o.payment.captureId ?? '')}`
                            : `https://dashboard.stripe.com/payments/${encodeURIComponent(o.payment.paymentIntent ?? '')}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink hover:underline"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    </span>
                  ) : o.payment.provider === 'etsy' ? (
                    <Badge tone="green">Paid on Etsy</Badge>
                  ) : (
                    <Badge tone="yellow">No payment collected</Badge>
                  )}
                </DetailRow>
              </div>
            )}
            <RefundRows order={o} />
          </section>

          <RefundControl order={o} />

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
            </div>
            {/* The REAL carrier tracking number, typed in from the Canada Post
                receipt — it lands in the customer's shipped email verbatim */}
            <div className="mt-2 grid grid-cols-[130px_1fr_auto] items-end gap-2">
              <Field label="Carrier">
                <Select
                  options={[...CARRIERS]}
                  value={carrierDraft}
                  onChange={(e) => setCarrierDraft(e.target.value as Carrier)}
                />
              </Field>
              <Field label="Tracking number">
                <Input
                  value={trackingDraft}
                  onChange={(e) => setTrackingDraft(e.target.value)}
                  placeholder="Paste the number from your shipping receipt"
                  className="font-mono"
                />
              </Field>
              <div className="flex items-center gap-1 pb-0.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={trackingDraft.trim() === (o.trackingNumber ?? '') && carrierDraft === (o.carrier ?? 'Canada Post')}
                  onClick={saveTracking}
                >
                  Save
                </Button>
                {o.trackingNumber && (
                  <IconButton label="Copy tracking number" size="sm" onClick={() => copyTracking(o.trackingNumber!)}>
                    <Copy />
                  </IconButton>
                )}
              </div>
            </div>
            {o.status === 'Shipped' && !o.trackingNumber && (
              <p className="mt-1.5 text-xs text-ink-3">
                Saving a tracking number now still emails it to the customer.
              </p>
            )}
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
