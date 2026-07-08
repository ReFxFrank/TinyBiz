// Public storefront API — no auth. This is what makes the shop real: carts
// are priced, validated, and turned into orders ON THE SERVER, so a customer
// in any browser lands in the owner's Orders queue.

import { Router } from 'express'
import { db, uid, getCollection, getMeta, upsertItem, bumpRev } from './db.js'
import { buildLines, computeTotals, promoUsable, nextOrderNumber, FREE_SHIPPING_OVER, FLAT_SHIPPING } from './store-math.js'
import { stripeEnabled, createCheckoutSession, getCheckoutSession, verifyWebhookSignature } from './stripe.js'
import { sendOrderConfirmation } from './email.js'

export const storeRouter = Router()

/** Express 4 doesn't forward async rejections — route through next() */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

function shopInfo() {
  const s = getMeta('settings') || {}
  return {
    businessName: s.businessName || 'TinyBiz Shop',
    tagline: s.tagline || '',
    logoEmoji: s.logoEmoji || '🛍️',
    email: s.email || '',
    ownerName: s.ownerName || '',
    city: s.address?.city || '',
    state: s.address?.state || '',
    currency: s.currency || 'USD',
    taxRate: Number(s.taxRate) || 0,
    freeShippingOver: FREE_SHIPPING_OVER,
    flatShipping: FLAT_SHIPPING,
  }
}

storeRouter.get('/catalog', (_req, res) => {
  const products = getCollection('products').filter((p) => p.active)
  // Best sellers: units per product over revenue orders (mirrors lib/metrics)
  const units = new Map()
  for (const o of getCollection('orders')) {
    if (o.status === 'Cancelled' || o.status === 'Returned') continue
    for (const item of o.items || []) units.set(item.productId, (units.get(item.productId) || 0) + item.quantity)
  }
  const bestSellerIds = [...units.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .filter((id) => products.some((p) => p.id === id))
    .slice(0, 8)
  res.json({ products, shop: shopInfo(), bestSellerIds })
})

storeRouter.post('/promo', (req, res) => {
  const code = String(req.body?.code || '').trim()
  if (!code) return res.status(400).json({ valid: false })
  const promo = getCollection('promoCodes').find((p) => p.code.toLowerCase() === code.toLowerCase())
  if (!promoUsable(promo)) return res.json({ valid: false })
  res.json({ valid: true, code: promo.code, discountPct: promo.discountPct })
})

storeRouter.post('/subscribe', (req, res) => {
  const email = String(req.body?.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'bad_email' })
  const existing = getCollection('subscribers').find((s) => s.email.toLowerCase() === email.toLowerCase())
  if (existing) {
    if (existing.status === 'subscribed') return res.json({ ok: true, already: true })
    upsertItem('subscribers', { ...existing, status: 'subscribed' })
    bumpRev()
    return res.json({ ok: true, resubscribed: true })
  }
  upsertItem('subscribers', {
    id: uid('sub'),
    email,
    name: '',
    status: 'subscribed',
    tags: ['storefront'],
    source: 'Signup form',
    createdAt: new Date().toISOString(),
  })
  bumpRev()
  res.json({ ok: true })
})

// ── Checkout ─────────────────────────────────────────────────────────────────

function validateContact(body) {
  const name = String(body?.contact?.name || '').trim()
  const email = String(body?.contact?.email || '').trim()
  const a = body?.address || {}
  const address = {
    line1: String(a.line1 || '').trim(),
    city: String(a.city || '').trim(),
    state: String(a.state || '').trim(),
    zip: String(a.zip || '').trim(),
    country: 'United States',
  }
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address.line1 || !address.city || !address.state || !address.zip) {
    throw { status: 400, error: 'bad_form', message: 'Please fill in your contact and shipping details.' }
  }
  return { name, email, address, notes: String(body?.notes || '').trim().slice(0, 2000) }
}

