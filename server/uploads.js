// File uploads: product/newsletter photos and business documents. The client
// resizes images before sending, so the server just validates, names, and
// stores raw bytes — no image libraries.
// Files land in TINYMAGIC_UPLOADS (defaults next to the DB) and are served at
// /uploads/<name> by Express (dev) or nginx→Express (production).

import { Router } from 'express'
import express from 'express'
import crypto from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireAuth } from './auth.js'
import { computeAccess } from './perms.js'

const UPLOADS_ENV = process.env.TINYMAGIC_UPLOADS || process.env.TINYBIZ_UPLOADS
const DB_ENV = process.env.TINYMAGIC_DB || process.env.TINYBIZ_DB
export const UPLOADS_DIR = UPLOADS_ENV
  ? resolve(UPLOADS_ENV)
  : DB_ENV
    ? join(dirname(resolve(DB_ENV)), 'uploads')
    : resolve(dirname(fileURLToPath(import.meta.url)), 'uploads')
mkdirSync(UPLOADS_DIR, { recursive: true })

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'csv', // Windows often labels .csv this way
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}
const MAX_BYTES = 10 * 1024 * 1024

/** Static handler for the stored files — hashed names, cache hard.
 *  Images (img_*) are public; business documents (doc_*) hold tax paperwork
 *  and supplier files, so they require a signed-in admin and never cache. */
const serveFiles = express.static(UPLOADS_DIR, {
  immutable: true,
  maxAge: '365d',
  fallthrough: false,
  setHeaders: (res, filePath) => {
    if (/[/\\]doc_[^/\\]*$/.test(filePath)) res.setHeader('Cache-Control', 'private, no-store')
  },
})
export const uploadsStatic = Router()
uploadsStatic.use((req, res, next) => {
  // Business documents (tax/supplier files) require the 'documents' section,
  // not merely any logged-in session — otherwise a leaked/guessed doc URL is
  // served to any staff account regardless of their permissions (F-INJ-2).
  if (/^\/doc_/.test(req.path)) {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' })
    const access = computeAccess(req.user)
    if (!access.all && !access.readable.has('documents')) {
      return res.status(403).json({ error: 'forbidden' })
    }
  }
  next()
})
uploadsStatic.use(serveFiles)

export const uploadsRouter = Router()
uploadsRouter.use(requireAuth)

// Anyone who can edit products (photos), newsletters (email images), or
// documents (business files) can upload
uploadsRouter.use((req, res, next) => {
  const access = computeAccess(req.user)
  if (
    access.all ||
    access.writable.has('products') ||
    access.writable.has('newsletters') ||
    access.writable.has('documents')
  )
    return next()
  res.status(403).json({ error: 'forbidden' })
})

uploadsRouter.post('/', express.raw({ type: () => true, limit: MAX_BYTES }), (req, res) => {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim()
  const ext = TYPES[contentType]
  if (!ext) {
    return res.status(415).json({ error: 'bad_type', message: 'Upload an image, PDF, CSV, TXT, DOCX, or XLSX file.' })
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'empty', message: 'The upload was empty.' })
  }
  const prefix = contentType.startsWith('image/') ? 'img' : 'doc'
  const name = `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}.${ext}`
  writeFileSync(join(UPLOADS_DIR, name), req.body)
  res.json({ url: `/uploads/${name}` })
})
