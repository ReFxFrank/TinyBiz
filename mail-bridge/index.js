#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TinyBiz Mail Bridge  (v2 — per-recipient personalization + tracking)
//
// A tiny always-on service that accepts newsletter send requests from the
// TinyBiz web app (which has no backend) over HTTP and delivers them via SMTP
// using nodemailer. The browser can't speak SMTP, so this bridge holds the
// mail credentials and does the sending.
//
// v2 accepts a TEMPLATE (with merge tags like {{first_name}}) plus a recipient
// list, personalizes it, and sends ONE email per recipient (no BCC). It injects
// open pixels / click-tracking / unsubscribe links and serves aggregated stats
// the app polls. Tracking events persist to tracking.json.
//
//   node index.js                 # uses ./config.json (or env)
//   node index.js --demo          # logs instead of sending, no SMTP, zero deps
//   node index.js --config path   # custom config file
//
// Real mode needs the `nodemailer` package (npm install). Demo mode needs
// nothing. See README.md for setup, SMTP providers, tracking, and the token model.
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ── Config ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DEMO_FLAG = args.includes('--demo')
const configArgIdx = args.indexOf('--config')
const CONFIG_PATH = configArgIdx >= 0 ? args[configArgIdx + 1] : path.join(__dirname, 'config.json')

// Tracking events live next to the bridge, regardless of --config location.
const TRACKING_PATH = path.join(__dirname, 'tracking.json')

const MAX_BODY_BYTES = 2 * 1024 * 1024 // ~2MB cap on request bodies

// 43-byte 1x1 transparent GIF served for open pixels.
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function loadConfig() {
  let fileConfig = {}
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    } catch (e) {
      console.error(`Failed to parse ${CONFIG_PATH}: ${e.message}`)
      process.exit(1)
    }
  }

  // Env overrides (handy for containers): PORT, SEND_TOKEN, PUBLIC_URL, and SMTP_*.
  const fileSmtp = fileConfig.smtp || {}
  const smtp = {
    host: process.env.SMTP_HOST || fileSmtp.host || '',
    port: Number(process.env.SMTP_PORT || fileSmtp.port || 587),
    secure:
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : fileSmtp.secure === true,
    user: process.env.SMTP_USER || fileSmtp.user || '',
    pass: process.env.SMTP_PASS || fileSmtp.pass || '',
  }

  const port = Number(process.env.PORT || fileConfig.port || 7071)

  // The externally-reachable base URL for tracking links embedded in emails.
  // Defaults to localhost — which only tracks recipients on the same machine.
  const publicUrl = String(
    process.env.PUBLIC_URL || fileConfig.publicUrl || `http://localhost:${port}`
  ).replace(/\/+$/, '')

  return {
    port,
    token: process.env.SEND_TOKEN || fileConfig.token || '',
    from: fileConfig.from || null,
    smtp,
    publicUrl,
  }
}

// True demo mode when the --demo flag is set OR no SMTP host is configured.
function isDemo(config) {
  return DEMO_FLAG || !config.smtp.host
}

// ── Event store (in-memory + JSON persistence) ───────────────────────────────

// tokens: token -> { campaignId, email }
// campaigns: campaignId -> {
//   delivered: Set<email>,
//   opens: [{ email, ts }],  uniqueOpens: Set<email>,
//   clicks: [{ email, ts }], uniqueClicks: Set<email>,
//   unsubscribes: Set<email>,
// }
const store = { tokens: {}, campaigns: {} }

function newCampaign() {
  return {
    delivered: new Set(),
    opens: [],
    uniqueOpens: new Set(),
    clicks: [],
    uniqueClicks: new Set(),
    unsubscribes: new Set(),
  }
}

function getCampaign(id) {
  if (!store.campaigns[id]) store.campaigns[id] = newCampaign()
  return store.campaigns[id]
}

// A short random urlsafe id (18 hex chars).
function makeToken() {
  return crypto.randomBytes(9).toString('hex')
}

