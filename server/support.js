// Customer support tickets. Customers open requests from the storefront
// (signed in or as guests), staff answer from /admin/support. Tickets live in
// the 'tickets' collection so the admin reads them through the normal sync
// engine, but every WRITE goes through the endpoints below — replies and
// status changes carry auto-update logic (status flips, timestamps, reopen on
// customer reply, emails both ways) that raw sync ops would silently skip.

import { Router } from 'express'
import { uid, getCollection, getItem, upsertItem, bumpRev } from './db.js'
import { requireAuth } from './auth.js'
import { shopperSession } from './shop-accounts.js'
import { rateLimit } from './ratelimit.js'
import {
  sendSupportReceived,
  sendSupportStaffReply,
  sendSupportResolved,
  sendSupportOwnerAlert,
} from './email.js'
import { discordSupportAlert } from './discord.js'

export const TICKET_STATUSES = ['open', 'awaiting_customer', 'resolved']

const MAX_SUBJECT = 150
const MAX_MESSAGE = 5000
const MAX_TAGS = 10
const MAX_TAG_LEN = 24

const clean = (v, max) => String(v ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** SUP-1001, SUP-1002… — its own sequence, independent of order numbers */
export function nextTicketNumber(tickets) {
  let max = 1000
  for (const t of tickets) {
    const n = parseInt(String(t.number || '').replace(/\D/g, ''), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `SUP-${max + 1}`
}

/** What the storefront sees — staff tags and internal ids stay private */
export function publicTicket(t) {
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    status: t.status,
    orderNumber: t.orderNumber,
    messages: t.messages,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    lastReplyBy: t.lastReplyBy,
    resolvedAt: t.resolvedAt,
  }
}

function bellNotify(title, body) {
  upsertItem('notifications', {
    id: uid('ntf'),
    type: 'message',
    title,
    body,
    createdAt: new Date().toISOString(),
    read: false,
    link: '/admin/support',
  })
}

/**
 * Append a customer message with every auto-update that implies: the ticket
 * (re)opens for staff, the reply clock flips to the customer's side, and a
 * resolved ticket loses its resolved stamp.
 */
function applyCustomerMessage(ticket, body) {
  const now = new Date().toISOString()
  const msg = { id: uid('msg'), from: 'customer', authorName: ticket.customerName, body, at: now }
  const next = {
    ...ticket,
    status: 'open',
    messages: [...ticket.messages, msg],
    updatedAt: now,
    lastReplyBy: 'customer',
    lastCustomerAt: now,
  }
  delete next.resolvedAt
  return next
}

/** Append a staff message: ball moves to the customer's court */
function applyStaffMessage(ticket, body, authorName) {
  const now = new Date().toISOString()
  const msg = { id: uid('msg'), from: 'staff', authorName, body, at: now }
  const next = {
    ...ticket,
    status: 'awaiting_customer',
    messages: [...ticket.messages, msg],
    updatedAt: now,
    lastReplyBy: 'staff',
    lastStaffAt: now,
    firstResponseAt: ticket.firstResponseAt || now,
  }
  delete next.resolvedAt
  return next
}

const requestOrigin = (req) => req.headers.origin || `${req.protocol}://${req.get('host')}`

// ── Public router (storefront, mounted at /api/store/support) ────────────────

export const supportPublicRouter = Router()

/**
 * Open a request. Signed-in shoppers get their identity from the session;
 * guests supply name + email. An order number is only attached when it
 * actually belongs to that email (same proof as the Track page).
 */
supportPublicRouter.post(
  '/tickets',
  rateLimit({ windowMs: 10 * 60_000, max: 10, name: 'support-create' }),
  (req, res) => {
    const sess = shopperSession(req)
    const subject = clean(req.body?.subject, MAX_SUBJECT)
    const message = clean(req.body?.message, MAX_MESSAGE)
    const name = sess ? sess.row.name || clean(req.body?.name, 120) : clean(req.body?.name, 120)
    const email = sess ? sess.row.email : clean(req.body?.email, 200).toLowerCase()
    if (!subject) return res.status(400).json({ error: 'bad_subject', message: 'Give your request a short subject.' })
    if (!message) return res.status(400).json({ error: 'bad_message', message: 'Tell us what’s going on.' })
    if (!name) return res.status(400).json({ error: 'bad_name', message: 'Please enter your name.' })
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'bad_email', message: 'That doesn’t look like an email address.' })
    }

    // Optional order link — must match the requester's email so ticket
    // creation can't be used to probe other people's order numbers
    let order = null
    const rawNumber = clean(req.body?.orderNumber, 40).toUpperCase()
    if (rawNumber) {
      order = getCollection('orders').find(
        (o) =>
          String(o.number || '').toUpperCase() === rawNumber &&
          (String(o.email || '').trim().toLowerCase() === email ||
            (sess && o.claimedByAccountId === sess.row.id)),
      )
      if (!order) {
        return res.status(404).json({
          error: 'order_not_found',
          message: 'We couldn’t match that order number to your email — double-check both, or leave it blank.',
        })
      }
    }

    const now = new Date().toISOString()
    const tickets = getCollection('tickets')
    const ticket = {
      id: uid('tkt'),
      number: nextTicketNumber(tickets),
      subject,
      status: 'open',
      tags: [],
      customerName: name,
      email,
      ...(sess ? { accountId: sess.row.id } : {}),
      ...(order ? { orderId: order.id, orderNumber: order.number } : {}),
      messages: [{ id: uid('msg'), from: 'customer', authorName: name, body: message, at: now }],
      createdAt: now,
      updatedAt: now,
      lastReplyBy: 'customer',
      lastCustomerAt: now,
    }
    upsertItem('tickets', ticket)
    bellNotify(`New support request ${ticket.number}`, `${name} — ${subject}`)
    bumpRev()

    const origin = requestOrigin(req)
    void sendSupportReceived({ ticket, origin })
    void sendSupportOwnerAlert({ ticket, kind: 'new', origin })
    void discordSupportAlert(ticket, 'new')
    res.json({ ok: true, ticket: publicTicket(ticket) })
  },
)

