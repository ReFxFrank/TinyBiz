// Customer support — one place to open a request, follow the conversation,
// and reply. Signed-in shoppers see all their requests; guests get in with
// the request number + email (or the direct link from any support email).

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, LifeBuoy, MessageCircle, Plus, Send, Sparkles } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { api, ApiError, type PublicOrder, type PublicTicket } from '@/lib/api'
import { useShopAccount } from '@/store/useShopAccount'
import { fmtDate } from '@/lib/format'
import { toast } from '@/store/useUI'
import { cn } from '@/lib/utils'
import type { TicketStatus } from '@/data/types'

/** Customer-facing status labels — friendlier than the staff triage terms */
const STATUS_META: Record<TicketStatus, { label: string; tone: 'blue' | 'green' | 'neutral' }> = {
  open: { label: "We're on it", tone: 'blue' },
  awaiting_customer: { label: 'Replied', tone: 'green' },
  resolved: { label: 'Resolved', tone: 'neutral' },
}

function StatusChip({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status]
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  )
}

const describe = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

// ── Thread ───────────────────────────────────────────────────────────────────

function ThreadView({
  ticket,
  knownEmail,
  onUpdate,
  onBack,
}: {
  ticket: PublicTicket
  /** Email we can prove (session or lookup) — guests via bare link confirm it to reply */
  knownEmail: string | null
  onUpdate: (t: PublicTicket) => void
  onBack: () => void
}) {
  const shopName = 'The studio'
  const [reply, setReply] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsEmail = !knownEmail

  const send = async () => {
    if (sending || !reply.trim() || (needsEmail && !email.trim())) return
    setSending(true)
    setError(null)
    try {
      const r = await api.support.reply(ticket.id, reply.trim(), knownEmail ?? email.trim())
      onUpdate(r.ticket)
      setReply('')
      toast('Reply sent', { description: 'We’ll get back to you by email too.', tone: 'success' })
    } catch (err) {
      setError(describe(err, 'Could not send that right now — try again in a moment.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card padding="lg">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All requests
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-ink">{ticket.subject}</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {ticket.number}
            {ticket.orderNumber ? ` · about order ${ticket.orderNumber}` : ''} · opened {fmtDate(ticket.createdAt)}
          </p>
        </div>
        <StatusChip status={ticket.status} />
      </div>

      <div className="mt-5 space-y-3">
        {ticket.messages.map((m) => (
          <div key={m.id} className={cn('flex', m.from === 'customer' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5',
                m.from === 'customer' ? 'rounded-br-md bg-accent-wash' : 'rounded-bl-md bg-sunken',
              )}
            >
              <div className="mb-0.5 flex items-baseline gap-2 text-[11px] text-ink-3">
                <span className="font-semibold text-ink-2">{m.from === 'customer' ? 'You' : m.authorName || shopName}</span>
                <span>{fmtDate(m.at)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{m.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-hairline pt-4">
        {ticket.status === 'resolved' && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-good-wash px-3.5 py-2.5 text-[13px] text-[#006300] dark:text-good">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            This request is resolved — replying below reopens it instantly.
          </div>
        )}
        {needsEmail && (
          <div className="mb-3">
            <Field label="Confirm the email on this request to reply">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
          </div>
        )}
        <Textarea
          aria-label="Your reply"
          placeholder="Write a reply…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
        />
        <div aria-live="polite">{error && <p className="mt-2 text-[13px] text-critical">{error}</p>}</div>
        <div className="mt-2 flex justify-end">
          <Button icon={<Send />} disabled={sending || !reply.trim() || (needsEmail && !email.trim())} onClick={() => void send()}>
            {sending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ── New request ──────────────────────────────────────────────────────────────

function NewRequestCard({
  signedIn,
  prefillName = '',
  prefillEmail = '',
  prefillOrder,
  onCreated,
  onCancel,
}: {
  signedIn: boolean
  prefillName?: string
  prefillEmail?: string
  prefillOrder: string
  onCreated: (t: PublicTicket, email: string | null) => void
  onCancel?: () => void
}) {
  const account = useShopAccount((s) => s.account)
  const [name, setName] = useState(prefillName)
  const [email, setEmail] = useState(prefillEmail)
  const [orderNumber, setOrderNumber] = useState(prefillOrder)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Signed-in shoppers pick from their own orders instead of typing a number
  const [orders, setOrders] = useState<PublicOrder[] | null>(null)
  useEffect(() => {
    if (!signedIn) return
    api.account
      .orders()
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]))
  }, [signedIn])

  const ready = subject.trim() && message.trim() && (signedIn || (name.trim() && email.trim()))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.support.create({
        subject: subject.trim(),
        message: message.trim(),
        ...(orderNumber.trim() ? { orderNumber: orderNumber.trim() } : {}),
        ...(signedIn ? {} : { name: name.trim(), email: email.trim() }),
      })
      toast(`Request ${r.ticket.number} sent`, { description: 'We’ve emailed you a copy — replies land there too.', tone: 'success' })
      onCreated(r.ticket, signedIn ? (account?.email ?? null) : email.trim().toLowerCase())
    } catch (err) {
      setError(describe(err, 'Could not send that right now — try again in a moment.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-[15px] font-semibold text-ink">Start a new request</h2>
      <p className="mt-1 text-[13px] text-ink-3">
        Order trouble, damaged print, question about a piece — tell us and a real person replies, usually within a business day.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {!signedIn && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Doe" autoComplete="name" />
            </Field>
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's it about?" maxLength={150} />
          </Field>
          {signedIn ? (
            <Field label="Related order (optional)">
              <Select
                aria-label="Related order"
                placeholder={orders === null ? 'Loading your orders…' : orders.length ? 'Not about an order' : 'No orders on this account'}
                options={(orders ?? []).map((o) => ({ value: o.number, label: `${o.number} · ${fmtDate(o.placedAt)}` }))}
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Order number (optional)">
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="TMS-1042"
                autoComplete="off"
                className="font-mono"
              />
            </Field>
          )}
        </div>
        <Field label="What's going on?">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="The more detail, the faster we can help."
            rows={5}
          />
        </Field>
        <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !ready}>
            {busy ? 'Sending…' : 'Send request'}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}

// ── Guest lookup ─────────────────────────────────────────────────────────────

function LookupCard({ onFound }: { onFound: (t: PublicTicket, email: string) => void }) {
  const [number, setNumber] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookup = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !number.trim() || !email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.support.lookup(number.trim(), email.trim())
      onFound(r.ticket, email.trim().toLowerCase())
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'No request matches that number and email — double-check both.'
          : describe(err, 'Could not look that up right now — try again in a moment.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-[15px] font-semibold text-ink">Check an existing request</h2>
      <p className="mt-1 text-[13px] text-ink-3">The request number (SUP-…) is in the email we sent you.</p>
      <form onSubmit={lookup} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1.4fr_auto]">
        <Field label="Request number">
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="SUP-1001" autoComplete="off" className="font-mono" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full sm:w-auto" disabled={busy || !number.trim() || !email.trim()}>
            {busy ? 'Looking…' : 'Find it'}
          </Button>
        </div>
      </form>
      <div aria-live="polite">{error && <p className="mt-3 text-[13px] text-critical">{error}</p>}</div>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StoreSupport() {
  const account = useShopAccount((s) => s.account)
  const status = useShopAccount((s) => s.status)
  const load = useShopAccount((s) => s.load)
  const [searchParams, setSearchParams] = useSearchParams()

  const [ticket, setTicket] = useState<PublicTicket | null>(null)
  const [knownEmail, setKnownEmail] = useState<string | null>(null)
  const [mine, setMine] = useState<PublicTicket[] | null>(null)
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  const signedIn = Boolean(account && !account.staff)

  // Deep link from any support email: /support?t=<id>
  const deepLinkId = searchParams.get('t')
  useEffect(() => {
    if (!deepLinkId) return
    api.support
      .get(deepLinkId)
      .then((r) => setTicket(r.ticket))
      .catch(() => toast('That request link doesn’t work anymore', { tone: 'error' }))
  }, [deepLinkId])

  // Signed-in shoppers see all their requests
  const loadMine = () => {
    if (!signedIn) return
    api.support
      .mine()
      .then((r) => setMine(r.tickets))
      .catch(() => setMine((prev) => prev ?? []))
  }
  useEffect(loadMine, [signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const openThread = (t: PublicTicket, email: string | null) => {
    setTicket(t)
    setComposing(false)
    if (email) setKnownEmail(email)
  }

  const closeThread = () => {
    setTicket(null)
    if (deepLinkId) setSearchParams({}, { replace: true })
    loadMine()
  }

  const sessionEmail = signedIn ? (account?.email?.toLowerCase() ?? null) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6"
    >
      <div className="text-center">
        <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient-soft text-accent">
          <LifeBuoy className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Support</h1>
        <p className="mt-2 text-sm text-ink-3">Something not right with an order? We'll make it right.</p>
      </div>

      <div className="mt-8 space-y-5">
        {status !== 'ready' ? (
          <div className="space-y-3">
            <div className="skeleton h-40 rounded-2xl" />
          </div>
        ) : ticket ? (
          <ThreadView
            ticket={ticket}
            knownEmail={sessionEmail ?? knownEmail}
            onUpdate={setTicket}
            onBack={closeThread}
          />
        ) : (
          <>
            {account?.staff && (
              <Card padding="lg">
                <div className="flex flex-wrap items-center gap-3">
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-strong dark:text-accent">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] font-semibold text-ink">You're signed in as studio {account.role === 'owner' ? 'owner' : 'staff'}</h2>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">
                      Customer requests are answered in the admin — but you can open one below to see what customers see.
                    </p>
                  </div>
                  <Link to="/admin/support" className="shrink-0">
                    <Button variant="secondary" size="sm">Open the Support inbox</Button>
                  </Link>
                </div>
              </Card>
            )}
            {signedIn && !composing && (
              <Card padding="lg">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[15px] font-semibold text-ink">Your requests</h2>
                    <p className="mt-1 text-[13px] text-ink-3">Everything you've asked us, in one place.</p>
                  </div>
                  <Button size="sm" icon={<Plus />} onClick={() => setComposing(true)}>
                    New request
                  </Button>
                </div>
                {mine === null ? (
                  <div className="mt-4 space-y-2">
                    <div className="skeleton h-14" />
                    <div className="skeleton h-14" />
                  </div>
                ) : mine.length === 0 ? (
                  <div className="mt-2">
                    <EmptyState
                      icon={<MessageCircle />}
                      title="No requests yet"
                      description="If anything's ever not right, open a request and we'll sort it out."
                    />
                  </div>
                ) : (
                  <ul className="mt-4 divide-y divide-hairline">
                    {mine.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => openThread(t, sessionEmail)}
                          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 py-3.5 text-left first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-ink">{t.subject}</span>
                              <StatusChip status={t.status} />
                            </div>
                            <div className="mt-0.5 truncate text-xs text-ink-3">
                              {t.number}
                              {t.orderNumber ? ` · order ${t.orderNumber}` : ''} · updated {fmtDate(t.updatedAt)}
                              {t.lastReplyBy === 'staff' && t.status !== 'resolved' ? ' · we replied ✨' : ''}
                            </div>
                          </div>
                          <span className="text-[13px] font-medium text-accent-strong dark:text-accent">View →</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {(!signedIn || composing) && (
              <NewRequestCard
                signedIn={signedIn}
                prefillName={account?.staff ? account.name : ''}
                prefillEmail={account?.staff ? account.email : ''}
                prefillOrder={searchParams.get('order') ?? ''}
                onCreated={openThread}
                onCancel={signedIn ? () => setComposing(false) : undefined}
              />
            )}

            {!signedIn && <LookupCard onFound={openThread} />}

            {!signedIn && !account?.staff && (
              <p className="text-center text-sm text-ink-3">
                Have an account?{' '}
                <Link to="/account" className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
                  Sign in
                </Link>{' '}
                to see all your requests in one place.
              </p>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
