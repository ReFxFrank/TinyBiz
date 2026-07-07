// TinyBiz API server. One small Node process next to the static frontend:
// owner auth + state sync for the admin, a public storefront API, and Stripe.
//
//   node index.js              (port 4000, DB next to this file)
//   TINYBIZ_DB=/var/lib/tinybiz/tinybiz.db PORT=4000 node index.js
//
// In dev, Vite proxies /api here; in production, nginx does.

import express from 'express'
import { currentRev } from './db.js'
import { authRouter, sessionMiddleware } from './auth.js'
import { stateRouter } from './state.js'
import { storeRouter, webhookRouter } from './store-api.js'
import { stripeEnabled } from './stripe.js'
import { requireAuth } from './auth.js'

const app = express()
app.set('trust proxy', 1) // nginx sits in front — respect X-Forwarded-Proto
app.disable('x-powered-by')

// Stripe webhooks must see the RAW body for signature verification — mount
// before the JSON parser.
app.use('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), webhookRouter)

app.use(express.json({ limit: '15mb' })) // localStorage imports can be chunky
app.use(sessionMiddleware)

app.get('/api/health', (_req, res) => res.json({ ok: true, rev: currentRev(), stripe: stripeEnabled() }))
app.get('/api/stripe/status', requireAuth, (_req, res) => res.json({ enabled: stripeEnabled() }))

app.use('/api/auth', authRouter)
app.use('/api/store', storeRouter)
// Mounted last: stateRouter guards everything that reaches it with requireAuth
app.use('/api', stateRouter)

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

// Route handlers throw {status, error, message} for expected failures
app.use((err, _req, res, _next) => {
  const status = Number(err?.status) || 500
  if (status >= 500) console.error('[tinybiz-api]', err)
  res.status(status).json({ error: err?.error || 'server_error', message: err?.message || 'Something went wrong.' })
})

const port = Number(process.env.PORT) || 4000
app.listen(port, '127.0.0.1', () => {
  console.log(`TinyBiz API listening on http://127.0.0.1:${port} (stripe: ${stripeEnabled() ? 'enabled' : 'off — mock checkout'})`)
})
