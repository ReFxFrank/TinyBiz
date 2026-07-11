// Review moderation — verified-purchase reviews from the storefront land here
// as 'pending'; nothing shows on a product page until it's published. All
// writes go through /api/reviews endpoints (never sync ops) so the server
// stamps publishedAt and keeps the storefront summaries honest.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, MessageSquareQuote, ShieldCheck, Star, Trash2, X } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  FilterBar,
  PageHeader,
  SearchInput,
  Segmented,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Textarea,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Review, ReviewStatus } from '@/data/types'
import { api, ApiError } from '@/lib/api'
import { fmtDateShort, num, timeAgo } from '@/lib/format'
import { toast } from '@/store/useUI'
import { cn, useDebounced, useLoaded } from '@/lib/utils'

const STATUS_META: Record<ReviewStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting for you', tone: 'yellow' },
  published: { label: 'Published', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'neutral' },
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const meta = STATUS_META[status]
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  )
}

/** Filled/empty star row — the one visual everything here hangs off */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn('h-3.5 w-3.5', i <= rating ? 'fill-[#eab308] text-[#eab308]' : 'text-ink-3/40')}
          aria-hidden
        />
      ))}
    </span>
  )
}

function applyReview(r: Review) {
  useStore.setState((s) => ({
    reviews: s.reviews.some((x) => x.id === r.id) ? s.reviews.map((x) => (x.id === r.id ? r : x)) : [r, ...s.reviews],
  }))
}

type StatusFilter = '' | ReviewStatus