// Sets aren't JSON-serializable, so flatten them to arrays on the way out…
function serializeStore() {
  const campaigns = {}
  for (const [id, c] of Object.entries(store.campaigns)) {
    campaigns[id] = {
      delivered: [...c.delivered],
      opens: c.opens,
      uniqueOpens: [...c.uniqueOpens],
      clicks: c.clicks,
      uniqueClicks: [...c.uniqueClicks],
      unsubscribes: [...c.unsubscribes],
    }
  }
  return { tokens: store.tokens, campaigns }
}

// …and rebuild them on the way back in.
function loadStore() {
  if (!fs.existsSync(TRACKING_PATH)) return
  try {
    const raw = JSON.parse(fs.readFileSync(TRACKING_PATH, 'utf8'))
    store.tokens = raw.tokens || {}
    for (const [id, c] of Object.entries(raw.campaigns || {})) {
      store.campaigns[id] = {
        delivered: new Set(c.delivered || []),
        opens: c.opens || [],
        uniqueOpens: new Set(c.uniqueOpens || []),
        clicks: c.clicks || [],
        uniqueClicks: new Set(c.uniqueClicks || []),
        unsubscribes: new Set(c.unsubscribes || []),
      }
    }
  } catch (e) {
    console.error(`Failed to load ${TRACKING_PATH}: ${e.message}`)
  }
}

// Persist the whole store, debounced ~1s so a burst of events writes once.
let saveTimer = null
function scheduleSave() {
  if (saveTimer) return
  saveTimer = setTimeout(flushStore, 1000)
}
function flushStore() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    fs.writeFileSync(TRACKING_PATH, JSON.stringify(serializeStore()))
  } catch (e) {
    console.error(`Failed to persist ${TRACKING_PATH}: ${e.message}`)
  }
}

// ── Personalization & tracking injection ─────────────────────────────────────

// Replace merge tags in a string. Handles {{first_name}}, {{ first_name }},
// {{name}}, {{shop}} and the {{unsubscribe}} placeholder. No-op on non-strings.
function personalize(str, ctx) {
  if (typeof str !== 'string') return str
  return str
    .replace(/\{\{\s*first_name\s*\}\}/gi, ctx.firstName)
    .replace(/\{\{\s*name\s*\}\}/gi, ctx.firstName)
    .replace(/\{\{\s*shop\s*\}\}/gi, ctx.shop)
    .replace(/\{\{\s*unsubscribe\s*\}\}/gi, ctx.unsubUrl)
}

// Rewrite real http/https <a href="…"> links through the click tracker. Skips
// anchors, mailto:, and anything already pointing at our publicUrl (e.g. the
// already-substituted unsubscribe link, or the open pixel — which is an <img>,
// not an href, so it's never touched anyway).
function rewriteLinks(html, token, publicUrl) {
  return html.replace(/href="([^"]*)"/gi, (match, target) => {
    if (!/^https?:\/\//i.test(target)) return match
    if (target.indexOf(publicUrl) === 0) return match
    return `href="${publicUrl}/c/${token}?u=${encodeURIComponent(target)}"`
  })
}

// Inject a 1x1 open pixel before </body> (or append if there's no body tag).
function injectPixel(html, token, publicUrl) {
  const pixel = `<img src="${publicUrl}/o/${token}" width="1" height="1" alt="" style="display:none">`
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, pixel + '</body>')
  return html + pixel
}

// ── Request helpers ──────────────────────────────────────────────────────────

// Collect the request body, JSON.parse it, and cap its size. Resolves with a
// parsed object, or rejects with { status, error } for the handler to relay.
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject({ status: 413, error: 'Payload too large' })
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject({ status: 400, error: 'Invalid JSON' })
      }
    })
    req.on('error', () => reject({ status: 400, error: 'Read error' }))
  })
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