/** A signed-in shopper's requests — same matching rule as their order history */
supportPublicRouter.get('/tickets', (req, res) => {
  const sess = shopperSession(req)
  const email = sess ? sess.row.email : req.user ? String(req.user.email).toLowerCase() : null
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const accountId = sess?.row.id
  const tickets = getCollection('tickets')
    .filter(
      (t) =>
        String(t.email || '').toLowerCase() === email || (accountId && t.accountId === accountId),
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(publicTicket)
  res.json({ tickets })
})

/** One ticket by its crypto-random id — same access model as /store/order/:id
 *  (the id itself is the credential; it only travels in the customer's email) */
supportPublicRouter.get('/tickets/:id', (req, res) => {
  const ticket = getItem('tickets', req.params.id)
  if (!ticket) return res.status(404).json({ error: 'not_found' })
  res.json({ ticket: publicTicket(ticket) })
})

/** Guests find their request with number + email — mirrors the Track page */
supportPublicRouter.post(
  '/lookup',
  rateLimit({ windowMs: 10 * 60_000, max: 20, name: 'support-lookup' }),
  (req, res) => {
    const rawNumber = clean(req.body?.number, 40).toUpperCase()
    const email = clean(req.body?.email, 200).toLowerCase()
    const digits = rawNumber.replace(/\D/g, '')
    if (!rawNumber || !email) {
      return res.status(400).json({ error: 'bad_request', message: 'Enter the request number and your email.' })
    }
    const ticket = getCollection('tickets').find((t) => {
      if (String(t.email || '').toLowerCase() !== email) return false
      const num = String(t.number || '').toUpperCase()
      return num === rawNumber || (digits.length > 0 && num.replace(/\D/g, '') === digits)
    })
    if (!ticket) {
      return res.status(404).json({ error: 'not_found', message: 'No request matches that number and email.' })
    }
    res.json({ ticket: publicTicket(ticket) })
  },
)

/**
 * Customer reply. Proof is either a shopper session that owns the ticket, or
 * the ticket's email (ids are unguessable, so id + email = the same bar as
 * the lookup above). Reopens resolved tickets and pings the studio.
 */
supportPublicRouter.post(
  '/tickets/:id/reply',
  rateLimit({ windowMs: 10 * 60_000, max: 30, name: 'support-reply' }),
  (req, res) => {
    const ticket = getItem('tickets', req.params.id)
    if (!ticket) return res.status(404).json({ error: 'not_found' })
    const message = clean(req.body?.message, MAX_MESSAGE)
    if (!message) return res.status(400).json({ error: 'bad_message', message: 'Write a reply first.' })

    const sess = shopperSession(req)
    const ticketEmail = String(ticket.email || '').toLowerCase()
    const owns =
      (sess && (ticket.accountId === sess.row.id || sess.row.email === ticketEmail)) ||
      clean(req.body?.email, 200).toLowerCase() === ticketEmail
    if (!owns) {
      return res.status(403).json({ error: 'forbidden', message: 'Confirm the email on this request to reply.' })
    }

    const next = applyCustomerMessage(ticket, message)
    upsertItem('tickets', next)
    bellNotify(`${next.customerName} replied on ${next.number}`, next.subject)
    bumpRev()
    void sendSupportOwnerAlert({ ticket: next, kind: 'reply', origin: requestOrigin(req) })
    void discordSupportAlert(next, 'reply')
    res.json({ ok: true, ticket: publicTicket(next) })
  },
)

// ── Admin router (mounted at /api/support) ───────────────────────────────────

/** Owner, or staff the owner granted the Support section */
function requireSupport(req, res, next) {
  if (req.user.role === 'owner' || (req.user.perms || []).includes('support')) return next()
  res.status(403).json({ error: 'forbidden', message: 'You don’t have access to Support.' })
}

export const supportAdminRouter = Router()
supportAdminRouter.use(requireAuth, requireSupport)

/** Staff reply → status flips to awaiting_customer, customer gets an email */
supportAdminRouter.post('/:id/reply', (req, res) => {
  const ticket = getItem('tickets', req.params.id)
  if (!ticket) return res.status(404).json({ error: 'not_found' })
  const message = clean(req.body?.message, MAX_MESSAGE)
  if (!message) return res.status(400).json({ error: 'bad_message', message: 'Write a reply first.' })

  const next = applyStaffMessage(ticket, message, req.user.name || 'The studio')
  upsertItem('tickets', next)
  bumpRev()
  void sendSupportStaffReply({ ticket: next, message, origin: requestOrigin(req) })
  res.json({ ok: true, ticket: next })
})

/** Manual status control. Resolving stamps resolvedAt and tells the customer;
 *  reopening clears it. */
supportAdminRouter.post('/:id/status', (req, res) => {
  const ticket = getItem('tickets', req.params.id)
  if (!ticket) return res.status(404).json({ error: 'not_found' })
  const status = String(req.body?.status || '')
  if (!TICKET_STATUSES.includes(status)) return res.status(400).json({ error: 'bad_status' })
  if (status === ticket.status) return res.json({ ok: true, ticket })

  const now = new Date().toISOString()
  const next = { ...ticket, status, updatedAt: now }
  if (status === 'resolved') next.resolvedAt = now
  else delete next.resolvedAt
  upsertItem('tickets', next)
  bumpRev()
  if (status === 'resolved') void sendSupportResolved({ ticket: next, origin: requestOrigin(req) })
  res.json({ ok: true, ticket: next })
})

/** Replace the tag set — trimmed, deduped (case-insensitive), capped */
supportAdminRouter.post('/:id/tags', (req, res) => {
  const ticket = getItem('tickets', req.params.id)
  if (!ticket) return res.status(404).json({ error: 'not_found' })
  const raw = Array.isArray(req.body?.tags) ? req.body.tags : null
  if (!raw) return res.status(400).json({ error: 'bad_tags' })
  const seen = new Set()
  const tags = []
  for (const t of raw) {
    const tag = clean(t, MAX_TAG_LEN)
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  const next = { ...ticket, tags, updatedAt: new Date().toISOString() }
  upsertItem('tickets', next)
  bumpRev()
  res.json({ ok: true, ticket: next })
})
