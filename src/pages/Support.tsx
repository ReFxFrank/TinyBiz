// Support inbox — customer requests from the storefront, answered here.
// Replies, status changes and tags all go through /api/support endpoints
// (never sync ops): the server flips statuses, stamps timestamps and emails
// the customer, then the updated ticket is folded back into the store.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock, LifeBuoy, MessageCircle, Package, Send, Tag, X } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Textarea,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { SupportTicket, TicketStatus } from '@/data/types'
import { api, ApiError } from '@/lib/api'
import { fmtDateShort, num, timeAgo } from '@/lib/format'
import { toast } from '@/store/useUI'
import { cn, useDebounced, useLoaded } from '@/lib/utils'

const STATUS_META: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  open: { label: 'Needs reply', tone: 'yellow' },
  awaiting_customer: { label: 'Waiting on customer', tone: 'blue' },
  resolved: { label: 'Resolved', tone: 'green' },
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status]
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  )
}

/** "4h", "2d 3h" — how long things sat, without decimals nobody reads */
function fmtDur(ms: number): string {
  const h = Math.round(ms / 3_600_000)
  if (h < 1) return '<1h'
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

/** Fold a server-authoritative ticket back into the store (no sync op echoes
 *  — tickets are excluded from the diff; the poll reconciles regardless) */
function applyTicket(t: SupportTicket) {
  useStore.setState((s) => ({
    tickets: s.tickets.some((x) => x.id === t.id) ? s.tickets.map((x) => (x.id === t.id ? t : x)) : [t, ...s.tickets],
  }))
}

type StatusFilter = '' | TicketStatus

export default function Support() {
  const loaded = useLoaded()
  const tickets = useStore((s) => s.tickets)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [tagFilter, setTagFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const q = useDebounced(query.trim().toLowerCase(), 200)

  const allTags = useMemo(() => {
    const set = new Map<string, string>() // lowercase → display casing
    for (const t of tickets) for (const tag of t.tags || []) set.set(tag.toLowerCase(), tag)
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [tickets])

  const filtered = useMemo(() => {
    return tickets
      .filter((t) => {
        if (status && t.status !== status) return false
        if (tagFilter && !(t.tags || []).some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) return false
        if (q) {
          const hay = `${t.number} ${t.subject} ${t.customerName} ${t.email} ${t.orderNumber || ''} ${(t.tags || []).join(' ')}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [tickets, q, status, tagFilter])

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'open').length
    const waiting = tickets.filter((t) => t.status === 'awaiting_customer').length
    const resolved = tickets.filter((t) => t.status === 'resolved').length
    const responseTimes = tickets
      .filter((t) => t.firstResponseAt)
      .map((t) => new Date(t.firstResponseAt as string).getTime() - new Date(t.createdAt).getTime())
      .sort((a, b) => a - b)
    const median = responseTimes.length ? responseTimes[Math.floor(responseTimes.length / 2)] : null
    return { open, waiting, resolved, median }
  }, [tickets])

  const hasFilters = Boolean(q || status || tagFilter)

  const columns: Array<Column<SupportTicket>> = [
    {
      key: 'number',
      header: 'Request',
      render: (t) => <span className="font-mono text-[13px] font-medium text-ink">{t.number}</span>,
      sortValue: (t) => t.number,
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (t) => (
        <div className="min-w-0 max-w-[26rem]">
          <div className="truncate font-medium text-ink">{t.subject}</div>
          {(t.tags || []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {t.tags.map((tag) => (
                <Badge key={tag} className="px-2 py-0 text-[11px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ),
      sortValue: (t) => t.subject,
    },
    {
      key: 'customer',
      header: 'Customer',
      hideBelow: 'md',
      render: (t) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{t.customerName}</div>
          <div className="hidden truncate text-xs text-ink-3 lg:block">{t.email}</div>
        </div>
      ),
      sortValue: (t) => t.customerName,
    },
    {
      key: 'order',
      header: 'Order',
      hideBelow: 'lg',
      render: (t) =>
        t.orderNumber ? <span className="font-mono text-xs text-ink-2">{t.orderNumber}</span> : <span className="text-ink-3">—</span>,
    },
    {
      key: 'updated',
      header: 'Last activity',
      render: (t) => (
        <div>
          <div className="whitespace-nowrap text-ink-2">{timeAgo(t.updatedAt)}</div>
          <div className="text-xs text-ink-3">
            {t.lastReplyBy === 'customer' ? 'Customer wrote' : 'You replied'}
          </div>
        </div>
      ),
      sortValue: (t) => new Date(t.updatedAt).getTime(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => <StatusBadge status={t.status} />,
      sortValue: (t) => ['open', 'awaiting_customer', 'resolved'].indexOf(t.status),
    },
  ]

  const selected = selectedId ? (tickets.find((t) => t.id === selectedId) ?? null) : null

  return (
    <div>
      <PageHeader
        title="Support"
        description="Customer requests from the shop — reply here and they get an email with the whole thread."
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonTable rows={6} />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Needs a reply"
              value={num(stats.open)}
              icon={<MessageCircle />}
              clickHint="Show requests waiting on you"
              onClick={() => setStatus('open')}
            />
            <Stat
              label="Waiting on customer"
              value={num(stats.waiting)}
              icon={<Clock />}
              clickHint="Show requests you've answered"
              onClick={() => setStatus('awaiting_customer')}
            />
            <Stat
              label="Resolved"
              value={num(stats.resolved)}
              icon={<CheckCircle2 />}
              clickHint="Show resolved requests"
              onClick={() => setStatus('resolved')}
            />
            <Stat label="Median first reply" value={stats.median != null ? fmtDur(stats.median) : '—'} icon={<LifeBuoy />} />
          </div>

          <div>
            <FilterBar>
              <SearchInput
                aria-label="Search support requests"
                placeholder="Search number, subject, customer, order…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                containerClassName="w-full sm:w-72"
              />
              {allTags.length > 0 && (
                <Select
                  aria-label="Filter by tag"
                  placeholder="All tags"
                  options={allTags}
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="w-40"
                />
              )}
              <Segmented<StatusFilter>
                options={[
                  { value: '', label: 'All' },
                  { value: 'open', label: 'Needs reply' },
                  { value: 'awaiting_customer', label: 'Waiting' },
                  { value: 'resolved', label: 'Resolved' },
                ]}
                value={status}
                onChange={setStatus}
                className="ml-auto"
              />
            </FilterBar>

            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(t) => t.id}
              onRowClick={(t) => setSelectedId(t.id)}
              initialSort={{ key: 'updated', dir: 'desc' }}
              emptyState={
                <EmptyState
                  icon={<LifeBuoy />}
                  title={hasFilters ? 'No requests match your filters' : 'No support requests yet'}
                  description={
                    hasFilters
                      ? 'Try clearing the search, tag, or status filter.'
                      : 'When a customer opens a request from the shop, it lands here and you both get email updates.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setStatus('')
                          setTagFilter('')
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </div>
        </motion.div>
      )}

      <TicketDrawer ticket={selected} allTags={allTags} onClose={() => setSelectedId(null)} />
    </div>
  )
}

// ── Drawer ───────────────────────────────────────────────────────────────────

function TicketDrawer({ ticket, allTags, onClose }: { ticket: SupportTicket | null; allTags: string[]; onClose: () => void }) {
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)

  const fail = (err: unknown, fallback: string) =>
    toast(fallback, { description: err instanceof ApiError ? err.message : 'Try again in a moment.', tone: 'error' })

  const send = async () => {
    if (!ticket || sending || !reply.trim()) return
    setSending(true)
    try {
      const r = await api.supportAdmin.reply(ticket.id, reply.trim())
      applyTicket(r.ticket)
      setReply('')
      toast('Reply sent', { description: `${ticket.customerName} gets it by email too.`, tone: 'success' })
    } catch (err) {
      fail(err, 'Couldn’t send the reply')
    } finally {
      setSending(false)
    }
  }

  const setStatus = async (status: TicketStatus) => {
    if (!ticket || busy || status === ticket.status) return
    setBusy(true)
    try {
      const r = await api.supportAdmin.setStatus(ticket.id, status)
      applyTicket(r.ticket)
      if (status === 'resolved') toast('Marked resolved', { description: 'The customer gets a closing email.', tone: 'success' })
    } catch (err) {
      fail(err, 'Couldn’t update the status')
    } finally {
      setBusy(false)
    }
  }

  const setTags = async (tags: string[]) => {
    if (!ticket || busy) return
    setBusy(true)
    try {
      const r = await api.supportAdmin.setTags(ticket.id, tags)
      applyTicket(r.ticket)
    } catch (err) {
      fail(err, 'Couldn’t update tags')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      open={ticket !== null}
      onClose={onClose}
      wide
      title={ticket ? `${ticket.number} · ${ticket.subject}` : ''}
      subtitle={
        ticket ? (
          <span>
            {ticket.customerName} ·{' '}
            <a href={`mailto:${ticket.email}`} className="hover:underline">
              {ticket.email}
            </a>{' '}
            · opened {fmtDateShort(ticket.createdAt)}
          </span>
        ) : undefined
      }
      footer={
        ticket ? (
          ticket.status === 'resolved' ? (
            <Button variant="secondary" disabled={busy} onClick={() => void setStatus('open')}>
              Reopen request
            </Button>
          ) : (
            <Button variant="secondary" icon={<CheckCircle2 />} disabled={busy} onClick={() => void setStatus('resolved')}>
              Mark resolved
            </Button>
          )
        ) : undefined
      }
    >
      {ticket && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            {ticket.orderNumber && (
              <Badge className="gap-1">
                <Package className="h-3 w-3" /> {ticket.orderNumber}
              </Badge>
            )}
            {ticket.firstResponseAt && (
              <span className="text-xs text-ink-3">
                First reply in {fmtDur(new Date(ticket.firstResponseAt).getTime() - new Date(ticket.createdAt).getTime())}
              </span>
            )}
            {ticket.resolvedAt && <span className="text-xs text-ink-3">Resolved {timeAgo(ticket.resolvedAt)}</span>}
            <div className="ml-auto">
              <Select
                aria-label="Status"
                options={[
                  { value: 'open', label: 'Needs reply' },
                  { value: 'awaiting_customer', label: 'Waiting on customer' },
                  { value: 'resolved', label: 'Resolved' },
                ]}
                value={ticket.status}
                onChange={(e) => void setStatus(e.target.value as TicketStatus)}
                className="w-48"
              />
            </div>
          </div>

          <TagEditor ticket={ticket} allTags={allTags} disabled={busy} onSave={(tags) => void setTags(tags)} />

          <div className="space-y-3">
            {ticket.messages.map((m) => (
              <div key={m.id} className={cn('flex', m.from === 'staff' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5',
                    m.from === 'staff' ? 'rounded-br-md bg-accent-wash' : 'rounded-bl-md bg-sunken',
                  )}
                >
                  <div className="mb-0.5 flex items-baseline gap-2 text-[11px] text-ink-3">
                    <span className="font-semibold text-ink-2">{m.from === 'staff' ? m.authorName || 'Studio' : m.authorName}</span>
                    <span>{timeAgo(m.at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{m.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-hairline pt-4">
            <Textarea
              aria-label="Reply to the customer"
              placeholder={`Reply to ${ticket.customerName.split(' ')[0]}… (they get it by email)`}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send()
              }}
              rows={4}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-3">
                {ticket.status === 'resolved' ? 'Replying keeps it resolved-friendly — the thread reopens for them.' : 'Sending moves this to “Waiting on customer”.'}
              </span>
              <Button icon={<Send />} disabled={sending || !reply.trim()} onClick={() => void send()}>
                {sending ? 'Sending…' : 'Send reply'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}

// ── Tags ─────────────────────────────────────────────────────────────────────

function TagEditor({
  ticket,
  allTags,
  disabled,
  onSave,
}: {
  ticket: SupportTicket
  allTags: string[]
  disabled: boolean
  onSave: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const tags = ticket.tags || []

  const add = (raw: string) => {
    const tag = raw.trim().slice(0, 24)
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase()) || tags.length >= 10) return
    onSave([...tags, tag])
    setDraft('')
  }

  const suggestions = allTags.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase())).slice(0, 6)

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-2">
        <Tag className="h-3.5 w-3.5" /> Tags
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-sunken px-2.5 py-0.5 text-xs font-medium text-ink-2">
            {tag}
            <button
              aria-label={`Remove tag ${tag}`}
              disabled={disabled}
              onClick={() => onSave(tags.filter((t) => t !== tag))}
              className="rounded-full p-0.5 text-ink-3 hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add(draft)
          }}
          className="inline-flex"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={tags.length === 0 ? 'Add a tag — refund, damaged, question…' : 'Add tag…'}
            aria-label="Add a tag"
            disabled={disabled || tags.length >= 10}
            className="w-48 bg-transparent px-1.5 py-0.5 text-xs text-ink outline-none placeholder:text-ink-3"
          />
        </form>
      </div>
      {draft === '' && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-ink-3">
          <span>Reuse:</span>
          {suggestions.map((t) => (
            <button key={t} disabled={disabled} onClick={() => add(t)} className="rounded-full border border-hairline px-2 py-0.5 hover:bg-sunken">
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
