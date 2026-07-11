// Storefront reviews: the star row used on cards and the product page, the
// published-reviews list, and the write-a-review form. Every review needs a
// verified purchase — signed-in shoppers are matched automatically, guests
// prove it with order number + email (the review-request email prefills both).

import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgeCheck, Star } from 'lucide-react'
import { Button, Card, Field, Input, Textarea } from '@/components/ui'
import { api, ApiError, type PublicReview } from '@/lib/api'
import { useShopAccount } from '@/store/useShopAccount'
import { useCatalog } from '@/store/useCatalog'
import { fmtDate } from '@/lib/format'
import { toast } from '@/store/useUI'
import { cn } from '@/lib/utils'

/** Filled/empty stars — `size` in px so cards and headers can share it */
export function StarRow({ rating, size = 14, className }: { rating: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={cn(i <= Math.round(rating) ? 'fill-[#eab308] text-[#eab308]' : 'fill-transparent text-ink-3/50')}
          aria-hidden
        />
      ))}
    </span>
  )
}

/** Compact "★★★★☆ (12)" line for product cards — renders nothing unrated */
export function CardRating({ productId }: { productId: string }) {
  const rating = useCatalog((s) => s.ratings[productId])
  if (!rating || rating.count === 0) return null
  return (
    <span className="mt-1 flex items-center gap-1.5">
      <StarRow rating={rating.avg} size={12} />
      <span className="text-[11px] text-ink-3">({rating.count})</span>
    </span>
  )
}

/** Clickable 1-5 star input for the review form */
function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i === 1 ? '' : 's'}`}
          onClick={() => onChange(i)}
          onMouseEnter={() => setHover(i)}
          className="rounded p-0.5 transition-transform hover:scale-110"
        >
          <Star className={cn('h-7 w-7', i <= shown ? 'fill-[#eab308] text-[#eab308]' : 'fill-transparent text-ink-3/50')} />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-1.5 text-[13px] text-ink-3">
          {['', 'Not great', 'Could be better', 'Pretty good', 'Really nice', 'Love it!'][value]}
        </span>
      )}
    </div>
  )
}

// ── The product page section ─────────────────────────────────────────────────

export function ReviewsSection({ productId, productName }: { productId: string; productName: string }) {
  const account = useShopAccount((s) => s.account)
  const loadAccount = useShopAccount((s) => s.load)
  const [searchParams] = useSearchParams()

  const [reviews, setReviews] = useState<PublicReview[] | null>(null)
  const [summary, setSummary] = useState<{ avg: number; count: number }>({ avg: 0, count: 0 })
  // The review-request email deep-links with ?review=1&number=…&email=…
  const [formOpen, setFormOpen] = useState(() => searchParams.get('review') === '1')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    void loadAccount()
    api.reviews
      .list(productId)
      .then((r) => {
        setReviews(r.reviews)
        setSummary(r.summary)
      })
      .catch(() => setReviews((prev) => prev ?? []))
  }, [productId, loadAccount])

  const signedIn = Boolean(account && !account.staff)

  return (
    <Card className="mt-10" padding="lg" id="reviews">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Reviews</h2>
          {summary.count > 0 ? (
            <div className="mt-1.5 flex items-center gap-2">
              <StarRow rating={summary.avg} size={16} />
              <span className="text-sm text-ink-2">
                {summary.avg} · {summary.count} review{summary.count === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-ink-3">No reviews yet — bought one? You could be first.</p>
          )}
        </div>
        {!formOpen && !sent && (
          <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
            Write a review
          </Button>
        )}
      </div>

      {sent ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-good-wash px-4 py-3 text-sm text-[#006300] dark:text-good">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          Thanks! Your review is in — it shows up here after a quick check by the studio.
        </div>
      ) : (
        formOpen && (
          <ReviewForm
            productId={productId}
            productName={productName}
            signedIn={signedIn}
            prefillNumber={searchParams.get('number') ?? ''}
            prefillEmail={searchParams.get('email') ?? ''}
            onDone={() => {
              setSent(true)
              setFormOpen(false)
            }}
            onCancel={() => setFormOpen(false)}
          />
        )
      )}

      {reviews === null ? (
        <div className="mt-5 space-y-2">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
      ) : reviews.length > 0 ? (
        <ul className="mt-5 space-y-5">
          {reviews.map((r) => (
            <li key={r.id} className="border-t border-hairline pt-5 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <StarRow rating={r.rating} />
                <span className="text-sm font-semibold text-ink">{r.authorName}</span>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-good-wash px-2 py-0.5 text-[11px] font-medium text-[#006300] dark:text-good">
                    <BadgeCheck className="h-3 w-3" /> Verified purchase
                  </span>
                )}
                <span className="text-xs text-ink-3">{fmtDate(r.createdAt)}</span>
              </div>
              {r.title && <div className="mt-1.5 text-sm font-semibold text-ink">{r.title}</div>}
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{r.body}</p>
              {r.reply && (
                <div className="mt-3 rounded-xl bg-sunken px-3.5 py-2.5">
                  <div className="text-[11px] font-semibold text-ink-2">Reply from the studio</div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{r.reply.body}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

// ── Write form ───────────────────────────────────────────────────────────────

function ReviewForm({
  productId,
  productName,
  signedIn,
  prefillNumber,
  prefillEmail,
  onDone,
  onCancel,
}: {
  productId: string
  productName: string
  signedIn: boolean
  prefillNumber: string
  prefillEmail: string
  onDone: () => void
  onCancel: () => void
}) {
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState(prefillEmail)
  const [orderNumber, setOrderNumber] = useState(prefillNumber)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = rating > 0 && body.trim() && (signedIn || (name.trim() && email.trim() && orderNumber.trim()))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    setError(null)
    try {
      await api.reviews.create({
        productId,
        rating,
        ...(title.trim() ? { title: title.trim() } : {}),
        body: body.trim(),
        ...(signedIn ? {} : { name: name.trim(), email: email.trim(), orderNumber: orderNumber.trim() }),
      })
      toast('Review sent — thank you!', { description: 'It goes live after a quick check.', tone: 'success' })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that right now — try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4 rounded-xl border border-hairline bg-surface p-4">
      <div className="text-sm font-semibold text-ink">How was your {productName}?</div>
      <StarInput value={rating} onChange={setRating} />
      {!signedIn && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex D." autoComplete="name" maxLength={80} />
          </Field>
          <Field label="Order number">
            <Input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="TMS-1042"
              autoComplete="off"
              className="font-mono"
            />
          </Field>
          <Field label="Email used at checkout">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </Field>
        </div>
      )}
      <Field label="Title (optional)">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sums it up in a few words" maxLength={80} />
      </Field>
      <Field label="Your review">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What do you love? How's the print quality, the size, the colours?"
          rows={4}
          maxLength={2000}
        />
      </Field>
      {!signedIn && (
        <p className="text-xs text-ink-3">
          Reviews are for verified purchases — we match your order number and email, and never show your email.
        </p>
      )}
      <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !ready}>
          {busy ? 'Sending…' : 'Send review'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
