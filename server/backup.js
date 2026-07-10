// SQLite-safe backups. Run directly (cron does, nightly):
//   TINYMAGIC_DB=/var/lib/tinymagic/tinymagic.db node backup.js
// creates <db dir>/backups/tinymagic-YYYY-MM-DD-HHmm.db.gz (keeps 14) plus a
// tinymagic-files-*.tar.gz of uploads + mail tracking (keeps 7). Set
// BACKUP_PUSH_CMD to ship both off-box — a same-disk backup doesn't survive
// the disk. Also exported for the owner's "Download backup" button.

import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_ENV = process.env.TINYMAGIC_DB || process.env.TINYBIZ_DB
const DB_PATH = DB_ENV ? resolve(DB_ENV) : resolve(dirname(fileURLToPath(import.meta.url)), 'tinymagic.db')

const BACKUPS_ENV = process.env.TINYMAGIC_BACKUPS || process.env.TINYBIZ_BACKUPS
export const BACKUPS_DIR = BACKUPS_ENV
  ? resolve(BACKUPS_ENV)
  : join(dirname(DB_PATH), 'backups')

const KEEP = 14

/** Consistent snapshot via SQLite's online backup API, then gzip. */
export async function createBackup() {
  mkdirSync(BACKUPS_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  const raw = join(BACKUPS_DIR, `tinymagic-${stamp}.db`)
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
    .filter((f) => (f.startsWith('tinymagic-') || f.startsWith('tinybiz-')) && f.endsWith('.db.gz'))
    .map((f) => ({ f, t: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(KEEP)) unlinkSync(join(BACKUPS_DIR, f))
}

const KEEP_FILES = 7

/** Product photos, documents, and mail tracking — everything a DB restore
 *  alone would leave broken. Skipped quietly when there's nothing to pack. */
export function createFilesBackup() {
  mkdirSync(BACKUPS_DIR, { recursive: true })
  const dataDir = dirname(DB_PATH)
  const entries = ['uploads', 'mail-tracking.json'].filter((e) => existsSync(join(dataDir, e)))
  if (entries.length === 0) return null
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  const out = join(BACKUPS_DIR, `tinymagic-files-${stamp}.tar.gz`)
  execFileSync('tar', ['-czf', out, '-C', dataDir, ...entries])
  const files = readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('tinymagic-files-') && f.endsWith('.tar.gz'))
    .map((f) => ({ f, t: statSync(join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(KEEP_FILES)) unlinkSync(join(BACKUPS_DIR, f))
  return out
}

/** Optional off-site push: BACKUP_PUSH_CMD runs with the snapshot paths in env */
function pushOffsite(dbFile, filesFile) {
  const cmd = process.env.BACKUP_PUSH_CMD
  if (!cmd) return
  execFileSync('sh', ['-c', cmd], {
    env: { ...process.env, BACKUP_DB_FILE: dbFile || '', BACKUP_FILES_FILE: filesFile || '' },
    stdio: 'inherit',
    timeout: 10 * 60_000,
  })
}

// CLI mode (cron)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createBackup()
    .then((file) => {
      console.log(`[tinymagic-backup] ${new Date().toISOString()} → ${file}`)
      const filesArchive = createFilesBackup()
      if (filesArchive) console.log(`[tinymagic-backup] files → ${filesArchive}`)
      pushOffsite(file, filesArchive)
    })
    .catch((err) => {
      console.error(`[tinymagic-backup] FAILED: ${err.message}`)
      process.exit(1)
    })
}
