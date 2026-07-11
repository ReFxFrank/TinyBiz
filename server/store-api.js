// Public storefront API — no auth. This is what makes the shop real: carts
// are priced, validated, and turned into orders ON THE SERVER, so a customer
// in any browser lands in the owner's Orders queue.

import { Router } from 'express'
import { db, uid, getCollection, getMeta, upsertItem, bumpRev } from './db.js'
import { buildLines, computeTotals, promoUsable, nextOrderNumber, shippingConfig, taxRateFor, CA_TAX } from './store-math.js'
import { currencyRates } from './rates.js'
import { stripeEnabled, createCheckoutSession, getCheckoutSession, verifyWebhookSignature } from './stripe.js'
import { paypalEnabled, createPayPalOrder, capturePayPalOrder } from './paypal.js'
import { sendOrderConfirmation, sendNewOrderAlert, sendWelcomeEmail } from './email.js'
import { addStockAlert, processStockAlerts } from './stock-alerts.js'

export const storeRouter = Router()

/** Express 4 doesn't forward async rejections — route through next() */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

function shopInfo() {
  const s = getMeta('settings') || {}
  return {
    businessName: s.businessName || 'The Tiny Magic Studio',
    tagline: s.tagline || '',
    logoEmoji: s.logoEmoji || '🛍️',
    email: s.email || '',
    ownerName: s.ownerName || '',
    city: s.address?.city || '',
    state: s.address?.state || '',
    currency: s.currency || 'USD',
    currencyRates: currencyRates(s.currency || 'USD'),
    /** Which real payment providers are configured (checkout adapts its UI) */
    payments: { stripe: stripeEnabled(), paypal: paypalEnabled() },
    taxRate: Number(s.taxRate) || 0,
    /** Province → combined GST/HST/PST — lets checkout estimate live; null for non-Canadian shops */
    caTaxTable: /canada/i.test(shippingConfig(s).country) ? CA_TAX : null,
    freeShippingOver: shippingConfig(s).freeOver,
    flatShipping: shippingConfig(s).flatRate,
    shippingCountry: shippingConfig(s).country,
    shippingRegion: shippingConfig(s).region,
    storefront: s.storefront && typeof s.storefront === 'object' ? s.storefront : {},
    makerPhoto: typeof s.makerPhotoUrl === 'string' && s.makerPhotoUrl ? s.makerPhotoUrl : null,
    policies: s.policies && typeof s.policies === 'object' ? s.policies : {},
    social: s.social && typeof s.social === 'object' ? s.social : {},
    promoBanner: s.promoBanner && typeof s.promoBanner === 'object' ? s.promoBanner : null,
  }
}

/** Public product shape — unit costs, margins, and supply-chain fields stay private */
function publicProduct(p) {
  const { cost, reorderPoint, recipeId, ...pub } = p
  return { ...pub, variants: (p.variants || []).map(({ cost: _c, ...v }) => v) }
}

storeRouter.get('/catalog', (_req, res) => {
  const products = getCollection('products').filter((p) => p.active).map(publicProduct)
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
  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`
  const existing = getCollection('subscribers').find((s) => s.email.toLowerCase() === email.toLowerCase())
  if (existing) {
    if (existing.status === 'subscribed') return res.json({ ok: true, already: true })
    upsertItem('subscribers', { ...existing, status: 'subscribed' })
    bumpRev()
    void sendWelcomeEmail({ to: existing.email, origin }) // welcome back
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
  void sendWelcomeEmail({ to: email, origin })
  res.json({ ok: true })
})

/** "Notify me when it's back" — sold-out products collect emails to ping once
 *  restocked. Idempotent per email, rate-limited in index.js. */
storeRouter.post('/notify-stock', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const productId = String(req.body?.productId || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'bad_email', message: 'That doesn’t look like an email address.' })
  }
  const product = getCollection('products').find((p) => p.id === productId && p.active)
  if (!product) return res.status(404).json({ error: 'not_found' })
  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`
  const result = addStockAlert({ productId, email, origin })
  // Race guard: if it restocked between page load and signup, resolve right away
  processStockAlerts()
  res.json(result)
})

// ── Checkout ─────────────────────────────────────────────────────────────────