export default function Reviews() {
  const loaded = useLoaded()
  const reviews = useStore((s) => s.reviews)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const q = useDebounced(query.trim().toLowerCase(), 200)

  const filtered = useMemo(() => {
    return reviews
      .filter((r) => {
        if (status && r.status !== status) return false
        if (q) {
          const hay = `${r.productName} ${r.authorName} ${r.email} ${r.title || ''} ${r.body} ${r.orderNumber || ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [reviews, q, status])

  const stats = useMemo(() => {
    const pending = reviews.filter((r) => r.status === 'pending').length
    const published = reviews.filter((r) => r.status === 'published')
    const avg = published.length
      ? Math.round((published.reduce((a, r) => a + r.rating, 0) / published.length) * 10) / 10
      : null
    return { pending, published: published.length, avg }
  }, [reviews])

  const hasFilters = Boolean(q || status)

  const columns: Array<Column<Review>> = [
    {
      key: 'rating',
      header: 'Rating',
      render: (r) => <Stars rating={r.rating} />,
      sortValue: (r) => r.rating,
    },
    {
      key: 'review',
      header: 'Review',
      render: (r) => (
        <div className="min-w-0 max-w-[26rem]">
          <div className="truncate font-medium text-ink">{r.title || r.body}</div>
          {r.title && <div className="mt-0.5 truncate text-xs text-ink-3">{r.body}</div>}
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      hideBelow: 'md',
      render: (r) => <span className="text-ink-2">{r.productName}</span>,
      sortValue: (r) => r.productName,
    },
    {
      key: 'author',
      header: 'Customer',
      hideBelow: 'lg',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{r.authorName}</div>
          <div className="truncate text-xs text-ink-3">{r.orderNumber || ''}</div>
        </div>
      ),
      sortValue: (r) => r.authorName,
    },
    {
      key: 'created',
      header: 'When',
      render: (r) => <span className="whitespace-nowrap text-ink-2">{timeAgo(r.createdAt)}</span>,
      sortValue: (r) => new Date(r.createdAt).getTime(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
      sortValue: (r) => ['pending', 'published', 'rejected'].indexOf(r.status),
    },
  ]

  const selected = selectedId ? (reviews.find((r) => r.id === selectedId) ?? null) : null

  return (
    <div>
      <PageHeader
        title="Reviews"
        description="Verified-purchase reviews from the shop — publish the keepers and they show up with stars on the product page."
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat
              label="Waiting for you"
              value={num(stats.pending)}
              icon={<MessageSquareQuote />}
              clickHint="Show the moderation queue"
              onClick={() => setStatus('pending')}
            />
            <Stat
              label="Published"
              value={num(stats.published)}
              icon={<ShieldCheck />}
              clickHint="Show published reviews"
              onClick={() => setStatus('published')}
            />
            <Stat label="Average rating" value={stats.avg != null ? `${stats.avg} ★` : '—'} icon={<Star />} />
          </div>

          <div>
            <FilterBar>
              <SearchInput
                aria-label="Search reviews"
                placeholder="Search product, customer, text…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                containerClassName="w-full sm:w-72"
              />
              <Segmented<StatusFilter>
                options={[
                  { value: '', label: 'All' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'published', label: 'Published' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
                value={status}
                onChange={setStatus}
                className="ml-auto"
              />
            </FilterBar>

            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelectedId(r.id)}
              initialSort={{ key: 'created', dir: 'desc' }}
              emptyState={
                <EmptyState
                  icon={<Star />}
                  title={hasFilters ? 'No reviews match your filters' : 'No reviews yet'}
                  description={
                    hasFilters
                      ? 'Try clearing the search or status filter.'
                      : 'When an order is delivered, the customer gets a one-time review invite — the results land here for a quick check before going live.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setStatus('')
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

      <ReviewDrawer review={selected} onClose={() => setSelectedId(null)} />
    </div>
  )
}

// ── Drawer ───────────────────────────────────────────────────────────────────

function ReviewDrawer({ review, onClose }: { review: Review | null; onClose: () => void }) {
  const [reply, setReply] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fail = (err: unknown, fallback: string) =>
    toast(fallback, { description: err instanceof ApiError ? err.message : 'Try again in a moment.', tone: 'error' })

  const setStatus = async (status: ReviewStatus) => {
    if (!review || busy) return
    setBusy(true)
    try {
      const r = await api.reviewsAdmin.setStatus(review.id, status)
      applyReview(r.review)
      if (status === 'published') toast('Review published', { description: 'It’s live on the product page.', tone: 'success' })
      if (status === 'rejected') toast('Review rejected', { description: 'It stays here, hidden from the shop.', tone: 'success' })
    } catch (err) {
      fail(err, 'Couldn’t update the review')
    } finally {
      setBusy(false)
    }
  }

  const saveReply = async (body: string) => {
    if (!review || busy) return
    setBusy(true)
    try {
      const r = await api.reviewsAdmin.reply(review.id, body)
      applyReview(r.review)
      setReply('')
      setReplyOpen(false)
      toast(body ? 'Reply saved — it shows under the review' : 'Reply removed', { tone: 'success' })
    } catch (err) {
      fail(err, 'Couldn’t save the reply')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!review || busy) return
    setBusy(true)
    try {
      await api.reviewsAdmin.remove(review.id)
      useStore.setState((s) => ({ reviews: s.reviews.filter((x) => x.id !== review.id) }))
      toast('Review deleted', { tone: 'success' })
      onClose()
    } catch (err) {
      fail(err, 'Couldn’t delete the review')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <Drawer
        open={review !== null}
        onClose={onClose}
        title={review ? review.productName : ''}
        subtitle={
          review ? (
            <span>
              {review.authorName} ·{' '}
              <a href={`mailto:${review.email}`} className="hover:underline">
                {review.email}
              </a>
              {review.orderNumber ? ` · order ${review.orderNumber}` : ''} · {fmtDateShort(review.createdAt)}
            </span>
          ) : undefined
        }
        footer={
          review ? (
            <>
              <Button variant="ghost" icon={<Trash2 />} disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
              {review.status !== 'rejected' && (
                <Button variant="secondary" icon={<X />} disabled={busy} onClick={() => void setStatus('rejected')}>
                  Reject
                </Button>
              )}
              {review.status !== 'published' && (
                <Button icon={<Check />} disabled={busy} onClick={() => void setStatus('published')}>
                  Publish
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {review && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Stars rating={review.rating} />
              <StatusBadge status={review.status} />
              {review.verified && (
                <Badge tone="green" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verified purchase
                </Badge>
              )}
            </div>

            <div className="rounded-xl bg-sunken px-4 py-3.5">
              {review.title && <div className="mb-1 text-sm font-semibold text-ink">{review.title}</div>}
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{review.body}</div>
            </div>

            {review.reply && !replyOpen ? (
              <div className="rounded-xl border border-hairline bg-surface px-4 py-3.5">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-2">Your public reply</span>
                  <button
                    className="text-xs font-medium text-accent-strong hover:underline dark:text-accent"
                    onClick={() => {
                      setReply(review.reply?.body ?? '')
                      setReplyOpen(true)
                    }}
                  >
                    Edit
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{review.reply.body}</div>
              </div>
            ) : replyOpen ? (
              <div>
                <Textarea
                  aria-label="Public reply"
                  placeholder="A short thank-you or answer — it shows under the review on the product page."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                />
                <div className="mt-2 flex justify-end gap-2">
                  {review.reply && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void saveReply('')}>
                      Remove reply
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setReplyOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={busy || !reply.trim()} onClick={() => void saveReply(reply.trim())}>
                    Save reply
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setReplyOpen(true)}
                className="text-[13px] font-medium text-accent-strong hover:underline dark:text-accent"
              >
                Write a public reply →
              </button>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this review?"
        description="It disappears from the queue and the product page for good. Rejecting instead keeps a record."
        confirmLabel="Delete review"
        danger
      />
    </>
  )
}
