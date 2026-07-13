// Etsy shop sync (Open API v3). The owner pastes their app keystring from
// etsy.com/developers, clicks Connect (OAuth2 + PKCE — Etsy's required flow),
// and from then on new Etsy receipts land in the Orders queue automatically:
// channel "Etsy", SKU-matched stock decremented, bell notification per order.
// Tokens live in the meta table; ETSY_API_BASE lets tests point at a mock.

import { Router } from 'express'
import crypto from 'node:crypto'
import { db, uid, getCollection, getItem, getMeta, setMeta, upsertItem, bumpRev } from './db.js'
import { requireAuth, requireOwner } from './auth.js'
import { siteOrigin } from './origin.js'

const API = () => process.env.ETSY_API_BASE || 'https://api.etsy.com'
const CONNECT_PAGE = 'https://www.etsy.com/oauth/connect'
const SCOPES = 'transactions_r listings_r'
// First connect pulls this far back — enough to reconcile, not years of history
const FIRST_SYNC_DAYS = 60

const cfg = () => getMeta('etsy', {}) || {}
const save = (patch) => setMeta('etsy', { ...cfg(), ...patch })

export const etsyConnected = () => Boolean(cfg().refreshToken && cfg().shopId)

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const money = (m) => (m && m.divisor ? Number(m.amount) / Number(m.divisor) : Number(m?.amount) || 0)

/** Valid access token, refreshing when needed. Throws when not connected. */
async function accessToken() {
  const c = cfg()
  if (!c.refreshToken) throw Object.assign(new Error('Etsy is not connected'), { status: 409, error: 'etsy_disconnected' })
  if (c.accessToken && c.expiresAt > Date.now() + 60_000) return c.accessToken
  const res = await fetch(`${API()}/v3/public/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', client_id: c.keystring, refresh_token: c.refreshToken }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(data?.error_description || `Etsy token refresh ${res.status}`), { status: 502, error: 'etsy' })
  }
  save({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || c.refreshToken,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  })
  return data.access_token
}

async function etsyRequest(path) {
  const res = await fetch(`${API()}${path}`, {
    headers: { 'x-api-key': cfg().keystring, Authorization: `Bearer ${await accessToken()}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `Etsy ${res.status}`), { status: 502, error: 'etsy' })
  }
  return data
}

// ── Receipt → order import ───────────────────────────────────────────────────

/** Find the shop product/variant this Etsy line refers to, by SKU */
function matchBySku(products, sku) {
  const clean = String(sku || '').trim().toLowerCase()
  if (!clean) return {}
  for (const p of products) {
    if (String(p.sku || '').trim().toLowerCase() === clean) return { product: p }
    const variant = (p.variants || []).find((v) => String(v.sku || '').trim().toLowerCase() === clean)
    if (variant) return { product: p, variant }
  }
  return {}
}

const importReceipts = db.transaction((receipts) => {
  const orders = getCollection('orders')
  const known = new Set(orders.map((o) => String(o.etsyReceiptId || '')))
  let imported = 0
  let latestTs = 0

  for (const r of receipts) {
    const rid = String(r.receipt_id)
    latestTs = Math.max(latestTs, Number(r.created_timestamp) || 0)
    if (known.has(rid)) continue

    const now = new Date().toISOString()
    const placedAt = r.created_timestamp ? new Date(Number(r.created_timestamp) * 1000).toISOString() : now
    const email = String(r.buyer_email || '').trim()

    // Same customer record their website orders would use
    const customers = getCollection('customers')
    let customer = email
      ? customers.find((c) => String(c.email || '').trim().toLowerCase() === email.toLowerCase())
      : undefined
    if (!customer) {
      customer = {
        id: uid('cus'),
        name: String(r.name || 'Etsy buyer'),
        email,
        tags: ['etsy'],
        createdAt: now,
      }
      upsertItem('customers', customer)
    }

    const products = getCollection('products')
    const items = (r.transactions || []).map((t) => {
      const { product, variant } = matchBySku(products, t.sku)
      return {
        productId: product?.id ?? `etsy:${t.listing_id ?? 'unknown'}`,
        ...(variant ? { variantId: variant.id } : {}),
        name: String(t.title || 'Etsy item').slice(0, 140),
        quantity: Number(t.quantity) || 1,
        unitPrice: money(t.price),
        unitCost: variant?.cost ?? product?.cost ?? 0,
      }
    })

    const number = `ETSY-${rid}`
    const order = {
      id: uid('ord'),
      number,
      etsyReceiptId: rid,
      customerId: customer.id,
      customerName: String(r.name || 'Etsy buyer'),
      email,
      status: r.is_shipped ? 'Shipped' : 'New',
      channel: 'Etsy',
      items,
      shippingCost: 0,
      shippingCharged: money(r.total_shipping_cost),
      taxCollected: money(r.total_tax_cost),
      shippingAddress: {
        line1: String(r.first_line || ''),
        city: String(r.city || ''),
        state: String(r.state || ''),
        zip: String(r.zip || ''),
      },
      notes: 'Imported from Etsy',
      placedAt,
      shipBy: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      payment: { provider: 'etsy', paidAt: placedAt },
      ...(r.is_shipped ? { shippedAt: now } : {}),
    }
    upsertItem('orders', order)
    known.add(rid)
    imported++

    // Stock follows the sale for SKU-matched lines (Etsy sold real units)
    for (const it of items) {
      const product = getItem('products', it.productId)
      if (!product) continue
      if (it.variantId) {
        upsertItem('products', {
          ...product,
          variants: (product.variants || []).map((v) =>
            v.id === it.variantId ? { ...v, stock: Math.max(0, (v.stock || 0) - it.quantity) } : v,
          ),
        })
      } else {
        upsertItem('products', { ...product, stock: Math.max(0, (product.stock || 0) - it.quantity) })
        upsertItem('adjustments', {
          id: uid('adj'),
          date: now,
          itemType: 'product',
          itemId: product.id,
          itemName: product.name,
          delta: -Math.min(product.stock || 0, it.quantity),
          reason: 'Manual',
          notes: `Etsy order ${number}`,
        })
      }
    }

    upsertItem('notifications', {
      id: uid('ntf'),
      type: 'order',
      title: `New Etsy order ${number}`,
      body: `${order.customerName} — $${(items.reduce((a, i) => a + i.unitPrice * i.quantity, 0) + order.shippingCharged + order.taxCollected).toFixed(2)}`,
      createdAt: now,
      read: false,
      link: '/admin/orders',
    })
  }

  if (imported > 0) bumpRev()
  return { imported, latestTs }
})