/** Price + validate a checkout request against live data. Throws on problems. */
function priceCheckout(body) {
  const contact = validateContact(body)
  const products = getCollection('products')
  const lines = buildLines(body?.items, products)

  let promo = null
  if (body?.promoCode) {
    const found = getCollection('promoCodes').find(
      (p) => p.code.toLowerCase() === String(body.promoCode).trim().toLowerCase(),
    )
    if (!promoUsable(found)) {
      throw { status: 409, error: 'promo', message: 'That promo code is no longer valid.' }
    }
    promo = { id: found.id, code: found.code, discountPct: found.discountPct }
  }

  const taxRate = Number(getMeta('settings')?.taxRate) || 0
  const totals = computeTotals(lines, promo?.discountPct, taxRate)
  return { contact, promo, totals }
}

/**
 * Write the real records: customer, order, stock, promo uses, notification.
 * Runs post-validation (mock mode) or post-payment (Stripe), in one tx.
 */
export const finalizeOrder = db.transaction(({ contact, promo, totals }) => {
  const now = new Date().toISOString()

  const customers = getCollection('customers')
  let customer = customers.find((c) => c.email.trim().toLowerCase() === contact.email.toLowerCase())
  if (!customer) {
    customer = {
      id: uid('cus'),
      name: contact.name,
      email: contact.email,
      address: contact.address,
      tags: ['storefront'],
      createdAt: now,
    }
    upsertItem('customers', customer)
  }

  const number = nextOrderNumber(getCollection('orders'))
  const promoNote = promo ? `Promo ${promo.code} (−${promo.discountPct}%)` : ''
  const order = {
    id: uid('ord'),
    number,
    customerId: customer.id,
    customerName: contact.name,
    email: contact.email,
    status: 'New',
    channel: 'Website',
    items: totals.lines.map((l) => ({
      productId: l.product.id,
      name: l.name,
      quantity: l.qty,
      unitPrice: l.discountedUnitPrice,
      unitCost: l.unitCost,
    })),
    shippingCost: 0,
    shippingCharged: totals.shipping,
    taxCollected: totals.tax,
    shippingAddress: contact.address,
    notes: [promoNote, contact.notes].filter(Boolean).join(' — ') || undefined,
    placedAt: now,
    shipBy: new Date(Date.now() + 4 * 86_400_000).toISOString(),
  }
  upsertItem('orders', order)

  // Stock: base products get a logged adjustment; variant stock lives inside
  // the product document. Re-read per line so multi-line orders stack.
  for (const l of totals.lines) {
    const product = getCollection('products').find((p) => p.id === l.product.id)
    if (!product) continue
    if (l.variant) {
      upsertItem('products', {
        ...product,
        variants: (product.variants || []).map((v) =>
          v.id === l.variant.id ? { ...v, stock: Math.max(0, v.stock - l.qty) } : v,
        ),
      })
    } else {
      const applied = Math.max(-product.stock, -l.qty)
      upsertItem('products', { ...product, stock: Math.max(0, product.stock - l.qty) })
      upsertItem('adjustments', {
        id: uid('adj'),
        date: now,
        itemType: 'product',
        itemId: product.id,
        itemName: product.name,
        delta: applied,
        reason: 'Manual',
        notes: `Storefront order ${number}`,
      })
    }
  }

  if (promo) {
    const fresh = getCollection('promoCodes').find((p) => p.id === promo.id)
    if (fresh) upsertItem('promoCodes', { ...fresh, uses: (fresh.uses || 0) + 1 })
  }

  upsertItem('notifications', {
    id: uid('ntf'),
    type: 'order',
    title: `New website order ${number}`,
    body: `${contact.name} — $${totals.total.toFixed(2)}`,
    createdAt: now,
    read: false,
    link: '/admin/orders',
  })

  bumpRev()
  return order
})

