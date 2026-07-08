// SQLite-safe backups. Run directly (cron does, nightly):
//   TINYBIZ_DB=/var/lib/tinybiz/tinybiz.db node backup.js
// creates <db dir>/backups/tinybiz-YYYY-MM-DD-HHmm.db.gz and keeps the
// newest 14. Also exported for the owner's "Download backup" button.

import Database from 'better-sqlite3'
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_PATH = process.env.TINYBIZ_DB
  ? resolve(process.env.TINYBIZ_DB)
  : resolve(dirname(fileURLToPath(import.meta.url)), 'tinybiz.db')

export const BACKUPS_DIR = process.env.TINYBIZ_BACKUPS
  ? resolve(process.env.TINYBIZ_BACKUPS)
  : join(dirname(DB_PATH), 'backups')

const KEEP = 14

/** Consistent snapshot via SQLite's online backup API, then gzip. */
export async function createBackup() {
  mkdirSync(BACKUPS_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  const raw = join(BACKUPS_DIR, `tinybiz-${stamp}.db`)
  const gz = `${raw}.gz`

  const db = new Database(DB_PATH, { readonly: true })
  try {
    await db.backup(raw)
  } finally {
    db.close()
  }
  await pipeline(createReadStream(raw), createGzip({ level: 6 }), createWriteStream(gz))
  unlinkSync(raw)
  prune()
  return gz
}

function prune() {
  const files = readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('tinybiz-') && f.endsWith('.db.gz'))
    .map((f) => ({ f, t: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(KEEP)) unlinkSync(join(BACKUPS_DIR, f))
}

// CLI mode (cron)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createBackup()
    .then((file) => console.log(`[tinybiz-backup] ${new Date().toISOString()} → ${file}`))
    .catch((err) => {
      console.error(`[tinybiz-backup] FAILED: ${err.message}`)
      process.exit(1)
    })
}
