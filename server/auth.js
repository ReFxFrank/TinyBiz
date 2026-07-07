// Owner authentication: single-account, cookie sessions stored in SQLite.
// First run has no user — the client shows a Setup screen and calls /setup,
// which can seed the database from the browser (sample data or a localStorage
// import) in the same request.

import { Router } from 'express'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db, uid, importState, bumpRev } from './db.js'

const COOKIE = 'tb_session'
const SESSION_DAYS = 30

const stmtUserCount = db.prepare('SELECT COUNT(*) AS n FROM users')
const stmtUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
const stmtInsertUser = db.prepare('INSERT INTO users (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)')
const stmtInsertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
const stmtSession = db.prepare('SELECT s.token, s.expires_at, u.id AS user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
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

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = Date.now() + SESSION_DAYS * 86_400_000
  stmtInsertSession.run(token, userId, expires)
  setSessionCookie(req, res, token, SESSION_DAYS * 86_400)
  return token
}

/** Attach req.user when a valid session cookie is present (sliding expiry) */
export function sessionMiddleware(req, _res, next) {
  const token = parseCookies(req)[COOKIE]
  if (token) {
    const row = stmtSession.get(token)
    if (row && row.expires_at > Date.now()) {
      req.user = { id: row.user_id, email: row.email }
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

export const authRouter = Router()

authRouter.get('/me', (req, res) => {
  const needsSetup = stmtUserCount.get().n === 0
  res.json({ needsSetup, user: req.user ? { email: req.user.email } : null })
})

authRouter.post('/setup', (req, res) => {
  if (stmtUserCount.get().n > 0) return res.status(409).json({ error: 'already_setup' })
  const { email, password, state } = req.body || {}
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!/\S+@\S+\.\S+/.test(cleanEmail)) return res.status(400).json({ error: 'bad_email' })
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'weak_password' })

  const userId = uid('usr')
  stmtInsertUser.run(userId, cleanEmail, bcrypt.hashSync(password, 10), new Date().toISOString())
  if (state && typeof state === 'object') importState(state)
  else bumpRev()
  startSession(req, res, userId)
  res.json({ ok: true, user: { email: cleanEmail } })
})

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {}
  const user = stmtUserByEmail.get(String(email || '').trim().toLowerCase())
  if (!user || !bcrypt.compareSync(String(password || ''), user.pass_hash)) {
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
