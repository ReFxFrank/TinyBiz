// Customer accounts for the storefront — completely separate from the owner's
// admin login (own table, own cookie). Shoppers sign up with email + password,
// keep a shipping address on file, and see every order placed with their email
// (including past guest orders). Signing up also lands them in the owner's
// Customers section right away.

import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db, uid, getCollection, upsertItem, bumpRev } from './db.js'
import { publicOrder } from './store-api.js'
import { startSession as startAdminSession } from './auth.js'

const stmtAdminByEmail = db.prepare('SELECT * FROM users WHERE email = ?')

const COOKIE = 'tms_shopper'
const SESSION_DAYS = 180

const stmtByEmail = db.prepare('SELECT * FROM shop_accounts WHERE email = ?')
const stmtById = db.prepare('SELECT * FROM shop_accounts WHERE id = ?')
const stmtInsert = db.prepare(
  'INSERT INTO shop_accounts (id, email, name, pass_hash, address, created_at) VALUES (?, ?, ?, ?, ?, ?)',
)
const stmtSession = db.prepare(
  'SELECT s.token, s.expires_at, a.* FROM shop_sessions s JOIN shop_accounts a ON a.id = s.account_id WHERE s.token = ?',
)
const stmtInsertSession = db.prepare('INSERT INTO shop_sessions (token, account_id, expires_at) VALUES (?, ?, ?)')
const stmtTouchSession = db.prepare('UPDATE shop_sessions SET expires_at = ? WHERE token = ?')
const stmtDeleteSession = db.prepare('DELETE FROM shop_sessions WHERE token = ?')
const stmtPruneSessions = db.prepare('DELETE FROM shop_sessions WHERE expires_at < ?')

function parseCookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function setCookie(req, res, token, maxAgeSec) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`,
  )
}

function startSession(req, res, accountId) {
  const token = crypto.randomBytes(32).toString('hex')
  stmtInsertSession.run(token, accountId, Date.now() + SESSION_DAYS * 86_400_000)
  setCookie(req, res, token, SESSION_DAYS * 86_400)
}

function cleanAddress(raw) {
  if (!raw || typeof raw !== 'object') return null
  const s = (v) => String(v ?? '').trim().slice(0, 200)
  const a = { line1: s(raw.line1), city: s(raw.city), state: s(raw.state), zip: s(raw.zip) }
  return a.line1 || a.city || a.state || a.zip ? a : null
}

const publicAccount = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name || '',
  address: row.address ? JSON.parse(row.address) : null,
})

/** The owner/staff signed in with their studio login — no shopper account needed */
const staffAccount = (user) => ({
  id: `staff:${user.id}`,
  email: user.email,
  name: user.name || '',
  address: null,
  staff: true,
  role: user.role || 'owner',
})

/** Attach req.shopper when a valid shopper cookie is present (sliding expiry) */
function shopperSession(req) {
  const token = parseCookies(req)[COOKIE]
  if (!token) return null
  const row = stmtSession.get(token)
  if (!row || row.expires_at <= Date.now()) return null
  if (row.expires_at - Date.now() < (SESSION_DAYS - 1) * 86_400_000) {
    stmtTouchSession.run(Date.now() + SESSION_DAYS * 86_400_000, token)
  }
  return { row, token }
}

/** Keep the owner's Customers section in step with the account */
function syncAdminCustomer(account) {
  const customers = getCollection('customers')
  const existing = customers.find((c) => String(c.email || '').trim().toLowerCase() === account.email)
  if (existing) {
    upsertItem('customers', {
      ...existing,
      name: account.name || existing.name,
      address: account.address ? JSON.parse(account.address) : existing.address,
      tags: [...new Set([...(existing.tags || []), 'account'])],
    })
  } else {
    upsertItem('customers', {
      id: uid('cus'),
      name: account.name,
      email: account.email,
      address: account.address ? JSON.parse(account.address) : undefined,
      tags: ['storefront', 'account'],
      createdAt: new Date().toISOString(),
    })
  }
  bumpRev()
}

export const shopAccountRouter = Router()

shopAccountRouter.get('/me', (req, res) => {
  const sess = shopperSession(req)
  if (sess) return res.json({ account: publicAccount(sess.row) })
  // Owner/staff already signed into the admin are recognized automatically
  if (req.user) return res.json({ account: staffAccount(req.user) })
  res.json({ account: null })
})

shopAccountRouter.post('/signup', (req, res) => {
  const { name, email, password } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanName = String(name || '').trim().slice(0, 120)
  if (!cleanName) return res.status(400).json({ error: 'bad_name', message: 'Please enter your name.' })
  if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
    return res.status(400).json({ error: 'bad_email', message: 'That doesn’t look like an email address.' })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'Passwords need at least 8 characters.' })
  }
  // One generic answer for shopper AND staff emails — a distinct message
  // would let strangers probe which addresses are studio accounts
  if (stmtByEmail.get(cleanEmail) || stmtAdminByEmail.get(cleanEmail)) {
    return res.status(409).json({ error: 'email_taken', message: 'An account with that email already exists — sign in instead.' })
  }
  const id = uid('shp')
  stmtInsert.run(id, cleanEmail, cleanName, bcrypt.hashSync(password, 10), null, new Date().toISOString())
  const row = stmtById.get(id)
  syncAdminCustomer(row)
  stmtPruneSessions.run(Date.now())
  startSession(req, res, id)
  res.json({ ok: true, account: publicAccount(row) })
})

shopAccountRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  const row = stmtByEmail.get(cleanEmail)
  if (row && bcrypt.compareSync(String(password || ''), row.pass_hash)) {
    stmtPruneSessions.run(Date.now())
    startSession(req, res, row.id)
    return res.json({ ok: true, account: publicAccount(row) })
  }
  // Owner/staff can use their studio credentials right here — same check and
  // same session as the admin login, so no second account to remember.
  const admin = stmtAdminByEmail.get(cleanEmail)
  if (admin && !admin.disabled && bcrypt.compareSync(String(password || ''), admin.pass_hash)) {
    startAdminSession(req, res, admin.id)
    return res.json({
      ok: true,
      account: staffAccount({ id: admin.id, email: admin.email, name: admin.name, role: admin.role }),
    })
  }
  res.status(401).json({ error: 'bad_credentials', message: 'That email and password don’t match.' })
})

shopAccountRouter.post('/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE]
  if (token) stmtDeleteSession.run(token)
  setCookie(req, res, '', 0)
  res.json({ ok: true })
})

shopAccountRouter.patch('/me', (req, res) => {
  const sess = shopperSession(req)
  if (!sess) return res.status(401).json({ error: 'unauthorized' })
  const { name, address } = req.body || {}
  if (name != null) {
    const cleanName = String(name).trim().slice(0, 120)
    if (!cleanName) return res.status(400).json({ error: 'bad_name', message: 'Please enter your name.' })
    db.prepare('UPDATE shop_accounts SET name = ? WHERE id = ?').run(cleanName, sess.row.id)
  }
  if (address !== undefined) {
    const clean = cleanAddress(address)
    db.prepare('UPDATE shop_accounts SET address = ? WHERE id = ?').run(clean ? JSON.stringify(clean) : null, sess.row.id)
  }
  const fresh = stmtById.get(sess.row.id)
  syncAdminCustomer(fresh)
  res.json({ ok: true, account: publicAccount(fresh) })
})

shopAccountRouter.post('/password', (req, res) => {
  const sess = shopperSession(req)
  if (!sess) return res.status(401).json({ error: 'unauthorized' })
  const { current, next } = req.body || {}
  if (typeof next !== 'string' || next.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'Passwords need at least 8 characters.' })
  }
  if (!bcrypt.compareSync(String(current || ''), sess.row.pass_hash)) {
    return res.status(401).json({ error: 'bad_credentials', message: 'Current password is incorrect.' })
  }
  db.prepare('UPDATE shop_accounts SET pass_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), sess.row.id)
  res.json({ ok: true })
})

/** Every order placed with the account's email — guest orders included */
shopAccountRouter.get('/orders', (req, res) => {
  const sess = shopperSession(req)
  const email = sess ? sess.row.email : req.user ? String(req.user.email).toLowerCase() : null
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const orders = getCollection('orders')
    .filter((o) => String(o.email || '').trim().toLowerCase() === email)
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    .map(publicOrder)
  res.json({ orders })
})
