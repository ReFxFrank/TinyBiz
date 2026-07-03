#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TinyBiz Printer Bridge
//
// A tiny always-on service that reads live status from Bambu Lab printers over
// their local MQTT broker and exposes it as JSON at GET /status, so the TinyBiz
// web app (which has no backend) can show whether each printer is printing or
// idle. Read-only: it never sends print/control commands.
//
//   node index.js                 # uses ./config.json (or env)
//   node index.js --demo          # simulated printers, no MQTT, zero deps
//   node index.js --config path   # custom config file
//
// Real mode needs the `mqtt` package (npm install). Demo mode needs nothing.
// See README.md for setup, LAN mode, and access codes.
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

const http = require('http')
const fs = require('fs')
const path = require('path')

// ── Config ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DEMO = args.includes('--demo')
const configArgIdx = args.indexOf('--config')
const CONFIG_PATH = configArgIdx >= 0 ? args[configArgIdx + 1] : path.join(__dirname, 'config.json')

function loadConfig() {
  // Env override (handy for containers): PORT, and PRINTERS as JSON
  const envPrinters = process.env.PRINTERS ? JSON.parse(process.env.PRINTERS) : null
  let fileConfig = {}
  if (!envPrinters && fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    } catch (e) {
      console.error(`Failed to parse ${CONFIG_PATH}: ${e.message}`)
      process.exit(1)
    }
  }
  return {
    port: Number(process.env.PORT || fileConfig.port || 7070),
    printers: envPrinters || fileConfig.printers || [],
  }
}

// ── Live state (latest snapshot per printer) ─────────────────────────────────

/** id -> { id, name, model, state, percent, job, nozzle, bed, remainingMin, online, updatedAt } */
const snapshots = new Map()

// Map Bambu's gcode_state to a simple running/idle status.
function normalizeState(gcodeState) {
  const s = String(gcodeState || '').toUpperCase()
  if (s === 'RUNNING' || s === 'PAUSE' || s === 'PREPARE' || s === 'SLICING') return 'printing'
  if (s === 'FINISH' || s === 'IDLE' || s === '' || s === 'FAILED') return 'idle'
  return 'idle'
}

function setSnapshot(printer, patch) {
  const prev = snapshots.get(printer.id) || {
    id: printer.id,
    name: printer.name || printer.id,
    model: printer.model || '',
    state: 'unknown',
    percent: 0,
    job: null,
    nozzle: null,
    bed: null,
    remainingMin: null,
    online: false,
  }
  snapshots.set(printer.id, { ...prev, ...patch, updatedAt: new Date().toISOString() })
}

// ── Real printers: local MQTT ────────────────────────────────────────────────

function connectPrinter(printer) {
  let mqtt
  try {
    mqtt = require('mqtt')
  } catch {
    console.error('The `mqtt` package is required for real printers. Run `npm install` in bridge/, or use --demo.')
    process.exit(1)
  }

  const { id: serial, host, accessCode } = printer
  if (!serial || !host || !accessCode) {
    console.error(`Printer "${printer.name || serial}" is missing serial/host/accessCode — skipping.`)
    return
  }

  const url = `mqtts://${host}:8883`
  console.log(`[${printer.name || serial}] connecting to ${url} …`)
  setSnapshot(printer, { online: false, state: 'unknown' })

  const client = mqtt.connect(url, {
    username: 'bblp',
    password: accessCode,
    // Bambu's broker uses a self-signed cert; we only read status.
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 8000,
  })

  const reportTopic = `device/${serial}/report`
  const requestTopic = `device/${serial}/request`
  const requestFull = () =>
    client.publish(requestTopic, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }))

  client.on('connect', () => {
    console.log(`[${printer.name || serial}] connected`)
    setSnapshot(printer, { online: true })
    client.subscribe(reportTopic, (err) => {
      if (err) console.error(`[${printer.name || serial}] subscribe failed: ${err.message}`)
      else requestFull()
    })
    // P1/A1 send deltas — periodically ask for a full snapshot
    setInterval(requestFull, 60_000)
  })

  client.on('message', (_topic, buf) => {
    let msg
    try {
      msg = JSON.parse(buf.toString())
    } catch {
      return
    }
    const p = msg.print
    if (!p) return
    const patch = { online: true }
    if (p.gcode_state !== undefined) patch.state = normalizeState(p.gcode_state)
    if (p.mc_percent !== undefined) patch.percent = Number(p.mc_percent)
    if (p.subtask_name || p.gcode_file) patch.job = p.subtask_name || p.gcode_file
    if (p.nozzle_temper !== undefined) patch.nozzle = Math.round(Number(p.nozzle_temper))
    if (p.bed_temper !== undefined) patch.bed = Math.round(Number(p.bed_temper))
    // NOTE: Bambu's mc_remaining_time unit varies by model (seconds vs minutes);
    // community tooling treats it as minutes. Verify against your hardware.
    if (p.mc_remaining_time !== undefined) patch.remainingMin = Number(p.mc_remaining_time)
    setSnapshot(printer, patch)
  })

  client.on('error', (err) => console.error(`[${printer.name || serial}] mqtt error: ${err.message}`))
  client.on('offline', () => setSnapshot(printer, { online: false }))
  client.on('close', () => setSnapshot(printer, { online: false }))
}

