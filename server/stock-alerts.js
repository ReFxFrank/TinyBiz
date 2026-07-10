// "Notify me when it's back" — shoppers leave an email on a sold-out product,
// and the first time anything makes it sellable again (an admin restock, a
// cancelled order's return, an inventory adjustment) they get one email.
// processStockAlerts runs after every write path that can raise stock.

import { db, uid, getItem } from './db.js'
import { sendBackInStock } from './email.js'

const stmtOpen = db.prepare('SELECT * FROM stock_alerts WHERE notified_at IS NULL')
const stmtFind = db.prepare('SELECT id FROM stock_alerts WHERE product_id = ? AND email = ? AND notified_at IS NULL')
const stmtInsert = db.prepare(
  'INSERT INTO stock_alerts (id, product_id, email, origin, created_at) VALUES (?, ?, ?, ?, ?)',
)
const stmtNotify = db.prepare('UPDATE stock_alerts SET notified_at = ? WHERE id = ?')
const stmtPrune = db.prepare('DELETE FROM stock_alerts WHERE created_at < ? AND notified_at IS NULL')

/** Register interest. Idempotent per (product, email) while un-notified. */
export function addStockAlert({ productId, email, origin }) {
  if (stmtFind.get(productId, email)) return { already: true }
  stmtInsert.run(uid('alr'), productId, email, origin, new Date().toISOString())
  return { ok: true }
}

const sellable = (p) => (p.stock || 0) + (p.variants || []).reduce((a, v) => a + (v.stock || 0), 0)

/**
 * Sweep open alerts against live stock; email + stamp the ones whose product
 * is sellable again. Alerts are stamped BEFORE the send fires — sendBackInStock
 * never throws and leaves an admin-bell breadcrumb on failure, so a flaky
 * bridge can't cause a resend storm. Never throws (called after sync ops).
 */
export function processStockAlerts() {
  try {
    // Interest older than 6 months is stale — the shopper has moved on
    stmtPrune.run(new Date(Date.now() - 182 * 86_400_000).toISOString())
    for (const row of stmtOpen.all()) {
      const product = getItem('products', row.product_id)
      if (!product || !product.active || sellable(product) <= 0) continue
      stmtNotify.run(new Date().toISOString(), row.id)
      void sendBackInStock({
        to: row.email,
        product,
        url: `${row.origin || ''}/product/${product.id}`,
      })
    }
  } catch (err) {
    console.warn(`[tinymagic-api] stock alert sweep failed: ${err.message}`)
  }
}
