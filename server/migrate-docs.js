// One-time data migration for F-INJ-6. Business documents uploaded as images
// BEFORE the fix were stored under a public img_ name (served with no auth).
// Rename each document still pointing at /uploads/img_* to a private, auth-gated
// doc_ name and rewrite its stored URL. Runs at startup; idempotent — a second
// run finds nothing. Never throws into boot.
//
// Only files REFERENCED BY THE documents COLLECTION are touched — product photos
// and newsletter images (also img_) are never renamed. Upload suffixes are
// unique, so a document's file is never shared with anything else.
//
// Caveat: copies already fetched through Cloudflare/browsers may stay cached at
// the old img_ URL until they expire (img_ was cached immutable). Purge the CDN
// cache after this runs to be thorough.

import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { getCollection, upsertItem, bumpRev } from './db.js'
import { UPLOADS_DIR } from './uploads.js'

export function migrateImageDocuments() {
  let migrated = 0
  let manual = 0
  try {
    for (const doc of getCollection('documents')) {
      const m = /^\/uploads\/(img_[A-Za-z0-9._-]+)$/.exec(String(doc?.url || ''))
      if (!m) continue
      const oldName = m[1]
      const newName = `doc_${oldName.slice(4)}`
      const oldPath = join(UPLOADS_DIR, oldName)
      const newPath = join(UPLOADS_DIR, newName)
      try {
        if (existsSync(oldPath) && existsSync(newPath)) {
          // Can't happen with unique suffixes; never clobber — flag for a human.
          console.warn(`[tinymagic-api] doc migration: both ${oldName} and ${newName} exist; skipping ${doc.id}`)
          manual++
          continue
        }
        if (existsSync(oldPath)) renameSync(oldPath, newPath)
        // Rewrite the reference only once the private file actually exists (skips
        // metadata-only entries whose file was never uploaded or already gone).
        if (existsSync(newPath)) {
          upsertItem('documents', { ...doc, url: `/uploads/${newName}` })
          migrated++
        }
      } catch (err) {
        console.warn(`[tinymagic-api] doc migration failed for ${doc.id}: ${err.message}`)
      }
    }
    if (migrated) {
      bumpRev()
      console.log(`[tinymagic-api] F-INJ-6: privatized ${migrated} image-typed document${migrated === 1 ? '' : 's'} (img_ → doc_).`)
    }
    if (manual) console.warn(`[tinymagic-api] F-INJ-6: ${manual} document(s) need manual review.`)
  } catch (err) {
    console.warn(`[tinymagic-api] doc migration skipped: ${err.message}`)
  }
}
