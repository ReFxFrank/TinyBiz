// "Where's my order?" — customers look up an order by number + email and get
// a live status timeline straight from the shop's real order record.

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, ExternalLink, PackageSearch, Printer, Package, Truck, Home } from 'lucide-react'
import { Button, Card, Field, Input } from '@/components/ui'
import { api, ApiError, type PublicOrder } from '@/lib/api'
import { fmtDate, money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Carrier, OrderStatus } from '@/data/types'

const CARRIER_URLS: Record<Carrier, (tn: string) => string> = {
  USPS: (tn) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}`,
  UPS: (tn) => `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}`,
  FedEx: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`,
  DHL: (tn) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(tn)}`,
}

/** Where a status sits on the customer-facing journey (0–3) */
function stageOf(status: OrderStatus): number {
  if (status === 'Delivered') return 3
  if (status === 'Shipped') return 2
  if (status === 'Ready to Ship') return 1.5
  return 1 // New / Processing / Printing / Packaging — "being made"
}

function Timeline({ order }: { order: PublicOrder }) {
  const stage = stageOf(order.status)
  const steps = [
    { icon: CheckCircle2, title: 'Order placed', body: fmtDate(order.placedAt), at: 0 },
    {
      icon: Printer,
      title: 'Being made',
      body: order.shipBy && stage < 2 ? `Printing & packing — ships by ${fmtDate(order.shipBy)}` : 'Printed & packed with care',
      at: 1,
    },
    {
      icon: Truck,
      title: 'Shipped',
      body:
        stage >= 2
          ? `${order.shippedAt ? fmtDate(order.shippedAt) : ''}${order.carrier ? ` · ${order.carrier}` : ''}`
          : 'On deck',
      at: 2,
    },
    { icon: Home, title: 'Delivered', body: order.deliveredAt ? fmtDate(order.deliveredAt) : '', at: 3 },
  ]
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const done = stage >= step.at
        const current = !done && steps[i - 1] && stage >= steps[i - 1].at
        return (
          <li key={step.title} className="relative flex gap-3.5 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn('absolute left-[17px] top-9 h-[calc(100%-36px)] w-0.5 rounded', done && stage > step.at ? 'bg-accent' : 'bg-hairline')}
              />
            )}
            <span
              className={cn(
                'z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                done
                  ? 'bg-accent text-[color:var(--accent-fg)]'
                  : current
                    ? 'bg-accent-wash text-accent-strong dark:text-accent'
                    : 'bg-sunken text-ink-3',
              )}
            >
              <step.icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 pt-1">
              <div className={cn('text-sm font-semibold', done || current ? 'text-ink' : 'text-ink-3')}>{step.title}</div>
              {step.body && <div className="mt-0.5 text-[13px] text-ink-3">{step.body}</div>}
              {step.at === 2 && order.trackingNumber && stage >= 2 && (
                <a
                  href={order.carrier ? CARRIER_URLS[order.carrier](order.trackingNumber) : '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline dark:text-accent"
                >
                  {order.trackingNumber} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function StoreTrack() {
  const [searchParams] = useSearchParams()
  const [number, setNumber] = useState(searchParams.get('number') ?? '')
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [order, setOrder] = useState<PublicOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lookup = async () => {
    if (busy || !number.trim() || !email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.track(number.trim(), email.trim())
      setOrder(res.order)
    } catch (err) {
      setOrder(null)
      setError(
        err instanceof ApiError && err.status === 404
          ? 'No order matches that number and email — double-check both and try again.'
          : 'Could not look that up right now — try again in a moment.',
      )
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void lookup()
  }

  // Deep links from the confirmation page prefill both fields — look up immediately
  useEffect(() => {
    if (searchParams.get('number') && searchParams.get('email')) void lookup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canceled = order && (order.status === 'Cancelled' || order.status === 'Returned')
  const itemsSubtotal = order ? order.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6"
    >
      <div className="text-center">
        <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient-soft text-accent">
          <PackageSearch className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Track your order</h1>
        <p className="mt-2 text-sm text-ink-3">
          Enter your order number and the email you used at checkout.
        </p>
      </div>

      <Card padding="lg" className="mt-8">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1.4fr_auto]">
          <Field label="Order number">
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="NP-1042" autoComplete="off" />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full sm:w-auto" disabled={busy || !number.trim() || !email.trim()}>
              {busy ? 'Looking…' : 'Track'}
            </Button>
          </div>
        </form>
        <div aria-live="polite">{error && <p className="mt-3 text-[13px] text-critical">{error}</p>}</div>
      </Card>

      {order && (
        <Card padding="lg" className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">
              Order {order.number}
              <span className="ml-2 font-normal text-ink-3">· {order.items.reduce((a, i) => a + i.quantity, 0)} items · {money(itemsSubtotal + order.shippingCharged + order.taxCollected)}</span>
            </h2>
            <span className="text-[13px] text-ink-3">Placed {fmtDate(order.placedAt)}</span>
          </div>

          {canceled ? (
            <div className="mt-4 rounded-xl bg-critical-wash px-4 py-3 text-sm text-critical">
              This order was {order.status.toLowerCase()}. If that's unexpected, reply to your confirmation email and
              we'll sort it out.
            </div>
          ) : (
            <div className="mt-6">
              <Timeline order={order} />
            </div>
          )}

          <div className="mt-6 border-t border-hairline pt-4">
            <ul className="space-y-1.5 text-[13px] text-ink-2">
              {order.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-3">
                  <span className="truncate">
                    {i.name} <span className="text-ink-3">× {i.quantity}</span>
                  </span>
                  <span className="shrink-0 font-medium text-ink">{money(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-3">
              Shipping to {order.shippingAddress.line1}, {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
              {order.shippingAddress.zip}
            </p>
          </div>
        </Card>
      )}

      <p className="mt-8 text-center text-sm text-ink-3">
        Lost your order number?{' '}
        <Link to="/store/shop" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
          Keep browsing
        </Link>{' '}
        — it's in your confirmation email.
      </p>
    </motion.div>
  )
}
