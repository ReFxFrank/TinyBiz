// Authenticated state sync. The client hydrates with GET /state, then streams
// item-level ops (upsert/delete per collection, plus settings blobs) as the
// user works. `rev` lets the client poll cheaply for server-side changes.
//
// Staff accounts see a FILTERED world: /state only returns the collections
// their section permissions cover, and /ops silently skips writes outside
// their writable set (the client's sync engine drops those first anyway).

import { Router } from 'express'
import { COLLECTIONS, db, getCollection, getItem, getMeta, currentRev, bumpRev, upsertItem, deleteItem, setMeta, importState, uid } from './db.js'
import { requireAuth, requireOwner } from './auth.js'
import { computeAccess } from './perms.js'
import { sendOrderShipped, sendOrderCancelled, sendReviewRequest } from './email.js'
import { processStockAlerts } from './stock-alerts.js'

export const stateRouter = Router()
stateRouter.use(requireAuth)

function visibleState(user) {
  const access = computeAccess(user)
  const state = {}
  for (const name of COLLECTIONS) {
    if (access.all || access.readable.has(name)) state[name] = getCollection(name)
  }
  state.settings = getMeta('settings') // business identity is needed everywhere
  if (access.all || access.readable.has('newsletters')) {
    state.newsletterSettings = getMeta('newsletterSettings')
  }
  return state
}

stateRouter.get('/state', (req, res) => {
  const since = Number(req.query.since)
  const rev = currentRev()
  if (Number.isFinite(since) && since === rev) return res.json({ rev, unchanged: true })
  res.json({ rev, state: visibleState(req.user) })
})

/**
 * Did this upsert put the order "in the mail"? Fires when it transitions to
 * Shipped, or when a tracking number lands on an already-shipped order (the
 * customer wants that link even if the status flip came first).
 */
function shippedTransition(oldOrder, newOrder) {
  if (newOrder.status !== 'Shipped') return false
  const becameShipped = oldOrder?.status !== 'Shipped'
  const hadTracking = Boolean(String(oldOrder?.trackingNumber || '').trim())
  const hasTracking = Boolean(String(newOrder.trackingNumber || '').trim())
  return becameShipped || (hasTracking && !hadTracking)
}

const isDeadStatus = (s) => s === 'Cancelled' || s === 'Returned'

/** Did this upsert cancel/return the order for the first time? */
function cancelTransition(oldOrder, newOrder) {
  return isDeadStatus(newOrder.status) && oldOrder && !isDeadStatus(oldOrder.status) && !oldOrder.restockedAt
}

/**
 * First arrival at Delivered → one "how did it go?" review nudge. Etsy buyers
 * are excluded (their relay addresses belong to Etsy's own review flow), and
 * the reviewRequestedAt stamp keeps status flip-flops from re-sending.
 */
function deliveredTransition(oldOrder, newOrder) {
  return (
    newOrder.status === 'Delivered' &&
    oldOrder?.status !== 'Delivered' &&
    !oldOrder?.reviewRequestedAt &&
    !newOrder.reviewRequestedAt &&
    newOrder.channel !== 'Etsy' &&
    Boolean(newOrder.email)
  )
}

/**
 * Hand-entered orders (market day, DMs, duplicates) sold real units too —
 * deduct their stock the moment they're created, with an adjustment trail.
 * Website orders deduct at checkout and Etsy imports deduct in the sync, so
 * this only fires for orders INSERTED through the admin's sync ops. Returns
 * the order stamped stockDeductedAt so the cancel path knows to restock.
 */
function deductOrderStock(order) {
  const now = new Date().toISOString()
  for (const it of order.items || []) {
    const product = getItem('products', it.productId)
    if (!product) continue // free-text or Etsy-placeholder line — nothing to move
    if (it.variantId) {
      upsertItem('products', {
        ...product,
        variants: (product.variants || []).map((v) =>
          v.id === it.variantId ? { ...v, stock: Math.max(0, (v.stock || 0) - it.quantity) } : v,
        ),
      })
    } else {
      const applied = Math.min(product.stock || 0, it.quantity)
      upsertItem('products', { ...product, stock: Math.max(0, (product.stock || 0) - it.quantity) })
      upsertItem('adjustments', {
        id: uid('adj'),
        date: now,
        itemType: 'product',
        itemId: product.id,
        itemName: it.name,
        delta: -applied,
        reason: 'Manual',
        notes: `Order ${order.number} — manual entry`,
      })
    }
  }
  return { ...order, stockDeductedAt: now }
}

