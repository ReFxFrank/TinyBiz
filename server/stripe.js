// Minimal Stripe client — raw REST + webhook signature verification, no SDK.
// Configure with environment variables (usually /etc/tinybiz.env on the VPS):
//   STRIPE_SECRET_KEY      sk_live_… or sk_test_…   (absent → mock checkout)
//   STRIPE_WEBHOOK_SECRET  whsec_…                  (optional; the return-URL
//                          poll finalizes paid orders even without webhooks)

import crypto from 'node:crypto'
import { getMeta } from './db.js'

const API = 'https://api.stripe.com/v1'

export function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

/** Flatten {a: {b: 1}, c: [x]} into Stripe's form encoding a[b]=1&c[0]=x */
function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}[${key}]` : key
    if (value == null) continue
    if (typeof value === 'object') formEncode(value, name, out)
    else out.append(name, String(value))
  }
  return out
}

async function stripeRequest(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? formEncode(body).toString() : undefined,
  })
  const data = await res.json()
  if (!res.ok) {
    throw Object.assign(new Error(data?.error?.message || `Stripe ${res.status}`), {
      status: 502,
      error: 'stripe',
    })
  }
  return data
}

/** Create a hosted Checkout Session for a priced cart */
export async function createCheckoutSession({ priced, ref, origin }) {
  const currency = (getMeta('settings')?.currency || 'USD').toLowerCase()
  const line_items = priced.totals.lines.map((l) => ({
    quantity: l.qty,
    price_data: {
      currency,
      unit_amount: Math.round(l.discountedUnitPrice * 100),
      product_data: { name: l.name },
    },
  }))
  if (priced.totals.shipping > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency, unit_amount: Math.round(priced.totals.shipping * 100), product_data: { name: 'Shipping' } },
    })
  }
  if (priced.totals.tax > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency, unit_amount: Math.round(priced.totals.tax * 100), product_data: { name: 'Sales tax' } },
    })
  }
  return stripeRequest('POST', '/checkout/sessions', {
    mode: 'payment',
    customer_email: priced.contact.email,
    line_items,
    metadata: { ref },
    success_url: `${origin}/confirmation/stripe?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout?canceled=1`,
  })
}

export function getCheckoutSession(id) {
  return stripeRequest('GET', `/checkout/sessions/${encodeURIComponent(id)}`)
}

/**
 * Verify a Stripe-Signature header against the raw request body.
 * Scheme: HMAC-SHA256(webhook secret, "<timestamp>.<payload>") vs v1 values.
 */
export function verifyWebhookSignature(rawBody, header) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !header) return false
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()]
    }),
  )
  if (!parts.t || !parts.v1) return false
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false // 5-min tolerance
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parts.v1, 'hex'))
  } catch {
    return false
  }
}
