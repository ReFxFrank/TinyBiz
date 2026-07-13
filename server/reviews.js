// Product reviews. Every review is a VERIFIED purchase: the writer proves it
// with the order email (their shopper session, or order number + email — the
// same bar as the Track page), so the shop never shows drive-by ratings.
// Reviews land as 'pending' and only show on the storefront once the owner
// publishes them from /admin/reviews. Like tickets, the collection syncs to
// the admin read-only — every write goes through the endpoints below.

import { Router } from 'express'
import { uid, getCollection, getItem, upsertItem, deleteItem, bumpRev } from './db.js'
import { requireAuth } from './auth.js'
import { shopperSession } from './shop-accounts.js'
import { rateLimit } from './ratelimit.js'
import { sendReviewAlert } from './email.js'
import { discordReviewAlert } from './discord.js'
import { siteOrigin } from './origin.js'

export const REVIEW_STATUSES = ['pending', 'published', 'rejected']

const MAX_TITLE = 80
const MAX_BODY = 2000
const MAX_NAME = 80

const clean = (v, max) => String(v ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isDead = (s) => s === 'Cancelled' || s === 'Returned'

/** What the storefront sees — the writer's email stays private */
export function publicReview(r) {
  return {
    id: r.id,
    productId: r.productId,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    verified: Boolean(r.verified),
    createdAt: r.createdAt,
    ...(r.reply ? { reply: { body: r.reply.body, at: r.reply.at } } : {}),
  }
}

/** productId → { avg, count } over PUBLISHED reviews — powers stars everywhere */
export function ratingSummaries() {
  const sums = new Map()
  for (const r of getCollection('reviews')) {
    if (r.status !== 'published') continue
    const s = sums.get(r.productId) || { total: 0, count: 0 }
    s.total += r.rating
    s.count += 1
    sums.set(r.productId, s)
  }
  const out = {}
  for (const [id, s] of sums) out[id] = { avg: Math.round((s.total / s.count) * 10) / 10, count: s.count }
  return out
}

/**
 * The purchase behind a review. Returns the matching order, or null.
 * - Signed-in shoppers: any live order on their account (email or claimed).
 * - Guests: the exact order number + the email it was placed with.
 */
function findPurchase({ productId, sess, email, orderNumber }) {
  const orders = getCollection('orders')
  const containsProduct = (o) => !isDead(o.status) && (o.items || []).some((it) => it.productId === productId)
  if (sess) {
    const myEmail = sess.row.email
    return (
      orders.find(
        (o) =>
          containsProduct(o) &&
          (String(o.email || '').trim().toLowerCase() === myEmail || o.claimedByAccountId === sess.row.id),
      ) || null
    )
  }
  const rawNumber = String(orderNumber || '').trim().toUpperCase()
  if (!rawNumber || !email) return null
  return (
    orders.find(
      (o) =>
        String(o.number || '').toUpperCase() === rawNumber &&
        String(o.email || '').trim().toLowerCase() === email &&
        containsProduct(o),
    ) || null
  )
}

const requestOrigin = (req) => siteOrigin(req)

// ── Public router (mounted at /api/store/reviews) ────────────────────────────

export const reviewsPublicRouter = Router()

/** Published reviews for one product, newest first, plus the star summary */
reviewsPublicRouter.get('/:productId', (req, res) => {
  const reviews = getCollection('reviews')
    .filter((r) => r.productId === req.params.productId && r.status === 'published')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(publicReview)
  const count = reviews.length
  const avg = count ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : 0
  res.json({ reviews, summary: { avg, count } })
})

/** Leave a review — purchase proof required, lands in the moderation queue */
reviewsPublicRouter.post(
  '/',
  rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'review-create' }),
  (req, res) => {
    const productId = String(req.body?.productId || '')
    const product = getCollection('products').find((p) => p.id === productId)
    if (!product) return res.status(404).json({ error: 'not_found', message: 'That product doesn’t exist.' })

    const rating = Number(req.body?.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'bad_rating', message: 'Pick a star rating from 1 to 5.' })
    }
    const body = clean(req.body?.body, MAX_BODY)
    if (!body) return res.status(400).json({ error: 'bad_body', message: 'Write a few words about the piece.' })
    const title = clean(req.body?.title, MAX_TITLE)

    const sess = shopperSession(req)
    const email = sess ? sess.row.email : clean(req.body?.email, 200).toLowerCase()
    const name = sess ? sess.row.name || clean(req.body?.name, MAX_NAME) : clean(req.body?.name, MAX_NAME)
    if (!name) return res.status(400).json({ error: 'bad_name', message: 'Please enter your name.' })
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'bad_email', message: 'That doesn’t look like an email address.' })
    }

    const order = findPurchase({ productId, sess, email, orderNumber: req.body?.orderNumber })
    if (!order) {
      return res.status(403).json({
        error: 'no_purchase',
        message: sess
          ? 'We couldn’t find an order for this piece on your account — reviews are for verified purchases.'
          : 'We couldn’t match that order number and email to this piece — reviews are for verified purchases.',
      })
    }

    // One live review per person per product (a rejected one may be rewritten)
    const existing = getCollection('reviews').find(
      (r) => r.productId === productId && r.email === email && r.status !== 'rejected',
    )
    if (existing) {
      return res.status(409).json({
        error: 'already_reviewed',
        message: existing.status === 'pending'
          ? 'You already sent a review for this piece — it’s waiting for a quick check before it goes live.'
          : 'You already reviewed this piece — thank you!',
      })
    }

    const now = new Date().toISOString()
    const review = {
      id: uid('rev'),
      productId,
      productName: product.name,
      orderId: order.id,
      orderNumber: order.number,
      verified: true,
      ...(sess ? { accountId: sess.row.id } : {}),
      authorName: name,
      email,
      rating,
      ...(title ? { title } : {}),
      body,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    upsertItem('reviews', review)
    upsertItem('notifications', {
      id: uid('ntf'),
      type: 'message',
      title: `New ${rating}★ review of ${product.name}`,
      body: `${name} — “${(title || body).slice(0, 80)}”`,
      createdAt: now,
      read: false,
      link: '/admin/reviews',
    })
    bumpRev()
    void sendReviewAlert({ review, origin: requestOrigin(req) })
    void discordReviewAlert(review)
    res.json({ ok: true, review: publicReview(review), pending: true })
  },
)

