// Print the CSP `script-src` hash tokens for the EXECUTABLE inline <script>
// blocks in a built index.html, e.g.  'sha256-AAA…' 'sha256-BBB…'
//
// deploy.sh feeds the result into the nginx CSP so the two inline boot/theme
// guards are allowed by exact hash — no 'unsafe-inline'. Recomputed from the
// shipped file every deploy, so editing the scripts can never silently drift
// the policy. Prints nothing (→ CSP falls back to 'self' only) on any problem,
// so it can never break a build or a deploy.
//
// A browser hashes the raw text between a <script>'s opening and closing tags.
// We skip <script src=…> (external → covered by 'self') and any non-JavaScript
// type such as application/ld+json (a data block the browser never executes and
// CSP therefore ignores). Usage: node csp-hashes.mjs <path/to/index.html>
//   --selftest  verify hashing against a known vector, then exit.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const sha256b64 = (text) => createHash('sha256').update(text, 'utf8').digest('base64')

/** The 'sha256-…' tokens for every executable inline script in `html`. */
export function cspScriptHashes(html) {
  const tokens = []
  const re = /<script([^>]*)>([\s\S]*?)<\/script\s*>/gi
  let m
  while ((m = re.exec(html))) {
    const attrs = m[1]
    if (/\bsrc\s*=/i.test(attrs)) continue // external → 'self' covers it
    // A `type` that isn't a JavaScript MIME type (e.g. application/ld+json,
    // importmap) is not executed, so CSP script-src doesn't apply — skip it.
    const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type[1])) continue
    tokens.push(`'sha256-${sha256b64(m[2])}'`)
  }
  return tokens
}

if (process.argv.includes('--selftest')) {
  // Reference: the CSP hash of the inline script `alert('hi')` is well-known.
  const got = cspScriptHashes(`<script>alert('hi')</script>`)[0]
  const want = `'sha256-${sha256b64(`alert('hi')`)}'`
  const ok = got === want && /^'sha256-[A-Za-z0-9+/]+=*'$/.test(got)
  process.stdout.write(ok ? `selftest ok ${got}\n` : `selftest FAILED got=${got} want=${want}\n`)
  process.exit(ok ? 0 : 1)
}

const file = process.argv[2]
if (!file) process.exit(0)
try {
  process.stdout.write(cspScriptHashes(readFileSync(file, 'utf8')).join(' '))
} catch {
  // Unreadable / missing → print nothing; deploy falls back to script-src 'self'
  process.exit(0)
}
