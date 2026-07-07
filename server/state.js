// Authenticated state sync. The client hydrates with GET /state, then streams
// item-level ops (upsert/delete per collection, plus settings blobs) as the
// owner works. `rev` lets the client poll cheaply for server-side changes —
// storefront orders, subscribers, Stripe webhooks.

import { Router } from 'express'
import { COLLECTIONS, db, fullState, currentRev, bumpRev, upsertItem, deleteItem, setMeta, importState } from './db.js'
import { requireAuth } from './auth.js'

export const stateRouter = Router()
stateRouter.use(requireAuth)

stateRouter.get('/state', (req, res) => {
  const since = Number(req.query.since)
  const rev = currentRev()
  if (Number.isFinite(since) && since === rev) return res.json({ rev, unchanged: true })
  res.json({ rev, state: fullState() })
})

const applyOps = db.transaction((ops) => {
  for (const op of ops) {
    if (op.op === 'upsert' && COLLECTIONS.includes(op.collection) && op.item && op.item.id != null) {
      upsertItem(op.collection, op.item)
    } else if (op.op === 'delete' && COLLECTIONS.includes(op.collection) && op.id != null) {
      deleteItem(op.collection, op.id)
    } else if (op.op === 'settings' && op.data && typeof op.data === 'object') {
      setMeta('settings', op.data)
    } else if (op.op === 'newsletterSettings' && op.data && typeof op.data === 'object') {
      setMeta('newsletterSettings', op.data)
    } else {
      throw Object.assign(new Error('bad op'), { status: 400, error: 'bad_op' })
    }
  }
  return bumpRev()
})

stateRouter.post('/ops', (req, res) => {
  const ops = req.body?.ops
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > 2000) {
    return res.status(400).json({ error: 'bad_ops' })
  }
  const rev = applyOps(ops)
  res.json({ rev })
})

stateRouter.post('/import', (req, res) => {
  const state = req.body?.state
  if (!state || typeof state !== 'object') return res.status(400).json({ error: 'bad_state' })
  const rev = importState(state)
  res.json({ rev })
})
