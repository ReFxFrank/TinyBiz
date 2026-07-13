// CSP violation collector. While the Content-Security-Policy ships Report-Only,
// browsers POST any violation here (report-uri) so the owner can see what an
// enforcing policy WOULD block before flipping the switch — otherwise reports
// only land in each visitor's console.
//
// Abuse-resistant: unauthenticated by spec, but rate-limited (index.js),
// body-capped, and bounded. The POST parser MUST be mounted before the app-wide
// 15mb json parser (see index.js) so THIS 16kb cap governs — otherwise an
// application/json body slips past it and a giant array would stall the
// single-threaded event loop. Reports are aggregated in memory (no DB writes),
// bounded to MAX_KEYS distinct kinds (FIFO-evicted, so a flood can't permanently
// blind the tool), logged once per kind, and reset on restart/redeploy.

import express from 'express'

const MAX_KEYS = 200
const MAX_REPORTS_PER_POST = 50 // report-to batches are tiny; cap the loop hard
// Report fields are attacker-controllable: strip control chars (log forging) and
// angle brackets (defensive vs. a future admin view rendering them), then clip.
const clip = (v, n) =>
  String(v ?? '')
    .replace(/[\x00-\x1f\x7f<>]/g, ' ')
    .slice(0, n)
/** key `${directive}|${blockedUri}` → aggregated violation */
const reports = new Map()

function record(r) {
  if (!r || typeof r !== 'object') return
  // report-uri uses hyphenated keys; report-to (Reporting API) uses camelCase.
  const directive = clip(r['violated-directive'] || r.effectiveDirective || r['effective-directive'], 120)
  const blockedUri = clip(r['blocked-uri'] || r.blockedURL, 200)
  const documentUri = clip(r['document-uri'] || r.documentURL, 200)
  const sample = clip(r['script-sample'] || r.sample, 120)
  if (!directive && !blockedUri) return
  const key = `${directive}|${blockedUri}`
  const now = new Date().toISOString()
  const existing = reports.get(key)
  if (existing) {
    existing.count++
    existing.lastAt = now
    return
  }
  // FIFO-evict the oldest kind at the cap so new genuine violations still land.
  if (reports.size >= MAX_KEYS) reports.delete(reports.keys().next().value)
  reports.set(key, { directive, blockedUri, documentUri, sample, count: 1, firstAt: now, lastAt: now })
  // Log only the FIRST of each distinct violation so journald can't be flooded.
  console.warn(`[csp-report] ${directive} blocked "${blockedUri || '(inline)'}" on ${documentUri}${sample ? ` — ${sample}` : ''}`)
}

// 16kb JSON parser for the CSP report content types. Mount BEFORE the app-wide
// json parser so this cap — not the 15mb one — governs every content type here.
export const cspReportParser = express.json({
  type: ['application/csp-report', 'application/reports+json', 'application/json'],
  limit: '16kb',
})

// Public POST sink. Acks immediately and does strictly bounded work (≤16kb body,
// ≤MAX_REPORTS_PER_POST records) so it can never block the event loop.
export function cspReportHandler(req, res) {
  res.status(204).end() // ack immediately; a report must never block a page
  try {
    const b = req.body
    if (Array.isArray(b)) for (const item of b.slice(0, MAX_REPORTS_PER_POST)) record(item?.body || item)
    else record(b?.['csp-report'] || b)
  } catch {
    /* a violation report must never throw */
  }
}

// Owner-only viewer: what would an enforcing CSP have blocked? Most-frequent first.
export function cspReportView(_req, res) {
  res.json({
    note: 'In-memory since the last API restart; resets on each deploy.',
    reports: [...reports.values()].sort((a, b) => b.count - a.count),
  })
}
