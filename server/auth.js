// Accounts: one owner plus any number of staff, cookie sessions in SQLite.
// First run has no user — the client shows a Setup screen and calls /setup,
// which creates the OWNER and can seed the database in the same request.
// Staff accounts are created by the owner (team.js) with per-section perms.

import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db, uid, importState, bumpRev } from './db.js'
import { computeAccess, sanitizePerms } from './perms.js'

const COOKIE = 'tms_session'
const LEGACY_COOKIE = 'tb_session' // pre-rename sessions keep working
const SESSION_DAYS = 30

const stmtUserCount = db.prepare('SELECT COUNT(*) AS n FROM users')
const stmtUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
const stmtInsertUser = db.prepare(
  'INSERT INTO users (id, email, pass_hash, created_at, name, role, perms, disabled) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
)
const stmtInsertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
const stmtSession = db.prepare(
  'SELECT s.token, s.expires_at, u.id AS user_id, u.email, u.name, u.role, u.perms, u.disabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
)
const stmtTouchSession = db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
const stmtDeleteSession = db.prepare('DELETE FROM sessions WHERE token = ?')
const stmtPruneSessions = db.prepare('DELETE FROM sessions WHERE expires_at < ?')

function parseCookies(req) {
  const out = {}
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function setSessionCookie(req, res, token, maxAgeSec) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`,
  )
}

export function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = Date.now() + SESSION_DAYS * 86_400_000
  stmtInsertSession.run(token, userId, expires)
  setSessionCookie(req, res, token, SESSION_DAYS * 86_400)
  return token
}

export function createUser({ email, password, name = '', role = 'staff', perms = [] }) {
  const id = uid('usr')
  stmtInsertUser.run(
    id,
    email,
    bcrypt.hashSync(password, 10),
    new Date().toISOString(),
    name,
    role,
    JSON.stringify(sanitizePerms(perms)),
  )
  return id
}

/** Attach req.user when a valid session cookie is present (sliding expiry) */
export function sessionMiddleware(req, _res, next) {
  const cookies = parseCookies(req)
  const token = cookies[COOKIE] || cookies[LEGACY_COOKIE]
  if (token) {
    const row = stmtSession.get(token)
    if (row && row.expires_at > Date.now() && !row.disabled) {
      req.user = {
        id: row.user_id,
        email: row.email,
        name: row.name || '',
        role: row.role || 'owner',
        perms: JSON.parse(row.perms || '[]'),
      }
      req.sessionToken = token
      // Slide the expiry forward at most once a day to keep writes rare
      if (row.expires_at - Date.now() < (SESSION_DAYS - 1) * 86_400_000) {
        stmtTouchSession.run(Date.now() + SESSION_DAYS * 86_400_000, token)
      }
    }
  }
  next()
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' })
  next()
}

export function requireOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' })
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'owner_only' })
  next()
}

/** What the client needs to gate its UI and sync engine */
function accessPayload(user) {
  const access = computeAccess(user)
  if (access.all) return { all: true }
  return {
    all: false,
    readable: [...access.readable],
    writable: [...access.writable],
    canWriteSettings: access.canWriteSettings,
    canWriteNewsletterSettings: access.canWriteNewsletterSettings,
  }
}

export const authRouter = Router()

authRouter.get('/me', (req, res) => {
  const needsSetup = stmtUserCount.get().n === 0
  res.json({
    needsSetup,
    user: req.user
      ? { email: req.user.email, name: req.user.name, role: req.user.role, perms: req.user.perms, access: accessPayload(req.user) }
      : null,
  })
})

authRouter.post('/setup', (req, res) => {
  if (stmtUserCount.get().n > 0) return res.status(409).json({ error: 'already_setup' })
  const { email, password, state } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!/\S+@\S+\.\S+/.test(cleanEmail)) return res.status(400).json({ error: 'bad_email' })
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'weak_password' })

  const userId = createUser({ email: cleanEmail, password, role: 'owner' })
  if (state && typeof state === 'object') importState(state)
  else bumpRev()
  startSession(req, res, userId)
  res.json({ ok: true, user: { email: cleanEmail } })
})

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {}
  const user = stmtUserByEmail.get(String(email || '').trim().toLowerCase())
  if (!user || user.disabled || !bcrypt.compareSync(String(password || ''), user.pass_hash)) {
    return res.status(401).json({ error: 'bad_credentials' })
  }
  stmtPruneSessions.run(Date.now())
  startSession(req, res, user.id)
  res.json({ ok: true, user: { email: user.email } })
})

authRouter.post('/logout', (req, res) => {
  if (req.sessionToken) stmtDeleteSession.run(req.sessionToken)
  setSessionCookie(req, res, '', 0)
  res.json({ ok: true })
})

/** Any signed-in account can change its own password (current one required) */
authRouter.post('/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {}
  if (typeof next !== 'string' || next.length < 8) return res.status(400).json({ error: 'weak_password' })
  const row = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(req.user.id)
  if (!row || !bcrypt.compareSync(String(current || ''), row.pass_hash)) {
    return res.status(401).json({ error: 'bad_credentials', message: 'Current password is incorrect.' })
  }
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), req.user.id)
  res.json({ ok: true })
})

// ── Team management (owner only) ─────────────────────────────────────────────

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name || '',
  role: u.role,
  perms: JSON.parse(u.perms || '[]'),
  disabled: Boolean(u.disabled),
  createdAt: u.created_at,
})

export const teamRouter = Router()
teamRouter.use(requireOwner)

teamRouter.get('/', (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all()
  res.json({ users: users.map(publicUser) })
})

teamRouter.post('/', (req, res) => {
  const { email, name, password, perms } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!/\S+@\S+\.\S+/.test(cleanEmail)) return res.status(400).json({ error: 'bad_email', message: 'Enter a valid email.' })
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters.' })
  }
  if (stmtUserByEmail.get(cleanEmail)) {
    return res.status(409).json({ error: 'email_taken', message: 'An account with that email already exists.' })
  }
  const id = createUser({ email: cleanEmail, password, name: String(name || '').trim(), perms })
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) })
})

teamRouter.patch('/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: 'not_found' })
  if (target.role === 'owner' && target.id !== req.user.id) {
    return res.status(403).json({ error: 'owner_locked' })
  }
  const { name, perms, password, disabled } = req.body || {}
  if (name != null) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(name).trim(), target.id)
  if (perms != null && target.role !== 'owner') {
    db.prepare('UPDATE users SET perms = ? WHERE id = ?').run(JSON.stringify(sanitizePerms(perms)), target.id)
  }
  if (typeof password === 'string') {
    if (password.length < 8) return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters.' })
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), target.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id) // sign their sessions out
  }
  if (disabled != null && target.role !== 'owner') {
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, target.id)
    if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
  }
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)) })
})

teamRouter.delete('/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: 'not_found' })
  if (target.role === 'owner') return res.status(403).json({ error: 'owner_locked' })
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id)
  res.json({ ok: true })
})
