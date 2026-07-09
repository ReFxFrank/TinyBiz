// Product photo uploads. The client resizes images before sending, so the
// server just validates, names, and stores raw bytes — no image libraries.
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
}
const MAX_BYTES = 8 * 1024 * 1024

/** Static handler for the stored files — hashed names, cache hard */
export const uploadsStatic = express.static(UPLOADS_DIR, {
  immutable: true,
  maxAge: '365d',
  fallthrough: false,
})

export const uploadsRouter = Router()
uploadsRouter.use(requireAuth)

// Anyone who can edit products can add photos
uploadsRouter.use((req, res, next) => {
  const access = computeAccess(req.user)
  if (access.all || access.writable.has('products')) return next()
  res.status(403).json({ error: 'forbidden' })
})

uploadsRouter.post('/', express.raw({ type: 'image/*', limit: MAX_BYTES }), (req, res) => {
  const ext = TYPES[req.headers['content-type']]
  if (!ext) return res.status(415).json({ error: 'bad_type', message: 'Upload a JPEG, PNG, WebP, or GIF image.' })
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'empty', message: 'The upload was empty.' })
  }
  const name = `img_${Date.now().toString(36)}${crypto.randomBytes(5).toString('hex')}.${ext}`
  writeFileSync(join(UPLOADS_DIR, name), req.body)
  res.json({ url: `/uploads/${name}` })
})