// ── Admin router (mounted at /api/reviews) ───────────────────────────────────

function requireReviews(req, res, next) {
  if (req.user.role === 'owner' || (req.user.perms || []).includes('reviews')) return next()
  res.status(403).json({ error: 'forbidden', message: 'You don’t have access to Reviews.' })
}

export const reviewsAdminRouter = Router()
reviewsAdminRouter.use(requireAuth, requireReviews)

/** Publish / reject / back to pending. Publishing stamps publishedAt. */
reviewsAdminRouter.post('/:id/status', (req, res) => {
  const review = getItem('reviews', req.params.id)
  if (!review) return res.status(404).json({ error: 'not_found' })
  const status = String(req.body?.status || '')
  if (!REVIEW_STATUSES.includes(status)) return res.status(400).json({ error: 'bad_status' })
  if (status === review.status) return res.json({ ok: true, review })

  const now = new Date().toISOString()
  const next = { ...review, status, updatedAt: now }
  if (status === 'published') next.publishedAt = now
  else delete next.publishedAt
  upsertItem('reviews', next)
  bumpRev()
  res.json({ ok: true, review: next })
})

/** The shop's public answer under a review — empty body removes it */
reviewsAdminRouter.post('/:id/reply', (req, res) => {
  const review = getItem('reviews', req.params.id)
  if (!review) return res.status(404).json({ error: 'not_found' })
  const body = clean(req.body?.body, MAX_BODY)
  const now = new Date().toISOString()
  const next = { ...review, updatedAt: now }
  if (body) next.reply = { body, at: now, authorName: req.user.name || 'The studio' }
  else delete next.reply
  upsertItem('reviews', next)
  bumpRev()
  res.json({ ok: true, review: next })
})

reviewsAdminRouter.delete('/:id', (req, res) => {
  const review = getItem('reviews', req.params.id)
  if (!review) return res.status(404).json({ error: 'not_found' })
  deleteItem('reviews', req.params.id)
  bumpRev()
  res.json({ ok: true })
})
