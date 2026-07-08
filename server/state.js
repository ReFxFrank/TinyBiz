// Authenticated state sync. The client hydrates with GET /state, then streams
// item-level ops (upsert/delete per collection, plus settings blobs) as the
// user works. `rev` lets the client poll cheaply for server-side changes.
//
// Staff accounts see a FILTERED world: /state only returns the collections
// their section permissions cover, and /ops silently skips writes outside
// their writable set (the client's sync engine drops those first anyway).

import { Router } from 'express'
import { COLLECTIONS, db, getCollection, getMeta, currentRev, bumpRev, upsertItem, deleteItem, setMeta, importState } from './db.js'
import { requireAuth, requireOwner } from './auth.js'
import { computeAccess } from './perms.js'

export const stateRouter = Router()
stateRouter.use(requireAuth)

function visibleState(user) {
  const access = computeAccess(user)
  const state = {}
  for (const name of COLLECTIONS) {
    if (access.all || access.readable.has(name)) state[name] = getCollection(name)
  }
  state.settings = getMeta('settings') // business identity is needed everywhere
  if (access.all || access.readable.has('newsletters')) {
    state.newsletterSettings = getMeta('newsletterSettings')
  }
  return state
}

stateRouter.get('/state', (req, res) => {
  const since = Number(req.query.since)
  const rev = currentRev()
  if (Number.isFinite(since) && since === rev) return res.json({ rev, unchanged: true })
  res.json({ rev, state: visibleState(req.user) })
})

const applyOps = db.transaction((ops, access) => {
  let skipped = 0
  const allowed = (collection, meta) => {
    if (access.all) return true
    if (meta === 'settings') return access.canWriteSettings
    if (meta === 'newsletterSettings') return access.canWriteNewsletterSettings
    return access.writable.has(collection)
  }
  for (const op of ops) {
    if (op.op === 'upsert' && COLLECTIONS.includes(op.collection) && op.item && op.item.id != null) {
      if (!allowed(op.collection)) { skipped++; continue }
      upsertItem(op.collection, op.item)
    } else if (op.op === 'delete' && COLLECTIONS.includes(op.collection) && op.id != null) {
      if (!allowed(op.collection)) { skipped++; continue }
      deleteItem(op.collection, op.id)
    } else if (op.op === 'settings' && op.data && typeof op.data === 'object') {
      if (!allowed(null, 'settings')) { skipped++; continue }
      setMeta('settings', op.data)
    } else if (op.op === 'newsletterSettings' && op.data && typeof op.data === 'object') {
      if (!allowed(null, 'newsletterSettings')) { skipped++; continue }
      setMeta('newsletterSettings', op.data)
    } else {
      throw Object.assign(new Error('bad op'), { status: 400, error: 'bad_op' })
    }
  }
  return { rev: bumpRev(), skipped }
})

stateRouter.post('/ops', (req, res) => {
  const ops = req.body?.ops
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 2000) {
    return res.status(400).json({ error: 'bad_ops' })
  }
  const { rev, skipped } = applyOps(ops, computeAccess(req.user))
  res.json({ rev, ...(skipped ? { skipped } : {}) })
})

stateRouter.post('/import', requireOwner, (req, res) => {
  const state = req.body?.state
  if (!state || typeof state !== 'object') return res.status(400).json({ error: 'bad_state' })
  const rev = importState(state)
  res.json({ rev })
})
