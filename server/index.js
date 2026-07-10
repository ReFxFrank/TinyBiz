// Tiny Magic Studio API server. One small Node process next to the static frontend:
// owner auth + state sync for the admin, a public storefront API, and Stripe.
//
//   node index.js              (port 4000, DB next to this file)
//   TINYMAGIC_DB=/var/lib/tinymagic/tinymagic.db PORT=4000 node index.js
//
// In dev, Vite proxies /api here; in production, nginx does.

import express from 'express'
import { currentRev, getCollection } from './db.js'
import { authRouter, teamRouter, sessionMiddleware, requireAuth, requireOwner } from './auth.js'
import { stateRouter } from './state.js'
import { storeRouter, webhookRouter } from './store-api.js'
import { shopAccountRouter } from './shop-accounts.js'
import { stripeEnabled } from './stripe.js'
import { rateLimit } from './ratelimit.js'
import { uploadsRouter, uploadsStatic } from './uploads.js'
import { createBackup } from './backup.js'

const app = express()
app.set('trust proxy', 1) // nginx sits in front — respect X-Forwarded-Proto
app.disable('x-powered-by')

// Stripe webhooks must see the RAW body for signature verification — mount
// before the JSON parser.
app.use('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), webhookRouter)

// Brute-force / scrape guards, before body parsing so blocked requests stay cheap
app.use('/api/auth/login', rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'login' }))
app.use('/api/auth/setup', rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'setup' }))
app.use('/api/auth/password', rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'password' }))
app.use('/api/store/checkout', rateLimit({ windowMs: 15 * 60_000, max: 30, name: 'checkout' }))
app.use('/api/store/track', rateLimit({ windowMs: 10 * 60_000, max: 30, name: 'track' }))
app.use('/api/store/subscribe', rateLimit({ windowMs: 10 * 60_000, max: 30, name: 'subscribe' }))
app.use('/api/store/account/signup', rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'shop-signup' }))
app.use('/api/store/account/login', rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'shop-login' }))
app.use('/api/store/account/password', rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'shop-password' }))

// Product photos: reads are public (the storefront shows them), writes need
// product access. The router parses its own raw image body.
app.use('/uploads', uploadsStatic)

app.use(express.json({ limit: '15mb' })) // localStorage imports can be chunky
app.use(sessionMiddleware)

app.get('/api/health', (_req, res) => res.json({ ok: true, rev: currentRev(), stripe: stripeEnabled() }))

// SEO endpoints — nginx proxies these two root paths here. Origin comes from
// the request (trust proxy is on), so no domain configuration is needed.
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
app.get('/robots.txt', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${origin}/sitemap.xml\n`)
})
app.get('/sitemap.xml', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`
  const urls = ['/', '/shop', '/track', '/policies']
  for (const p of getCollection('products')) {
    if (p.active) urls.push(`/product/${p.id}`)
  }
  const body = urls.map((u) => `  <url><loc>${xmlEsc(origin + u)}</loc></url>`).join('\n')
  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`)
})
app.get('/api/stripe/status', requireAuth, (_req, res) => res.json({ enabled: stripeEnabled() }))

app.use('/api/auth', authRouter)
app.use('/api/team', teamRouter)
app.use('/api/store/account', shopAccountRouter)
app.use('/api/store', storeRouter)
app.use('/api/uploads', uploadsRouter)

// On-demand snapshot for the owner (nightly cron handles the scheduled ones)
app.get('/api/backup', requireAuth, requireOwner, (req, res, next) => {
  createBackup()
    .then((file) => res.download(file))
    .catch(next)
})
// Mounted last: stateRouter guards everything that reaches it with requireAuth
app.use('/api', stateRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

// Route handlers throw {status, error, message} for expected failures
app.use((err, _req, res, _next) => {
  const status = Number(err?.status) || 500
  if (status >= 500) console.error('[tinymagic-api]', err)
  res.status(status).json({ error: err?.error || 'server_error', message: err?.message || 'Something went wrong.' })
})

const port = Number(process.env.PORT) || 4000
app.listen(port, '127.0.0.1', () => {
  console.log(`Tiny Magic Studio API listening on http://127.0.0.1:${port} (stripe: ${stripeEnabled() ? 'enabled' : 'off — mock checkout'})`)
})
