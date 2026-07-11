// SQLite persistence. Collections are stored document-style —
// one row per item, JSON payload — because the client works with whole
// objects and the datasets are small. Anything the server must reason about
// (auth, pending Stripe checkouts) gets a real table.

import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Every client-side collection, mirrored 1:1 (src/store/useStore.ts Collections) */
export const COLLECTIONS = [
  'products', 'materials', 'orders', 'customers', 'suppliers', 'expenses',
  'incomes', 'recipes', 'batches', 'machines', 'shipments', 'tasks', 'events',
  'daysOff', 'documents', 'employees', 'campaigns', 'promoCodes',
  'socialAccounts', 'socialPosts', 'subscribers', 'newsletters',
  'adjustments', 'notifications', 'tickets', 'reviews',
]

const DB_ENV = process.env.TINYMAGIC_DB || process.env.TINYBIZ_DB // legacy name still honored
const DB_PATH = DB_ENV ? resolve(DB_ENV) : resolve(dirname(fileURLToPath(import.meta.url)), 'tinymagic.db')
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pending_checkouts (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    session_id TEXT,
    order_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pending_session ON pending_checkouts(session_id);
  CREATE TABLE IF NOT EXISTS shop_accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    pass_hash TEXT NOT NULL,
    address TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shop_sessions (
    token TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES shop_accounts(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reset_tokens (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL, -- 'shopper' (shop_accounts) or 'staff' (users)
    account_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS stock_alerts (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    email TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    notified_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_stock_alerts_open ON stock_alerts(product_id) WHERE notified_at IS NULL;
`)

// Migration: staff accounts — pre-existing users tables lack these columns.
// The first account ever created is the owner; anything else defaults staff.
{
  const cols = db.prepare("PRAGMA table_info('users')").all().map((c) => c.name)
  if (!cols.includes('role')) {
    db.exec(`
      ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT '';
      ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff';
      ALTER TABLE users ADD COLUMN perms TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
    `)
    db.prepare(
      "UPDATE users SET role = 'owner' WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)",
    ).run()
  }
}

// Migration: abandoned-cart reminders — pre-existing pending_checkouts tables
// lack the reminder stamp and the request origin (used for the checkout link).
{
  const cols = db.prepare("PRAGMA table_info('pending_checkouts')").all().map((c) => c.name)
  if (!cols.includes('reminded_at')) {
    db.exec(`
      ALTER TABLE pending_checkouts ADD COLUMN reminded_at TEXT;
      ALTER TABLE pending_checkouts ADD COLUMN origin TEXT NOT NULL DEFAULT '';
    `)
  }
}

// ── Collections ───────────────────────────────────────────────────────────────

const stmtAll = db.prepare('SELECT data FROM kv WHERE collection = ?')
const stmtGet = db.prepare('SELECT data FROM kv WHERE collection = ? AND id = ?')
const stmtPut = db.prepare('INSERT INTO kv (collection, id, data) VALUES (?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data')
const stmtDel = db.prepare('DELETE FROM kv WHERE collection = ? AND id = ?')
const stmtClear = db.prepare('DELETE FROM kv WHERE collection = ?')

export function getCollection(name) {
  return stmtAll.all(name).map((r) => JSON.parse(r.data))
}

export function getItem(collection, id) {
  const row = stmtGet.get(collection, id)
  return row ? JSON.parse(row.data) : null
}

export function upsertItem(collection, item) {
  stmtPut.run(collection, String(item.id), JSON.stringify(item))
}

export function deleteItem(collection, id) {
  stmtDel.run(collection, String(id))
}

export function replaceCollection(name, items) {
  stmtClear.run(name)
  for (const item of items) upsertItem(name, item)
}

// ── Meta (settings, newsletterSettings, rev) ─────────────────────────────────

const stmtMetaGet = db.prepare('SELECT value FROM meta WHERE key = ?')
const stmtMetaPut = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

export function getMeta(key, fallback = null) {
  const row = stmtMetaGet.get(key)
  return row ? JSON.parse(row.value) : fallback
}

export function setMeta(key, value) {
  stmtMetaPut.run(key, JSON.stringify(value))
}

/** Monotonic revision — bumped on every write so clients can cheap-poll */
export function bumpRev() {
  const rev = (getMeta('rev', 0) || 0) + 1
  setMeta('rev', rev)
  return rev
}

export function currentRev() {
  return getMeta('rev', 0) || 0
}

/** Replace the whole dataset (first-run seed or localStorage import) */
export const importState = db.transaction((state) => {
  for (const name of COLLECTIONS) {
    if (Array.isArray(state[name])) replaceCollection(name, state[name])
  }
  if (state.settings) setMeta('settings', state.settings)
  if (state.newsletterSettings) setMeta('newsletterSettings', state.newsletterSettings)
  return bumpRev()
})

export function fullState() {
  const state = {}
  for (const name of COLLECTIONS) state[name] = getCollection(name)
  state.settings = getMeta('settings')
  state.newsletterSettings = getMeta('newsletterSettings')
  return state
}

/** Server-side ids. Crypto-random suffix: order ids are used in public lookup
 *  URLs, so they must not be guessable from a timestamp + weak PRNG. */
export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(8).toString('hex')}`
}