// A small self-contained page shown after an unsubscribe. The shop identity
// can't be known reliably here, so keep it generic.
function unsubscribePage() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribed</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #f5f5f4; color: #1c1917; }
  .card { max-width: 30rem; margin: 1.5rem; padding: 2rem; background: #fff; border-radius: 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06); text-align: center; }
  h1 { margin: 0 0 .5rem; font-size: 1.4rem; }
  p { margin: .5rem 0 0; line-height: 1.5; color: #57534e; }
  .check { font-size: 2.5rem; line-height: 1; }
</style>
</head><body>
  <div class="card">
    <div class="check">✅</div>
    <h1>You've been unsubscribed</h1>
    <p>You won't receive any more newsletter emails from this sender. If this was a mistake, just reply to a previous email and ask to be added back.</p>
  </div>
</body></html>`
}

// ── Sending ──────────────────────────────────────────────────────────────────

// Log a per-recipient summary in demo mode — never touch the network. Also
// prints the first recipient's fully-personalized HTML so the merge tags and
// tracking rewrites can be inspected without SMTP.
function logDemoCampaign({ campaignId, subjectTemplate, messages }) {
  console.log('── Demo campaign ─────────────────────────')
  console.log(`  campaign:         ${campaignId}`)
  console.log(`  subject template: ${subjectTemplate}`)
  console.log(`  recipients:       ${messages.length}`)
  for (const m of messages.slice(0, 8)) {
    console.log(`  → ${m.email}  "${m.subject}"  token=${m.token}`)
  }
  if (messages.length > 8) console.log(`  → +${messages.length - 8} more`)
  const first = messages[0]
  if (first) {
    console.log(`  personalized HTML for ${first.email}:`)
    console.log('    ' + first.html.replace(/\n/g, '\n    '))
  }
  console.log('  (demo mode — nothing was actually sent)')
}

// Real send: lazy-require nodemailer so demo mode needs zero deps. Sends ONE
// message per recipient (To: that recipient), sequentially to be gentle on SMTP.
async function realSendAll(config, from, replyTo, messages) {
  let nodemailer
  try {
    nodemailer = require('nodemailer')
  } catch {
    throw new Error('The `nodemailer` package is required to send. Run `npm install` in mail-bridge/, or use --demo.')
  }

  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  })

  const fromField = from.name ? { name: from.name, address: from.email } : from.email

  for (const m of messages) {
    const message = {
      from: fromField,
      to: m.name ? { name: m.name, address: m.email } : m.email,
      subject: m.subject,
      html: m.html,
    }
    if (m.text) message.text = m.text
    if (replyTo) message.replyTo = replyTo
    await transport.sendMail(message)
  }
}

// ── HTTP server ──────────────────────────────────────────────────────────────

function startServer(config) {
  const demo = isDemo(config)

  const server = http.createServer(async (req, res) => {
    // Allow the TinyBiz SPA (any origin) to post send requests / poll stats.
    // The /o /c /u endpoints are hit by email clients directly so CORS is moot
    // there, but it's harmless to include.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    const parsed = new URL(req.url || '/', 'http://localhost')
    const url = parsed.pathname

    // ── Health ──────────────────────────────────────────────────────────────
    if (req.method === 'GET' && (url === '/' || url === '/health')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'tinybiz-mail-bridge',
        mode: demo ? 'demo' : 'smtp',
        campaigns: Object.keys(store.campaigns).length,
      })
    }

    // ── Open pixel ──────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.startsWith('/o/')) {
      const rec = store.tokens[url.slice(3)]
      if (rec) {
        const c = getCampaign(rec.campaignId)
        c.opens.push({ email: rec.email, ts: Date.now() })
        c.uniqueOpens.add(rec.email)
        scheduleSave()
      }
      // Always return the gif (even for unknown tokens) so clients don't error.
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store',
        'Content-Length': PIXEL_GIF.length,
      })
      return res.end(PIXEL_GIF)
    }

    // ── Click redirect ──────────────────────────────────────────────────────
    if (req.method === 'GET' && url.startsWith('/c/')) {
      const rec = store.tokens[url.slice(3)]
      if (rec) {
        const c = getCampaign(rec.campaignId)
        c.clicks.push({ email: rec.email, ts: Date.now() })
        c.uniqueClicks.add(rec.email)
        scheduleSave()
      }
      let target = parsed.searchParams.get('u')
      if (!target || !/^https?:\/\//i.test(target)) target = config.publicUrl
      res.writeHead(302, { Location: target })
      return res.end()
    }

    // ── Unsubscribe ─────────────────────────────────────────────────────────
    if (req.method === 'GET' && url.startsWith('/u/')) {
      const rec = store.tokens[url.slice(3)]
      if (rec) {
        getCampaign(rec.campaignId).unsubscribes.add(rec.email)
        scheduleSave()
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(unsubscribePage())
    }

    // ── Stats (polled by the app) ───────────────────────────────────────────
    if (req.method === 'GET' && url === '/stats') {
      const campaignId = parsed.searchParams.get('campaign') || ''
      const c = store.campaigns[campaignId]
      if (!c) {
        return sendJson(res, 200, {
          ok: true,
          campaignId,
          delivered: 0,
          opens: 0,
          uniqueOpens: 0,
          clicks: 0,
          uniqueClicks: 0,
          unsubscribes: 0,
          unsubscribedEmails: [],
        })
      }
      return sendJson(res, 200, {
        ok: true,
        campaignId,
        delivered: c.delivered.size,
        opens: c.opens.length,
        uniqueOpens: c.uniqueOpens.size,
        clicks: c.clicks.length,
        uniqueClicks: c.uniqueClicks.size,
        unsubscribes: c.unsubscribes.size,
        unsubscribedEmails: [...c.unsubscribes],
      })
    }

    // ── Send ────────────────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/send') {
      let body
      try {
        body = await readJsonBody(req)
      } catch (err) {
        return sendJson(res, err.status || 400, { ok: false, error: err.error || 'Bad request' })
      }

      // Auth: shared secret. In demo mode accept any token (default 'demo') so
      // the app can be wired up before real credentials exist.
      const expected = config.token || 'demo'
      if (!demo && (!body.token || body.token !== expected)) {
        return sendJson(res, 401, { ok: false, error: 'Unauthorized' })
      }

      // Validate the essentials.
      const from = body.from || {}
      const recipients = Array.isArray(body.recipients) ? body.recipients.filter((r) => r && r.email) : []
      if (!body.subject || !body.html || !from.email || recipients.length === 0) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Missing required fields: subject, html, from.email, recipients[]',
        })
      }

      // Old callers may omit campaignId / trackOpens / trackClicks; default them
      // so nothing about the pre-v2 contract breaks.
      const campaignId = body.campaignId || 'cmp_' + crypto.randomBytes(6).toString('hex')
      const shop = body.shop || ''
      const trackOpens = !!body.trackOpens
      const trackClicks = !!body.trackClicks
      const replyTo = body.replyTo

      // Personalize + inject tracking, one prepared message per recipient.
      const campaign = getCampaign(campaignId)
      const messages = []
      let firstToken = null
      for (const r of recipients) {
        const token = makeToken()
        if (!firstToken) firstToken = token
        store.tokens[token] = { campaignId, email: r.email }

        const firstName =
          r.firstName || (r.name && String(r.name).trim().split(/\s+/)[0]) || 'there'
        const unsubUrl = `${config.publicUrl}/u/${token}`
        const ctx = { firstName, shop, unsubUrl }

        const subject = personalize(body.subject, ctx)
        let html = personalize(body.html, ctx)
        if (trackClicks) html = rewriteLinks(html, token, config.publicUrl)
        if (trackOpens) html = injectPixel(html, token, config.publicUrl)
        const text = personalize(body.text, ctx)

        campaign.delivered.add(r.email)
        messages.push({ email: r.email, name: r.name, token, subject, html, text })
      }
      scheduleSave()

      if (demo) {
        logDemoCampaign({ campaignId, subjectTemplate: body.subject, messages })
        const resp = { ok: true, demo: true, sent: messages.length, campaignId }
        if (firstToken) {
          resp.sample = {
            open: `${config.publicUrl}/o/${firstToken}`,
            click: `${config.publicUrl}/c/${firstToken}?u=https%3A%2F%2Fexample.com`,
            unsubscribe: `${config.publicUrl}/u/${firstToken}`,
          }
        }
        return sendJson(res, 200, resp)
      }

      try {
        await realSendAll(config, from, replyTo, messages)
        console.log(`Sent "${body.subject}" to ${messages.length} recipient(s) [campaign ${campaignId}].`)
        return sendJson(res, 200, { ok: true, sent: messages.length, campaignId })
      } catch (err) {
        console.error(`Send failed: ${err.message}`)
        return sendJson(res, 502, { ok: false, error: err.message })
      }
    }

    // ── Send one (transactional — order confirmations etc.) ─────────────────
    // A single email, no campaign, no tracking. Used by the TinyBiz API server.
    if (req.method === 'POST' && url === '/send-one') {
      let body
      try {
        body = await readJsonBody(req)
      } catch (err) {
        return sendJson(res, err.status || 400, { ok: false, error: err.error || 'Bad request' })
      }

      const expected = config.token || 'demo'
      if (!demo && (!body.token || body.token !== expected)) {
        return sendJson(res, 401, { ok: false, error: 'Unauthorized' })
      }

      const from = body.from || {}
      if (!body.to || !body.subject || !body.html || !from.email) {
        return sendJson(res, 400, { ok: false, error: 'Missing required fields: to, subject, html, from.email' })
      }

      const message = { email: body.to, name: body.toName, subject: body.subject, html: body.html, text: body.text }

      if (demo) {
        console.log('')
        console.log(`── Transactional email (demo — not sent) ─────────────────────`)
        console.log(`   To:      ${body.to}${body.toName ? ` (${body.toName})` : ''}`)
        console.log(`   Subject: ${body.subject}`)
        console.log(`   From:    ${from.name || ''} <${from.email}>`)
        console.log(`───────────────────────────────────────────────────────────────`)
        return sendJson(res, 200, { ok: true, demo: true, sent: 1 })
      }

      try {
        await realSendAll(config, from, body.replyTo, [message])
        console.log(`Sent transactional "${body.subject}" to ${body.to}.`)
        return sendJson(res, 200, { ok: true, sent: 1 })
      } catch (err) {
        console.error(`Transactional send failed: ${err.message}`)
        return sendJson(res, 502, { ok: false, error: err.message })
      }
    }

    sendJson(res, 404, { ok: false, error: 'Not found' })
  })

  server.listen(config.port, () => {
    console.log(`TinyBiz mail bridge listening on http://0.0.0.0:${config.port} (${demo ? 'demo' : 'smtp'} mode)`)
    console.log(`  → health:  http://localhost:${config.port}/health`)
    console.log(`  → send:    POST http://localhost:${config.port}/send`)
    console.log(`  → stats:   GET  http://localhost:${config.port}/stats?campaign=<id>`)
    console.log(`  → tracking base (publicUrl): ${config.publicUrl}`)
    if (demo) {
      console.log('  Demo mode: requests are logged, not sent. Configure SMTP to send for real.')
    }
    if (config.publicUrl.includes('localhost') || config.publicUrl.includes('127.0.0.1')) {
      console.log('  Note: publicUrl is local — open/click tracking only works for recipients on this machine.')
    }
    console.log('  Set the Mail bridge URL + token in TinyBiz Settings → Newsletter.')
  })

  // Flush tracking on shutdown so the last <1s of events isn't lost.
  const flushAndExit = () => {
    flushStore()
    process.exit(0)
  }
  process.on('SIGINT', flushAndExit)
  process.on('SIGTERM', flushAndExit)
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const config = loadConfig()
  const demo = isDemo(config)
  if (!demo && !config.token) {
    console.error('No token set. Add "token" to config.json (or SEND_TOKEN env), or run with --demo.')
    process.exit(1)
  }
  loadStore()
  startServer(config)
}

main()
