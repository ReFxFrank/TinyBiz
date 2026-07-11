// One-click refunds. Money goes back through the SAME provider that charged
// it (Stripe payment intent / PayPal capture) — it can only ever return to
// the customer's original payment method, capped at what they actually paid
// minus anything already refunded. Every refund leaves a trail on the order
// and a confirmation email in the customer's inbox.

import { Router } from 'express'
import { uid, getItem, upsertItem, bumpRev, getMeta } from './db.js'
import { requireAuth } from './auth.js'
import { createStripeRefund } from './stripe.js'
import { refundPayPalCapture } from './paypal.js'
import { sendRefundIssued } from './email.js'

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** Owner, or staff the owner granted the Orders section (they already cancel
 *  and restock orders — the refund completes that same flow) */
function requireOrders(req, res, next) {
  if (req.user.role === 'owner' || (req.user.perms || []).includes('orders')) return next()
  res.status(403).json({ error: 'forbidden', message: 'You don’t have access to Orders.' })
}

const round2 = (n) => Math.round(n * 100) / 100

/** What the customer actually paid for this order */
export function orderPaidTotal(order) {
  const items = (order.items || []).reduce((a, i) => a + i.unitPrice * i.quantity, 0)
  return round2(items + (order.shippingCharged || 0) + (order.taxCollected || 0) - (order.discountTotal || 0))
}

export const refundsRouter = Router()
refundsRouter.use(requireAuth, requireOrders)

refundsRouter.post('/:id/refund', wrap(async (req, res) => {
  const order = getItem('orders', req.params.id)
  if (!order) return res.status(404).json({ error: 'not_found' })

  const payment = order.payment
  const provider = payment?.provider
  if (provider === 'stripe' ? !payment.paymentIntent : provider === 'paypal' ? !payment.captureId : true) {
    return res.status(400).json({
      error: 'no_charge',
      message:
        provider === 'etsy'
          ? 'Etsy collected this payment — refund it from your Etsy shop manager.'
          : 'No card charge is attached to this order, so there’s nothing to refund.',
    })
  }

  const paid = orderPaidTotal(order)
  const refundedSoFar = round2((order.refunds || []).reduce((a, r) => a + r.amount, 0))
  const remaining = round2(paid - refundedSoFar)
  if (remaining <= 0) {
    return res.status(400).json({ error: 'fully_refunded', message: 'This order is already fully refunded.' })
  }

  const amount = req.body?.amount != null ? round2(Number(req.body.amount)) : remaining
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'bad_amount', message: 'Enter a refund amount above zero.' })
  }
  if (amount > remaining) {
    return res.status(400).json({
      error: 'bad_amount',
      message: `That’s more than what’s left to refund — up to $${remaining.toFixed(2)} on this order.`,
    })
  }

  const currency = (getMeta('settings')?.currency || 'USD').toUpperCase()
  const full = amount === remaining && refundedSoFar === 0
  const result =
    provider === 'stripe'
      ? await createStripeRefund({
          paymentIntent: payment.paymentIntent,
          // Full refunds omit the amount — Stripe then returns every cent even
          // if our own total drifts from the charge by a rounding penny
          ...(full ? {} : { amountCents: Math.round(amount * 100) }),
        })
      : await refundPayPalCapture({
          captureId: payment.captureId,
          ...(full ? {} : { amount, currency }),
        })

  const record = {
    id: uid('rfd'),
    provider,
    refundId: result.id,
    amount,
    at: new Date().toISOString(),
    by: req.user.email,
  }
  const next = { ...order, refunds: [...(order.refunds || []), record] }
  upsertItem('orders', next)
  bumpRev()

  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`
  void sendRefundIssued({ order: next, amount, origin })
  res.json({ ok: true, order: next, refund: record })
}))
