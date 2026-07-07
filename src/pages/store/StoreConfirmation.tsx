// Order confirmation — the celebratory landing after checkout. Looks the order
// up in the real admin store, so refreshing (or the shop owner peeking at the
// admin) shows exactly what the customer just placed.

import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, Package, Printer, ShoppingBag, Truck } from 'lucide-react'
import { Button, Card, EmptyState } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { fmtDate, money } from '@/lib/format'

const tileGradient = (hue: number) =>
  `linear-gradient(135deg, hsl(${hue}, 70%, 92%), hsl(${(hue + 40) % 360}, 60%, 86%))`

/** Matches the promo annotation checkout writes into order notes */
const PROMO_NOTE_RE = /Promo\s+\S+\s+\(−\d+%\)/

export default function StoreConfirmation() {
  const { orderId } = useParams()
  const order = useStore((s) => s.orders.find((o) => o.id === orderId))
  const products = useStore((s) => s.products)
  const settings = useStore((s) => s.settings)

  if (!order) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<ShoppingBag />}
          title="We couldn’t find that order"
          description="The link may be out of date — but the shop is always open."
          action={
            <Link to="/store/shop">
              <Button>Back to the shop</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const firstName = order.customerName.split(' ')[0]
  const itemsSubtotal = order.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0)
  const total = itemsSubtotal + order.shippingCharged + order.taxCollected
  const promoNote = order.notes?.match(PROMO_NOTE_RE)?.[0]

  const steps = [
    {
      icon: Printer,
      title: 'We print & quality-check it',
      body: order.shipBy
        ? `Made to order in our studio — ships by ${fmtDate(order.shipBy)}.`
        : 'Made to order in our studio.',
    },
    {
      icon: Package,
      title: 'Carefully packed',
      body: 'Wrapped up snug so it arrives exactly as it left the printer.',
    },
    {
      icon: Truck,
      title: 'On its way with tracking',
      body: 'You’ll get a tracking number the moment it ships.',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {/* Celebration header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-wash">
            <CheckCircle2 className="h-8 w-8 text-accent-strong dark:text-accent" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-ink sm:text-3xl">Order confirmed! 🎉</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            Thanks {firstName}! Your order <span className="font-semibold text-ink">{order.number}</span> is in.
          </p>
          <p className="mt-1 text-sm text-ink-3">
            A confirmation email is on its way to <span className="break-all font-medium text-ink-2">{order.email}</span>.
          </p>
        </div>

        {/* Order summary */}
        <Card padding="lg" className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Order summary</h2>
            <span className="text-[13px] text-ink-3">
              {order.number} · {fmtDate(order.placedAt)}
            </span>
          </div>

          <ul className="mt-4 space-y-3">
            {order.items.map((it, idx) => {
              const product = products.find((p) => p.id === it.productId)
              return (
                <li key={`${it.productId}-${idx}`} className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl"
                    style={{ background: tileGradient(product?.imageHue ?? 220) }}
                    aria-hidden
                  >
                    {product?.image ?? '📦'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{it.name}</div>
                    <div className="text-xs text-ink-3">
                      {it.quantity} × {money(it.unitPrice)}
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold text-ink">{money(it.unitPrice * it.quantity)}</div>
                </li>
              )
            })}
          </ul>

          {promoNote && <div className="mt-3 text-[13px] font-medium text-[#006300] dark:text-good">Promo applied — {promoNote}</div>}

          <div className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-sm">
            <div className="flex items-center justify-between text-ink-2">
              <span>Subtotal</span>
              <span className="font-medium text-ink">{money(itemsSubtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-ink-2">
              <span>Shipping</span>
              {order.shippingCharged === 0 ? (
                <span className="font-medium text-[#006300] dark:text-good">Free</span>
              ) : (
                <span className="font-medium text-ink">{money(order.shippingCharged)}</span>
              )}
            </div>
            <div className="flex items-center justify-between text-ink-2">
              <span>Tax</span>
              <span className="font-medium text-ink">{money(order.taxCollected)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-hairline pt-2 text-[15px] font-semibold text-ink">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
          </div>

          <p className="mt-4 text-xs text-ink-3">
            Shipping to {order.shippingAddress.line1}, {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
            {order.shippingAddress.zip}
          </p>
        </Card>

        {/* What happens next */}
        <Card padding="lg" className="mt-5">
          <h2 className="text-[15px] font-semibold text-ink">What happens next</h2>
          <ol className="mt-4 space-y-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-strong dark:text-accent">
                  <step.icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <div className="text-sm font-medium text-ink">
                    <span className="mr-1.5 text-ink-3">{i + 1}.</span>
                    {step.title}
                  </div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{step.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* Actions */}
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link to="/store/shop" className="sm:w-auto">
            <Button size="lg" className="w-full">
              Continue shopping
            </Button>
          </Link>
          <Link to="/store" className="sm:w-auto">
            <Button size="lg" variant="ghost" className="w-full">
              Back to home
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-ink-3">
          Questions about your order? Email{' '}
          <a
            href={`mailto:${settings.email}`}
            className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {settings.email}
          </a>
          .
        </p>
      </motion.div>
    </div>
  )
}