/** Pull new receipts since the last sync. Returns how many orders landed. */
export async function syncEtsyOrders() {
  const c = cfg()
  if (!etsyConnected()) return { imported: 0 }
  const minCreated = Number(c.lastCreatedTs) || Math.floor(Date.now() / 1000) - FIRST_SYNC_DAYS * 86_400
  const data = await etsyRequest(
    `/v3/application/shops/${encodeURIComponent(c.shopId)}/receipts?min_created=${minCreated + 1}&limit=100&sort_on=created&sort_order=asc`,
  )
  const receipts = Array.isArray(data.results) ? data.results : []
  const { imported, latestTs } = importReceipts(receipts)
  save({ lastSyncAt: new Date().toISOString(), ...(latestTs ? { lastCreatedTs: latestTs } : {}) })
  return { imported }
}

/** Background loop — quiet unless connected; failures warn, never crash */
export function startEtsySync() {
  const every = Number(process.env.ETSY_SYNC_MS) || 10 * 60_000
  const tick = () => {
    if (!etsyConnected()) return
    syncEtsyOrders().catch((err) => console.warn(`[tinymagic-api] etsy sync failed: ${err.message}`))
  }
  setTimeout(tick, 15_000) // shortly after boot, then steady
  setInterval(tick, every).unref()
}

// ── Owner-facing endpoints ────────────────────────────────────────────────────

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const etsyRouter = Router()

etsyRouter.get('/status', requireAuth, (_req, res) => {
  const c = cfg()
  res.json({
    configured: Boolean(c.keystring),
    connected: etsyConnected(),
    shopName: c.shopName || null,
    lastSyncAt: c.lastSyncAt || null,
  })
})

etsyRouter.post('/keystring', requireOwner, (req, res) => {
  const keystring = String(req.body?.keystring || '').trim()
  if (!keystring) return res.status(400).json({ error: 'bad_keystring', message: 'Paste the keystring from your Etsy app.' })
  // New key invalidates any previous connection
  setMeta('etsy', { keystring })
  res.json({ ok: true })
})

/** Kick off OAuth: redirect the owner's browser to Etsy's consent page */
etsyRouter.get('/connect', requireOwner, (req, res) => {
  const c = cfg()
  if (!c.keystring) return res.status(400).json({ error: 'no_keystring', message: 'Save your Etsy keystring first.' })
  const origin = siteOrigin(req)
  const verifier = b64url(crypto.randomBytes(32))
  const state = b64url(crypto.randomBytes(16))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  save({ pendingAuth: { verifier, state, origin, at: Date.now() } })
  const url =
    `${CONNECT_PAGE}?response_type=code` +
    `&client_id=${encodeURIComponent(c.keystring)}` +
    `&redirect_uri=${encodeURIComponent(`${origin}/api/etsy/callback`)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`
  res.redirect(url)
})

/** Etsy sends the owner back here with a one-time code */
etsyRouter.get('/callback', requireOwner, wrap(async (req, res) => {
  const c = cfg()
  const pending = c.pendingAuth
  const { code, state } = req.query
  if (!pending || !code || state !== pending.state || Date.now() - pending.at > 15 * 60_000) {
    return res.redirect('/admin/settings?etsy=failed')
  }
  const tokenRes = await fetch(`${API()}/v3/public/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: c.keystring,
      redirect_uri: `${pending.origin}/api/etsy/callback`,
      code: String(code),
      code_verifier: pending.verifier,
    }),
  })
  const tokens = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) return res.redirect('/admin/settings?etsy=failed')

  // Access tokens are "<user_id>.<secret>" — the prefix IS the user id
  const userId = String(tokens.access_token || '').split('.')[0]
  save({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
    userId,
    pendingAuth: undefined,
    connectedAt: new Date().toISOString(),
  })
  const shops = await etsyRequest(`/v3/application/users/${encodeURIComponent(userId)}/shops`)
  const shop = Array.isArray(shops.results) ? shops.results[0] : shops
  if (!shop?.shop_id) return res.redirect('/admin/settings?etsy=failed')
  save({ shopId: String(shop.shop_id), shopName: shop.shop_name || '' })
  res.redirect('/admin/settings?etsy=connected')
}))

etsyRouter.post('/sync', requireOwner, wrap(async (_req, res) => {
  res.json(await syncEtsyOrders())
}))

etsyRouter.post('/disconnect', requireOwner, (_req, res) => {
  const c = cfg()
  setMeta('etsy', { keystring: c.keystring }) // keep the key, drop the tokens
  res.json({ ok: true })
})
