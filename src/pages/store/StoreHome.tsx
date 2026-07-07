// Storefront home — the shop's landing page. Hero, trust strip, best sellers,
// category tiles, maker story, and a newsletter signup that writes straight
// into the admin Subscribers list.

import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, HeartHandshake, Mail, ShoppingBag, Sparkles, Truck } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { StoreProductCard } from './StoreProductCard'
import { useStore } from '@/store/useStore'
import { FREE_SHIPPING_OVER } from '@/store/useCart'
import { toast } from '@/store/useUI'
import { bestSellers } from '@/lib/metrics'
import { money } from '@/lib/format'
import { cn, uid } from '@/lib/utils'
import type { Product } from '@/data/types'

/** Same soft-gradient artwork recipe as StoreProductCard */
const tileGradient = (p: Product) => ({
  background: `linear-gradient(135deg, hsl(${p.imageHue}, 70%, 92%), hsl(${(p.imageHue + 40) % 360}, 60%, 86%))`,
})

// ── Hero ─────────────────────────────────────────────────────────────────────

/** Where the decorative product emojis sit inside the hero */
const HERO_SPOTS = [
  'left-[4%] top-[16%] -rotate-12 text-4xl sm:text-5xl',
  'right-[5%] top-[22%] rotate-12 text-4xl sm:text-5xl',
  'left-[13%] bottom-[14%] rotate-6 text-3xl sm:text-4xl',
  'right-[14%] bottom-[12%] -rotate-6 text-3xl sm:text-4xl',
  'hidden sm:block left-[26%] top-[8%] rotate-3 text-3xl',
  'hidden sm:block right-[27%] bottom-[6%] -rotate-3 text-3xl',
]

