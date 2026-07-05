#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TinyBiz Mail Bridge
//
// A tiny always-on service that accepts newsletter send requests from the
// TinyBiz web app (which has no backend) over HTTP and delivers them via SMTP
// using nodemailer. The browser can't speak SMTP, so this bridge holds the
// mail credentials and does the sending.
//
//   node index.js                 # uses ./config.json (or env)
//   node index.js --demo          # logs instead of sending, no SMTP, zero deps
//   node index.js --config path   # custom config file
//
// Real mode needs the `nodemailer` package (npm install). Demo mode needs
// nothing. See README.md for setup, SMTP providers, and the token model.
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')

// ── Config ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DEMO_FLAG = args.includes('--demo')
const configArgIdx = args.indexOf('--config')
const CONFIG_PATH = configArgIdx >= 0 ? args[configArgIdx + 1] : path.join(__dirname, 'config.json')

const MAX_BODY_BYTES = 2 * 1024 * 1024 // ~2MB cap on request bodies

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

  // Env overrides (handy for containers): PORT, SEND_TOKEN, and SMTP_*.
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

  return {
    port: Number(process.env.PORT || fileConfig.port || 7071),
    token: process.env.SEND_TOKEN || fileConfig.token || '',
    from: fileConfig.from || null,
    smtp,
  }
}

// True demo mode when the --demo flag is set OR no SMTP host is configured.
function isDemo(config) {
  return DEMO_FLAG || !config.smtp.host
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

// ── Sending ──────────────────────────────────────────────────────────────────

// Log a summary in demo mode — never touch the network.
function logDemoSend({ subject, from, recipients }) {
  const preview = recipients
    .slice(0, 5)
    .map((r) => r.email)
    .join(', ')
  const more = recipients.length > 5 ? `, +${recipients.length - 5} more` : ''
  console.log('── Demo send ─────────────────────────────')
  console.log(`  subject:    ${subject}`)
  console.log(`  from:       ${from.name ? `${from.name} <${from.email}>` : from.email}`)
  console.log(`  recipients: ${recipients.length}`)
  console.log(`  to:         ${preview}${more}`)
  console.log('  (demo mode — nothing was actually sent)')
}

// Real send: lazy-require nodemailer so demo mode needs zero deps. Sends one
// message with all recipients BCC'd so their addresses aren't exposed to each
// other; From is the sender and To is set to the sender's own address.
async function realSend(config, { subject, html, text, from, replyTo, recipients }) {
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
  const message = {
    from: fromField,
    to: from.email,
    bcc: recipients.map((r) => (r.name ? { name: r.name, address: r.email } : r.email)),
    subject,
    html,
  }
  if (text) message.text = text
  if (replyTo) message.replyTo = replyTo

  await transport.sendMail(message)
}

// ── HTTP server ──────────────────────────────────────────────────────────────

function startServer(config) {
  const demo = isDemo(config)

  const server = http.createServer(async (req, res) => {
    // Allow the TinyBiz SPA (any origin) to post send requests.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    const url = (req.url || '/').split('?')[0]

    if (req.method === 'GET' && (url === '/' || url === '/health')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'tinybiz-mail-bridge',
        mode: demo ? 'demo' : 'smtp',
      })
    }

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

      const payload = {
        subject: body.subject,
        html: body.html,
        text: body.text,
        from,
        replyTo: body.replyTo,
        recipients,
      }

      if (demo) {
        logDemoSend(payload)
        return sendJson(res, 200, { ok: true, demo: true, sent: recipients.length })
      }

      try {
        await realSend(config, payload)
        console.log(`Sent "${payload.subject}" to ${recipients.length} recipient(s).`)
        return sendJson(res, 200, { ok: true, sent: recipients.length })
      } catch (err) {
        console.error(`Send failed: ${err.message}`)
        return sendJson(res, 502, { ok: false, error: err.message })
      }
    }

    sendJson(res, 404, { ok: false, error: 'Not found' })
  })

  server.listen(config.port, () => {
    console.log(`TinyBiz mail bridge listening on http://0.0.0.0:${config.port} (${demo ? 'demo' : 'smtp'} mode)`)
    console.log(`  → health:  http://localhost:${config.port}/health`)
    console.log(`  → send:    POST http://localhost:${config.port}/send`)
    if (demo) {
      console.log('  Demo mode: requests are logged, not sent. Configure SMTP to send for real.')
    }
    console.log('  Set the Mail bridge URL + token in TinyBiz Settings → Newsletter.')
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const config = loadConfig()
  const demo = isDemo(config)
  if (!demo && !config.token) {
    console.error('No token set. Add "token" to config.json (or SEND_TOKEN env), or run with --demo.')
    process.exit(1)
  }
  startServer(config)
}

main()
