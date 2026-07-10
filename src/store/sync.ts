// Server sync for the admin. The Zustand store stays the app's brain — every
// page keeps working against it — while this module makes it durable:
//
//   hydrate():   pull the full server state into the store
//   startSync(): watch the store, diff changes item-by-item, stream ops to
//                the server (debounced), and poll for server-side changes
//                (storefront orders, subscribers, Stripe webhooks).
//
// Conflict model: item-level last-write-wins. Fine for a single owner; the
// poll keeps other devices fresh within seconds.

import { create } from 'zustand'
import { useStore } from '@/store/useStore'
import { useAuth, canWriteCollection, canWriteMeta } from '@/store/useAuth'
import { api, type SyncOp } from '@/lib/api'
import type { Settings, NewsletterSettings } from '@/data/types'

const SYNC_COLLECTIONS = [
  'products', 'materials', 'orders', 'customers', 'suppliers', 'expenses',
  'incomes', 'recipes', 'batches', 'machines', 'shipments', 'tasks', 'events',
  'daysOff', 'documents', 'employees', 'campaigns', 'promoCodes',
  'socialAccounts', 'socialPosts', 'subscribers', 'newsletters',
  'adjustments', 'notifications',
] as const

type CollectionName = (typeof SYNC_COLLECTIONS)[number]
type Snapshot = Record<CollectionName, Array<{ id: string }>> & {
  settings: Settings
  newsletterSettings: NewsletterSettings
}

export type SyncPhase = 'idle' | 'saving' | 'saved' | 'offline'
interface SyncStatus {
  phase: SyncPhase
  setPhase: (phase: SyncPhase) => void
}
/** For UI — a subtle saved/offline indicator */
export const useSyncStatus = create<SyncStatus>((set) => ({
  phase: 'idle',
  setPhase: (phase) => set({ phase }),
}))

let applyingRemote = false
let snapshot: Snapshot | null = null
let serverRev = 0
let queue = new Map<string, SyncOp>() // keyed by collection::id so later ops replace earlier ones
let flushTimer: ReturnType<typeof setTimeout> | undefined
let flushing = false
let started = false

function takeSnapshot(): Snapshot {
  const s = useStore.getState() as unknown as Snapshot
  const snap = {} as Snapshot
  for (const name of SYNC_COLLECTIONS) snap[name] = s[name]
  snap.settings = s.settings
  snap.newsletterSettings = s.newsletterSettings
  return snap
}

/**
 * Staff accounts receive a FILTERED state — collections outside their access
 * are absent. Blank those locally so stale seed/cache data never leaks into
 * aggregates, and never overwrite settings blobs with undefined.
 */
function toStorePatch(state: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const name of SYNC_COLLECTIONS) patch[name] = state[name] ?? []
  if (state.settings) patch.settings = state.settings
  if (state.newsletterSettings) patch.newsletterSettings = state.newsletterSettings
  return patch
}

/** Pull the (visible) server state into the local store */
export async function hydrate(): Promise<void> {
  const res = await api.state()
  serverRev = res.rev
  applyingRemote = true
  try {
    useStore.setState(toStorePatch(res.state ?? {}) as never)
  } finally {
    applyingRemote = false
  }
  snapshot = takeSnapshot()
}

function enqueue(op: SyncOp) {
  const user = useAuth.getState().user
  if (op.op === 'upsert' || op.op === 'delete') {
    if (!canWriteCollection(user, op.collection)) return
  } else if (!canWriteMeta(user, op.op)) {
    return
  }
  const key =
    op.op === 'upsert' ? `${op.collection}::${op.item.id}` : op.op === 'delete' ? `${op.collection}::${op.id}` : op.op
  queue.set(key, op)
}

function diffAndQueue() {
  if (!snapshot) return
  const next = takeSnapshot()
  for (const name of SYNC_COLLECTIONS) {
    const before = snapshot[name]
    const after = next[name]
    if (before === after) continue
    const beforeById = new Map(before.map((item) => [item.id, item]))
    const afterIds = new Set<string>()
    for (const item of after) {
      afterIds.add(item.id)
      if (beforeById.get(item.id) !== item) enqueue({ op: 'upsert', collection: name, item: item as never })
    }
    for (const item of before) {
      if (!afterIds.has(item.id)) enqueue({ op: 'delete', collection: name, id: item.id })
    }
  }
  if (snapshot.settings !== next.settings) enqueue({ op: 'settings', data: next.settings })
  if (snapshot.newsletterSettings !== next.newsletterSettings) {
    enqueue({ op: 'newsletterSettings', data: next.newsletterSettings })
  }
  snapshot = next
  if (queue.size > 0) scheduleFlush()
}

function scheduleFlush(delay = 600) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, delay)
}

async function flush() {
  if (flushing || queue.size === 0) return
  flushing = true
  const batch = [...queue.values()]
  queue = new Map()
  useSyncStatus.getState().setPhase('saving')
  try {
    await api.ops(batch)
    // Deliberately do NOT fast-forward serverRev to the post-ops rev: a
    // storefront order (or another device's write) may have landed between
    // our last poll and this flush, and adopting the newer rev would skip it
    // forever. Leaving serverRev behind makes the next poll re-fetch state —
    // our own ops included (idempotent) — so nothing can fall in the gap.
    useSyncStatus.getState().setPhase(queue.size > 0 ? 'saving' : 'saved')
    if (queue.size > 0) scheduleFlush(100)
    else setTimeout(() => void poll(), 250) // pick up anything that landed in between
  } catch {
    // Put the failed batch back (newer queued ops win) and retry with backoff
    const retry = new Map<string, SyncOp>()
    for (const op of batch) {
      const key = op.op === 'upsert' ? `${op.collection}::${op.item.id}` : op.op === 'delete' ? `${op.collection}::${op.id}` : op.op
      retry.set(key, op)
    }
    for (const [key, op] of queue) retry.set(key, op)
    queue = retry
    useSyncStatus.getState().setPhase('offline')
    scheduleFlush(5000)
  } finally {
    flushing = false
  }
}

/** Merge server-side changes (storefront orders, webhooks, other devices) */
async function poll() {
  // Never merge over unsent local edits — they'd re-diff against merged state
  if (queue.size > 0 || flushing || document.visibilityState === 'hidden') return
  try {
    const res = await api.state(serverRev)
    if (res.unchanged || !res.state) return
    serverRev = res.rev
    if (queue.size > 0) return // an edit raced the fetch — skip this merge
    applyingRemote = true
    try {
      useStore.setState(toStorePatch(res.state) as never)
    } finally {
      applyingRemote = false
    }
    snapshot = takeSnapshot()
    if (useSyncStatus.getState().phase === 'offline') useSyncStatus.getState().setPhase('saved')
  } catch {
    /* transient — next poll retries */
  }
}

/** Begin watching the store. Call once, after a successful hydrate(). */
export function startSync(): void {
  if (started) return
  started = true
  useStore.subscribe(() => {
    if (applyingRemote) return
    diffAndQueue()
  })
  setInterval(poll, 15_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void poll()
  })
  window.addEventListener('beforeunload', () => {
    // Best-effort final save — sendBeacon survives the page teardown
    if (queue.size === 0) return
    const body = JSON.stringify({ ops: [...queue.values()] })
    navigator.sendBeacon('/api/ops', new Blob([body], { type: 'application/json' }))
  })
}