storeRouter.post('/checkout', wrap(async (req, res) => {
  const priced = priceCheckout(req.body)

  if (!stripeEnabled()) {
    // Preview mode: no payment collected, order lands immediately
    const order = finalizeOrder(priced)
    void sendOrderConfirmation(order)
    return res.json({ mode: 'mock', orderId: order.id, number: order.number })
  }

  // Stripe mode: park the priced cart, send the shopper to Stripe Checkout.
  const ref = uid('pnd')
  db.prepare('INSERT INTO pending_checkouts (id, payload, created_at) VALUES (?, ?, ?)').run(
    ref,
    JSON.stringify(priced),
    new Date().toISOString(),
  )
  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`
  const session = await createCheckoutSession({ priced, ref, origin })
  db.prepare('UPDATE pending_checkouts SET session_id = ? WHERE id = ?').run(session.id, ref)
  res.json({ mode: 'stripe', checkoutUrl: session.url })
}))

/** Sanitized order for the confirmation page (ids are unguessable) */
function publicOrder(o) {
  return {
    id: o.id,
    number: o.number,
    customerName: o.customerName,
    email: o.email,
    status: o.status,
    items: o.items,
    shippingCharged: o.shippingCharged,
    taxCollected: o.taxCollected,
    shippingAddress: o.shippingAddress,
    notes: o.notes,
    placedAt: o.placedAt,
    shipBy: o.shipBy,
    trackingNumber: o.trackingNumber,
    carrier: o.carrier,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
  }
}

storeRouter.post('/track', (req, res) => {
  const rawNumber = String(req.body?.number || '').trim().toUpperCase()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const digits = rawNumber.replace(/\D/g, '')
  if (!rawNumber || !email) return res.status(400).json({ error: 'bad_request' })
  const order = getCollection('orders').find((o) => {
    if (o.email.trim().toLowerCase() !== email) return false
    const num = String(o.number || '').toUpperCase()
    return num === rawNumber || (digits.length > 0 && num.replace(/\D/g, '') === digits)
  })
  if (!order) {
    return res.status(404).json({ error: 'not_found', message: 'No order matches that number and email.' })
  }
  res.json({ order: publicOrder(order) })
})

storeRouter.get('/order/:id', (req, res) => {
  const order = getCollection('orders').find((o) => o.id === req.params.id)
  if (!order) return res.status(404).json({ error: 'not_found' })
  res.json({ order: publicOrder(order) })
})

/** Finalize a paid pending checkout exactly once; returns the order id */
function finalizePending(pendingId) {
  const row = db.prepare('SELECT * FROM pending_checkouts WHERE id = ?').get(pendingId)
  if (!row) return null
  if (row.order_id) return row.order_id
  const order = finalizeOrder(JSON.parse(row.payload))
  db.prepare('UPDATE pending_checkouts SET order_id = ? WHERE id = ?').run(order.id, pendingId)
  void sendOrderConfirmation(order)
  return order.id
}

// The Stripe success page lands here. Webhooks are optional: if the webhook
// hasn't fired (or isn't configured), we ask Stripe for the session status
// directly and finalize on the spot.
storeRouter.get('/order/by-session/:sid', wrap(async (req, res) => {
  const row = db.prepare('SELECT * FROM pending_checkouts WHERE session_id = ?').get(req.params.sid)
  if (!row) return res.status(404).json({ error: 'not_found' })
  if (!row.order_id && stripeEnabled()) {
    const session = await getCheckoutSession(req.params.sid)
    if (session.payment_status === 'paid') finalizePending(row.id)
    else return res.json({ pending: true })
  }
  const fresh = db.prepare('SELECT order_id FROM pending_checkouts WHERE id = ?').get(row.id)
  if (!fresh?.order_id) return res.json({ pending: true })
  const order = getCollection('orders').find((o) => o.id === fresh.order_id)
  res.json({ order: publicOrder(order) })
}))

// ── Stripe webhook (mounted with a raw body parser in index.js) ──────────────

export const webhookRouter = Router()
webhookRouter.post('/', (req, res) => {
  if (!verifyWebhookSignature(req.body, req.headers['stripe-signature'])) {
    return res.status(400).json({ error: 'bad_signature' })
  }
  const event = JSON.parse(req.body.toString('utf8'))
  if (event.type === 'checkout.session.completed') {
    const ref = event.data?.object?.metadata?.ref
    if (ref) finalizePending(ref)
  }
  res.json({ received: true })
})
