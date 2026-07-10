// Password-reset tokens, shared by both account systems: kind 'shopper' rows
// point at shop_accounts, kind 'staff' rows at users. Tokens are single-use,
// unguessable, and expire after an hour. The "forgot" endpoints always answer
// 200 whether or not the email exists — anything else is an account oracle.

import crypto from 'node:crypto'
import { db } from './db.js'

export const RESET_TTL_MS = 60 * 60_000

const stmtInsert = db.prepare(
  'INSERT INTO reset_tokens (token, kind, account_id, expires_at, used) VALUES (?, ?, ?, ?, 0)',
)
const stmtGet = db.prepare('SELECT * FROM reset_tokens WHERE token = ?')
const stmtUse = db.prepare('UPDATE reset_tokens SET used = 1 WHERE token = ? AND used = 0')
const stmtPrune = db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?')
const stmtVoidOthers = db.prepare('UPDATE reset_tokens SET used = 1 WHERE kind = ? AND account_id = ?')

/** Mint a fresh token for the account, invalidating any older ones for it. */
export function issueReset(kind, accountId) {
  stmtPrune.run(Date.now())
  stmtVoidOthers.run(kind, accountId)
  const token = crypto.randomBytes(32).toString('hex')
  stmtInsert.run(token, kind, accountId, Date.now() + RESET_TTL_MS)
  return token
}

/** Redeem exactly once. Returns the account id, or null for anything stale. */
export function redeemReset(token, kind) {
  const row = stmtGet.get(String(token || ''))
  if (!row || row.kind !== kind || row.used || row.expires_at < Date.now()) return null
  stmtUse.run(row.token)
  return row.account_id
}