function validateContact(body, country) {
  const name = String(body?.contact?.name || '').trim()
  const email = String(body?.contact?.email || '').trim()
  const a = body?.address || {}
  const address = {
    line1: String(a.line1 || '').trim(),
    city: String(a.city || '').trim(),
    state: String(a.state || '').trim(),
    zip: String(a.zip || '').trim(),
    country,
  }
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address.line1 || !address.city || !address.state || !address.zip) {
    throw { status: 400, error: 'bad_form', message: 'Please fill in your contact and shipping details.' }
  }
  return { name, email, address, notes: String(body?.notes || '').trim().slice(0, 2000) }
}

/** Price + validate a checkout request against live data. Throws on problems. */
function priceCheckout(body) {
  const settings = getMeta('settings')
  const ship = shippingConfig(settings)
  const contact = validateContact(body, ship.country)
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

  // Destination-based for Canadian shops (GST/HST/PST by province)
  const taxRate = taxRateFor(settings, contact.address)
  const totals = computeTotals(lines, promo?.discountPct, taxRate, ship)
  return { contact, promo, totals }
}

/**
 * Write the real records: customer, order, stock, promo uses, notification.
 * Runs post-validation (mock mode) or post-payment (Stripe), in one tx.
 * `payment` records how money was collected so the admin can tell paid
 * orders from preview ones and trace refunds back to the Stripe charge.
 */
export const finalizeOrder = db.transaction(({ contact, promo, totals, payment }) => {
  const now = new Date().toISOString()

  // A Stripe session can sit open for a while — someone else may have bought
  // the last unit in the meantime. The payment already happened, so the order
  // still lands, but flag the shortfall loudly for the owner.
  const shortfalls = []
  for (const l of totals.lines) {
    const product = getCollection('products').find((p) => p.id === l.product.id)
    const available = l.variant
      ? (product?.variants || []).find((v) => v.id === l.variant.id)?.stock ?? 0
      : product?.stock ?? 0
    if (l.qty > available) shortfalls.push(`${l.name}: ${l.qty} paid, ${available} in stock`)
  }

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
  const shortNote = shortfalls.length ? `⚠ Oversold — ${shortfalls.join('; ')}` : ''
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
      ...(l.variant ? { variantId: l.variant.id } : {}),
      name: l.name,
      quantity: l.qty,
      unitPrice: l.discountedUnitPrice,
      unitCost: l.unitCost,
    })),
    shippingCost: 0,
    shippingCharged: totals.shipping,
    taxCollected: totals.tax,
    shippingAddress: contact.address,
    notes: [shortNote, promoNote, contact.notes].filter(Boolean).join(' — ') || undefined,
    placedAt: now,
    shipBy: new Date(Date.now() + 4 * 86_400_000).toISOString(),
    payment: payment || { provider: 'none' },
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
  if (shortfalls.length) {
    upsertItem('notifications', {
      id: uid('ntf'),
      type: 'low-stock',
      title: `Order ${number} was paid but stock ran short`,
      body: shortfalls.join('; '),
      createdAt: now,
      read: false,
      link: '/admin/orders',
    })
  }

  // Storefront sales can cross a reorder point without the admin open —
  // leave the low-stock heads-up the client-side path would have created
  for (const l of totals.lines) {
    const product = getCollection('products').find((p) => p.id === l.product.id)
    if (!product || !(product.reorderPoint > 0)) continue
    const sellable = (product.stock || 0) + (product.variants || []).reduce((a, v) => a + (v.stock || 0), 0)
    if (sellable <= product.reorderPoint) {
      upsertItem('notifications', {
        id: uid('ntf'),
        type: 'low-stock',
        title: `Low stock: ${product.name}`,
        body: `${sellable} left after order ${number} (reorder at ${product.reorderPoint}).`,
        createdAt: now,
        read: false,
        link: '/admin/inventory',
      })
    }
  }

  bumpRev()
  return order
})