/**
 * Put a cancelled/returned order's items back in stock — for any order whose
 * stock was actually deducted: website checkouts, and manual orders stamped
 * stockDeductedAt above. Returns the order stamped with restockedAt so a
 * later status flip-flop can't double-restock.
 */
function restockOrder(order) {
  const now = new Date().toISOString()
  if (order.channel !== 'Website' && !order.stockDeductedAt) return { ...order, restockedAt: now }
  for (const it of order.items || []) {
    const product = getItem('products', it.productId)
    if (!product) continue
    if (it.variantId) {
      upsertItem('products', {
        ...product,
        variants: (product.variants || []).map((v) =>
          v.id === it.variantId ? { ...v, stock: (v.stock || 0) + it.quantity } : v,
        ),
      })
    } else {
      upsertItem('products', { ...product, stock: (product.stock || 0) + it.quantity })
    }
    upsertItem('adjustments', {
      id: uid('adj'),
      date: now,
      itemType: 'product',
      itemId: product.id,
      itemName: it.name,
      delta: it.quantity,
      reason: 'Return',
      notes: `Order ${order.number} ${String(order.status).toLowerCase()} — restocked`,
    })
  }
  return { ...order, restockedAt: now }
}

const applyOps = db.transaction((ops, access) => {
  let skipped = 0
  const shipped = [] // orders that just shipped — emailed after the tx commits
  const cancelled = [] // orders that just cancelled/returned — ditto
  const delivered = [] // orders that just arrived — review nudge after commit
  const allowed = (collection, meta) => {
    if (access.all) return true
    if (meta === 'settings') return access.canWriteSettings
    if (meta === 'newsletterSettings') return access.canWriteNewsletterSettings
    return access.writable.has(collection)
  }
  for (const op of ops) {
    if (op.op === 'upsert' && COLLECTIONS.includes(op.collection) && op.item && op.item.id != null) {
      if (!allowed(op.collection)) { skipped++; continue }
      let item = op.item
      if (op.collection === 'orders') {
        const old = getItem('orders', op.item.id)
        // Brand-new order from the admin (manual entry / duplicate) — stock
        // follows the sale. Website + Etsy orders never arrive as ops inserts.
        if (!old && !item.stockDeductedAt && !isDeadStatus(item.status)) {
          item = deductOrderStock(item)
        }
        if (shippedTransition(old, op.item)) shipped.push(op.item)
        if (cancelTransition(old, item)) {
          item = restockOrder(item)
          cancelled.push(item)
        }
        if (deliveredTransition(old, item)) {
          item = { ...item, reviewRequestedAt: new Date().toISOString() }
          delivered.push(item)
        }
      }
      upsertItem(op.collection, item)
    } else if (op.op === 'delete' && COLLECTIONS.includes(op.collection) && op.id != null) {
      if (!allowed(op.collection)) { skipped++; continue }
      deleteItem(op.collection, op.id)
    } else if (op.op === 'settings' && op.data && typeof op.data === 'object') {
      if (!allowed(null, 'settings')) { skipped++; continue }
      setMeta('settings', op.data)
    } else if (op.op === 'newsletterSettings' && op.data && typeof op.data === 'object') {
      if (!allowed(null, 'newsletterSettings')) { skipped++; continue }
      setMeta('newsletterSettings', op.data)
    } else {
      throw Object.assign(new Error('bad op'), { status: 400, error: 'bad_op' })
    }
  }
  return { rev: bumpRev(), skipped, shipped, cancelled, delivered }
})

stateRouter.post('/ops', (req, res) => {
  const ops = req.body?.ops
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 2000) {
    return res.status(400).json({ error: 'bad_ops' })
  }
  const { rev, skipped, shipped, cancelled, delivered } = applyOps(ops, computeAccess(req.user))
  // Fire-and-forget after the tx commits — email must never block the sync
  for (const order of shipped) void sendOrderShipped(order)
  for (const order of cancelled) void sendOrderCancelled(order)
  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`
  for (const order of delivered) void sendReviewRequest({ order, origin })
  // Any of these ops (restocks, returns, adjustments) can bring a sold-out
  // product back — resolve waiting back-in-stock signups
  if (ops.some((op) => op.collection === 'products' || op.collection === 'orders')) processStockAlerts()
  res.json({ rev, ...(skipped ? { skipped } : {}) })
})

stateRouter.post('/import', requireOwner, (req, res) => {
  const state = req.body?.state
  if (!state || typeof state !== 'object') return res.status(400).json({ error: 'bad_state' })
  const rev = importState(state)
  res.json({ rev })
})
