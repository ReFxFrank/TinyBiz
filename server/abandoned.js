// Abandoned-checkout recovery. Stripe-mode checkouts park the priced cart in
// pending_checkouts before redirecting to Stripe; rows that never gain an
// order_id are shoppers who wandered off mid-payment. Two hours later they get
// exactly one nudge (the client-side cart still has their items). Mock-mode
// checkouts finalize instantly, so this only ever fires once Stripe is on.

import { db, getMeta } from './db.js'
import { sendCartReminder } from './email.js'

const REMIND_AFTER_MS = 2 * 60 * 60_000
// Don't nudge carts older than this — the moment has passed (and on the first
// deploy of this feature, week-old rows must not suddenly get emailed)
const REMIND_WINDOW_MS = 48 * 60 * 60_000

const stmtDue = db.prepare(
  'SELECT * FROM pending_checkouts WHERE order_id IS NULL AND reminded_at IS NULL AND created_at < ? AND created_at > ?',
)
const stmtStamp = db.prepare('UPDATE pending_checkouts SET reminded_at = ? WHERE id = ?')

/** One pass. Rows are stamped before the send so a flaky bridge can't loop. */
export function sweepAbandonedCarts() {
  try {
    if (getMeta('settings')?.abandonedCartEmails === false) return
    const now = Date.now()
    const due = stmtDue.all(new Date(now - REMIND_AFTER_MS).toISOString(), new Date(now - REMIND_WINDOW_MS).toISOString())
    for (const row of due) {
      stmtStamp.run(new Date(now).toISOString(), row.id)
      let payload
      try {
        payload = JSON.parse(row.payload)
      } catch {
        continue
      }
      if (!payload?.contact?.email || !Array.isArray(payload?.totals?.lines)) continue
      void sendCartReminder({ payload, origin: row.origin || '' })
    }
  } catch (err) {
    console.warn(`[tinymagic-api] abandoned-cart sweep failed: ${err.message}`)
  }
}

/** Startup pass + a steady tick. Interval is env-tunable for tests. */
export function startAbandonedCartSweep() {
  sweepAbandonedCarts()
  const every = Number(process.env.ABANDONED_SWEEP_MS) || 10 * 60_000
  setInterval(sweepAbandonedCarts, every).unref()
}