storeRouter.post('/checkout', wrap(async (req, res) => {
  const priced = priceCheckout(req.body)

  // Which real provider handles this checkout: the shopper's pick when both
  // are configured, whichever exists otherwise, mock when neither does.
  const wants = String(req.body?.payWith || '')
  const provider =
    wants === 'paypal' && paypalEnabled() ? 'paypal'
    : wants === 'stripe' && stripeEnabled() ? 'stripe'
    : stripeEnabled() ? 'stripe'
    : paypalEnabled() ? 'paypal'
    : 'mock'

  if (provider === 'mock') {
    // Preview mode: no payment collected, order lands immediately
    const order = finalizeOrder({ ...priced, payment: { provider: 'none' } })
    void sendOrderConfirmation(order)
    void sendNewOrderAlert(order)
    return res.json({ mode: 'mock', orderId: order.id, number: order.number })
  }

  // Real payment: park the priced cart, send the shopper off to approve.
  // Abandoned rows are pruned after 30 days (finished ones keep the order id).
  db.prepare("DELETE FROM pending_checkouts WHERE order_id IS NULL AND created_at < ?").run(
    new Date(Date.now() - 30 * 86_400_000).toISOString(),
  )
  const ref = uid('pnd')
  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`
  // origin rides along so the abandoned-cart reminder can link back to checkout
  db.prepare('INSERT INTO pending_checkouts (id, payload, created_at, origin) VALUES (?, ?, ?, ?)').run(
    ref,
    JSON.stringify(priced),
    new Date().toISOString(),
    origin,
  )

  if (provider === 'paypal') {
    const order = await createPayPalOrder({ priced, ref, origin })
    db.prepare('UPDATE pending_checkouts SET session_id = ? WHERE id = ?').run(order.id, ref)
    return res.json({ mode: 'paypal', checkoutUrl: order.approveUrl })
  }

  const session = await createCheckoutSession({ priced, ref, origin })
  db.prepare('UPDATE pending_checkouts SET session_id = ? WHERE id = ?').run(session.id, ref)
  res.json({ mode: 'stripe', checkoutUrl: session.url })
}))

/** Sanitized order for the confirmation page (ids are unguessable) */
export function publicOrder(o) {
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

/** Finalize a paid pending checkout exactly once; returns the order id.
 *  `payment` records the provider trail (Stripe session / PayPal capture). */
function finalizePaid(pendingId, payment) {
  const row = db.prepare('SELECT * FROM pending_checkouts WHERE id = ?').get(pendingId)
  if (!row) return null
  if (row.order_id) return row.order_id
  const order = finalizeOrder({ ...JSON.parse(row.payload), payment })
  db.prepare('UPDATE pending_checkouts SET order_id = ? WHERE id = ?').run(order.id, pendingId)
  void sendOrderConfirmation(order)
  void sendNewOrderAlert(order)
  return order.id
}

/** Stripe flavor — `session` (when the caller has it) fills the trail */
function finalizePending(pendingId, session) {
  const row = db.prepare('SELECT session_id FROM pending_checkouts WHERE id = ?').get(pendingId)
  return finalizePaid(pendingId, {
    provider: 'stripe',
    sessionId: session?.id || row?.session_id || undefined,
    paymentIntent: typeof session?.payment_intent === 'string' ? session.payment_intent : session?.payment_intent?.id,
    paidAt: new Date().toISOString(),
  })
}

// The Stripe success page lands here. Webhooks are optional: if the webhook
// hasn't fired (or isn't configured), we ask Stripe for the session status
// directly and finalize on the spot.
storeRouter.get('/order/by-session/:sid', wrap(async (req, res) => {
  const row = db.prepare('SELECT * FROM pending_checkouts WHERE session_id = ?').get(req.params.sid)
  if (!row) return res.status(404).json({ error: 'not_found' })
  if (!row.order_id && stripeEnabled()) {
    const session = await getCheckoutSession(req.params.sid)
    if (session.payment_status === 'paid') finalizePending(row.id, session)
    else return res.json({ pending: true })
  }
  const fresh = db.prepare('SELECT order_id FROM pending_checkouts WHERE id = ?').get(row.id)
  if (!fresh?.order_id) return res.json({ pending: true })
  const order = getCollection('orders').find((o) => o.id === fresh.order_id)
  res.json({ order: publicOrder(order) })
}))

// PayPal's return URL lands here. No webhook needed: we capture the approved
// order on the spot (idempotent — repeat visits find the finished order).
storeRouter.get('/order/by-paypal/:ref', wrap(async (req, res) => {
  const row = db.prepare('SELECT * FROM pending_checkouts WHERE id = ?').get(req.params.ref)
  if (!row || !row.session_id) return res.status(404).json({ error: 'not_found' })
  if (!row.order_id && paypalEnabled()) {
    const result = await capturePayPalOrder(row.session_id)
    if (result.completed) {
      finalizePaid(row.id, {
        provider: 'paypal',
        orderId: row.session_id,
        captureId: result.captureId,
        paidAt: new Date().toISOString(),
      })
    } else {
      return res.json({ pending: true })
    }
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
    const session = event.data?.object
    const ref = session?.metadata?.ref
    if (ref) finalizePending(ref, session)
  }
  res.json({ received: true })
})
