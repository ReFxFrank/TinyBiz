// Minimal PayPal client (Checkout Orders API v2) — raw REST, no SDK, mirrors
// stripe.js. Configure with environment variables (/etc/tinymagic.env):
//   PAYPAL_CLIENT_ID       from developer.paypal.com → My apps  (absent → off)
//   PAYPAL_CLIENT_SECRET   its secret
//   PAYPAL_ENV             "live" or "sandbox" (default sandbox)
//   PAYPAL_API_BASE        endpoint override — tests point it at a mock

import { getMeta } from './db.js'

const apiBase = () =>
  process.env.PAYPAL_API_BASE ||
  (process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

export function paypalEnabled() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

// Client-credentials tokens last ~9h — cache until shortly before expiry
let cached = null
async function accessToken() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(data?.error_description || `PayPal auth ${res.status}`), { status: 502, error: 'paypal' })
  }
  cached = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 300) * 1000 }
  return cached.token
}

async function ppRequest(method, path, body) {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = data?.details?.[0]?.issue || data?.message || `PayPal ${res.status}`
    throw Object.assign(new Error(detail), { status: 502, error: 'paypal', issue: data?.details?.[0]?.issue })
  }
  return data
}

const amt = (n) => Number(n).toFixed(2)

/** Create an order for a priced cart; returns { id, approveUrl } */
export async function createPayPalOrder({ priced, ref, origin }) {
  const settings = getMeta('settings')
  const currency = (settings?.currency || 'USD').toUpperCase()
  const t = priced.totals
  const order = await ppRequest('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: ref,
        custom_id: ref,
        amount: {
          currency_code: currency,
          value: amt(t.total),
          // PayPal validates: item_total + shipping + tax_total − discount = value
          breakdown: {
            item_total: { currency_code: currency, value: amt(t.discountedSubtotal) },
            shipping: { currency_code: currency, value: amt(t.shipping) },
            tax_total: { currency_code: currency, value: amt(t.tax) },
            ...(t.fixedOff > 0 ? { discount: { currency_code: currency, value: amt(t.fixedOff) } } : {}),
          },
        },
        items: t.lines.map((l) => ({
          name: String(l.name).slice(0, 127),
          quantity: String(l.qty),
          unit_amount: { currency_code: currency, value: amt(l.discountedUnitPrice) },
        })),
      },
    ],
    application_context: {
      brand_name: String(settings?.businessName || 'Shop').slice(0, 127),
      shipping_preference: 'NO_SHIPPING', // we collected the address ourselves
      user_action: 'PAY_NOW',
      return_url: `${origin}/confirmation/paypal?ref=${encodeURIComponent(ref)}`,
      cancel_url: `${origin}/checkout?canceled=1`,
    },
  })
  const approveUrl = (order.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href
  if (!approveUrl) throw Object.assign(new Error('PayPal returned no approval link'), { status: 502, error: 'paypal' })
  return { id: order.id, approveUrl }
}

/**
 * Capture after the shopper approves. Returns { completed, captureId } and
 * treats "already captured" as success — the return-URL poll and a repeat
 * visit must both land on the same order, never a double charge.
 */
export async function capturePayPalOrder(orderId) {
  try {
    const cap = await ppRequest('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {})
    const capture = cap?.purchase_units?.[0]?.payments?.captures?.[0]
    return { completed: cap?.status === 'COMPLETED', captureId: capture?.id }
  } catch (err) {
    if (err.issue === 'ORDER_ALREADY_CAPTURED') {
      const order = await ppRequest('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`)
      const capture = order?.purchase_units?.[0]?.payments?.captures?.[0]
      return { completed: order?.status === 'COMPLETED', captureId: capture?.id }
    }
    if (err.issue === 'ORDER_NOT_APPROVED') return { completed: false }
    throw err
  }
}