// ── Demo printers: simulated, no deps ────────────────────────────────────────

function startDemo() {
  const demo = [
    { id: 'DEMO-X1C-001', name: 'Printer A — "Betsy"', model: 'Bambu Lab X1 Carbon' },
    { id: 'DEMO-P1S-002', name: 'Printer B — "Clunky"', model: 'Bambu Lab P1S' },
    { id: 'DEMO-A1M-003', name: 'Printer C — "Newbie"', model: 'Bambu Lab A1 mini' },
  ]
  const jobs = ['mystery_egg.3mf', 'dragon_ember.gcode', 'axolotl_pink.3mf', 'hex_stand.3mf']
  const phase = new Map(demo.map((d, i) => [d.id, i * 30])) // stagger the cycles

  demo.forEach((d) => setSnapshot(d, { online: true, state: 'idle', percent: 0 }))

  // Advance a simple print/idle cycle every 3s so the UI has something to show.
  setInterval(() => {
    for (const d of demo) {
      let t = (phase.get(d.id) + 3) % 120
      phase.set(d.id, t)
      if (t < 90) {
        const percent = Math.min(100, Math.round((t / 90) * 100))
        setSnapshot(d, {
          online: true,
          state: 'printing',
          percent,
          job: jobs[Math.abs(Math.floor(t / 30)) % jobs.length],
          nozzle: 210,
          bed: 60,
          remainingMin: Math.max(0, Math.round(((90 - t) / 90) * 45)),
        })
      } else {
        setSnapshot(d, { online: true, state: 'idle', percent: 0, job: null, nozzle: 32, bed: 28, remainingMin: 0 })
      }
    }
  }, 3000)

  console.log(`Demo mode: simulating ${demo.length} printers (${demo.map((d) => d.id).join(', ')})`)
}

// ── HTTP server ──────────────────────────────────────────────────────────────

function startServer(port) {
  const server = http.createServer((req, res) => {
    // Allow the TinyBiz SPA (any origin) to read status.
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    const url = (req.url || '/').split('?')[0]
    if (url === '/status') {
      const printers = [...snapshots.values()].sort((a, b) => a.name.localeCompare(b.name))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, updatedAt: new Date().toISOString(), printers }))
    }
    if (url === '/' || url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: true, service: 'tinybiz-printer-bridge', printers: snapshots.size }))
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
  })
  server.listen(port, () => {
    console.log(`TinyBiz printer bridge listening on http://0.0.0.0:${port}`)
    console.log(`  → status:  http://localhost:${port}/status`)
    console.log('  Point Settings → Printer sync at this URL in TinyBiz.')
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const config = loadConfig()
  if (DEMO) {
    startDemo()
  } else if (config.printers.length === 0) {
    console.error('No printers configured. Copy config.example.json to config.json and fill it in, or run with --demo.')
    process.exit(1)
  } else {
    console.log(`Connecting to ${config.printers.length} printer(s)…`)
    config.printers.forEach(connectPrinter)
  }
  startServer(config.port)
}

main()