function Hero({ heroEmojis }: { heroEmojis: string[] }) {
  const settings = useStore((s) => s.settings)
  return (
    <section className="relative overflow-hidden rounded-3xl border border-hairline brand-gradient-soft px-6 py-16 sm:px-12 sm:py-24">
      {/* Floating product art — purely decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
        {heroEmojis.map((emoji, i) => (
          <span key={i} className={cn('absolute opacity-25', HERO_SPOTS[i])}>
            {emoji}
          </span>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative mx-auto max-w-2xl text-center"
      >
        <span
          aria-hidden
          className="inline-flex h-16 w-16 items-center justify-center rounded-2xl brand-gradient text-4xl shadow-pop"
        >
          {settings.logoEmoji}
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">{settings.businessName}</h1>
        <p className="mt-3 text-lg font-medium text-ink-2">{settings.tagline}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-3">
          Every piece is designed, 3D-printed, and hand-finished in our {settings.address.city} studio — in small
          batches, never mass-produced.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/store/shop">
            <Button size="lg" icon={<ShoppingBag />}>Shop the collection</Button>
          </Link>
          <a href="#best-sellers">
            <Button size="lg" variant="outline">Best sellers</Button>
          </a>
        </div>
      </motion.div>
    </section>
  )
}

// ── Trust strip ──────────────────────────────────────────────────────────────

function TrustStrip() {
  const props = [
    { icon: Truck, title: 'Free US shipping', body: `On every order over ${money(FREE_SHIPPING_OVER)}` },
    { icon: Sparkles, title: 'Made to order', body: 'Printed in-house in small batches' },
    { icon: HeartHandshake, title: 'Easy returns', body: '30-day returns & friendly support' },
  ]
  return (
    <section className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-3">
      {props.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-center gap-3.5 bg-surface px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-strong dark:text-accent">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">{title}</div>
            <div className="truncate text-xs text-ink-3">{body}</div>
          </div>
        </div>
      ))}
    </section>
  )
}

// ── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({ title, subtitle, viewAll }: { title: string; subtitle: string; viewAll?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
      </div>
      {viewAll && (
        <Link
          to="/store/shop"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent-strong hover:underline dark:text-accent"
        >
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

// ── Newsletter signup — writes into the real subscribers collection ──────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function NewsletterSignup() {
  const subscribers = useStore((s) => s.subscribers)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Please enter a valid email address.')
      return
    }
    setError(null)

    const existing = subscribers.find((s) => s.email.toLowerCase() === value.toLowerCase())
    if (existing) {
      if (existing.status === 'subscribed') {
        toast('You are already on the list', { tone: 'default' })
      } else {
        updateItem('subscribers', existing.id, { status: 'subscribed' })
        toast('Welcome back!', { description: 'You are back on the list.', tone: 'success' })
        setEmail('')
      }
      return
    }

    addItem('subscribers', {
      id: uid('sub'),
      email: value,
      name: '',
      status: 'subscribed',
      tags: ['storefront'],
      source: 'Signup form',
      createdAt: new Date().toISOString(),
    })
    toast("You're in!", { description: 'Watch your inbox for the next drop.', tone: 'success' })
    setEmail('')
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-hairline brand-gradient-soft px-6 py-12 sm:px-12">
      <div className="mx-auto max-w-xl text-center">
        <span aria-hidden className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-[color:var(--accent-fg)] shadow-pop">
          <Mail className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink">Get first dibs on new drops</h2>
        <p className="mt-2 text-sm text-ink-2">
          New designs land in small batches and sell out fast — subscribers always hear first.
        </p>
        <form onSubmit={onSubmit} noValidate className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError(null)
            }}
            placeholder="you@example.com"
            aria-label="Email address"
            aria-invalid={error ? true : undefined}
            aria-describedby="newsletter-error"
            autoComplete="email"
            className="h-11 flex-1 bg-surface"
          />
          <Button type="submit" size="lg" className="shrink-0">Subscribe</Button>
        </form>
        <p id="newsletter-error" aria-live="polite" className="mt-2 min-h-[18px] text-xs font-medium text-critical">
          {error ?? ''}
        </p>
        <p className="text-xs text-ink-3">No spam, ever — just new pieces, restocks, and the odd discount.</p>
      </div>
    </section>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StoreHome() {
  const settings = useStore((s) => s.settings)
  const products = useStore((s) => s.products)
  const orders = useStore((s) => s.orders)

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products])

  /** Top 4 best sellers (active only), padded with other active products */
  const featured = useMemo(() => {
    const byId = new Map(activeProducts.map((p) => [p.id, p]))
    const picks: Product[] = []
    for (const stat of bestSellers(orders)) {
      const p = byId.get(stat.productId)
      if (p && !picks.includes(p)) picks.push(p)
      if (picks.length === 4) break
    }
    for (const p of activeProducts) {
      if (picks.length >= 4) break
      if (!picks.includes(p)) picks.push(p)
    }
    return picks
  }, [orders, activeProducts])

  /** One tile per category that has at least one active product */
  const categories = useMemo(() => {
    const map = new Map<string, { name: string; count: number; rep: Product }>()
    for (const p of activeProducts) {
      const entry = map.get(p.category)
      if (entry) entry.count += 1
      else map.set(p.category, { name: p.category, count: 1, rep: p })
    }
    return [...map.values()]
  }, [activeProducts])

  /** Decorative hero art from real products (deduped emojis) */
  const heroEmojis = useMemo(
    () => [...new Set(activeProducts.map((p) => p.image))].slice(0, HERO_SPOTS.length),
    [activeProducts],
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="space-y-14 sm:space-y-16">
        <div>
          <Hero heroEmojis={heroEmojis} />
          <TrustStrip />
        </div>

        {/* Best sellers */}
        <section id="best-sellers" className="scroll-mt-24">
          <SectionHeading
            title="Best sellers"
            subtitle="The pieces our customers keep coming back for."
            viewAll
          />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {featured.map((p, i) => (
              <StoreProductCard
                key={p.id}
                product={p}
                badge={
                  i === 0 ? (
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 shadow-soft">
                      👑 Best seller
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        </section>

        {/* Shop by category */}
        <section>
          <SectionHeading title="Shop by category" subtitle="Find your kind of delightful." />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.map((c) => (
              <Link
                key={c.name}
                to={`/store/shop?cat=${encodeURIComponent(c.name)}`}
                className="group card flex flex-col items-center gap-1 p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-pop"
              >
                <span
                  aria-hidden
                  className="mb-1.5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl transition-transform duration-300 group-hover:scale-110"
                  style={tileGradient(c.rep)}
                >
                  {c.rep.image}
                </span>
                <span className="text-sm font-semibold text-ink">{c.name}</span>
                <span className="text-xs text-ink-3">
                  {c.count} {c.count === 1 ? 'item' : 'items'}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* About the maker */}
        <section className="card overflow-hidden p-0">
          <div className="grid sm:grid-cols-[240px_1fr]">
            <div aria-hidden className="flex min-h-[160px] items-center justify-center brand-gradient-soft text-7xl">
              {settings.logoEmoji}
            </div>
            <div className="p-6 sm:p-8">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-strong dark:text-accent">
                About the maker
              </div>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-ink">
                Hi, I&rsquo;m {settings.ownerName} — the maker behind {settings.businessName}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                {settings.businessName} started with a single printer on a kitchen table and a stubborn belief that
                everyday objects should be a little more delightful. Every design is still modeled in-house, printed on
                our own machines in small batches, and hand-finished one piece at a time.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                Nothing here sits in a warehouse. When you order, your piece comes from a fresh batch — or is printed
                just for you — then quality-checked and packed with care before it heads your way.
              </p>
            </div>
          </div>
        </section>

        <NewsletterSignup />
      </div>
    </div>
  )
}
