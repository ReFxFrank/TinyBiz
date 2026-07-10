// Storefront home — the shop's landing page. Cinematic hero, emoji marquee,
// owner-managed announcement banner, trust strip, best sellers, catalog stats,
// category tiles, maker story, and a newsletter signup that writes straight
// into the admin Subscribers list.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, HeartHandshake, Mail, Megaphone, ShoppingBag, Sparkles, Truck } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { StoreProductCard } from './StoreProductCard'
import { useCatalog } from '@/store/useCatalog'
import { FREE_SHIPPING_OVER } from '@/store/useCart'
import { toast } from '@/store/useUI'
import { api, ApiError } from '@/lib/api'
import { emojify } from '@/lib/emoji'
import { resolveStorefrontCopy } from '@/lib/storefrontCopy'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from '@/data/types'

/** Same soft-gradient artwork recipe as StoreProductCard */
const tileGradient = (p: Product) => ({
  background: `linear-gradient(135deg, hsl(${p.imageHue}, 70%, 92%), hsl(${(p.imageHue + 40) % 360}, 60%, 86%))`,
})

/** The owner-editable wording, resolved against the live shop identity */
function useStorefrontCopy() {
  const shop = useCatalog((s) => s.shop)
  return useMemo(
    () =>
      resolveStorefrontCopy(shop?.storefront, {
        businessName: shop?.businessName ?? 'Our shop',
        ownerName: shop?.ownerName ?? '',
        city: shop?.city ?? '',
        shippingRegion: shop?.shippingRegion ?? '',
        freeShippingOver: shop?.freeShippingOver ?? FREE_SHIPPING_OVER,
      }),
    [shop],
  )
}

/** Shared whileInView reveal for section-level entrances */
const REVEAL = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.55, ease: 'easeOut' },
} as const

// ── Hero ─────────────────────────────────────────────────────────────────────

/** Where the decorative product emojis sit inside the hero, plus their float */
const HERO_SPOTS: { pos: string; size: string; rot: string; delay: string }[] = [
  { pos: 'left-[4%] top-[16%]', size: 'text-4xl sm:text-5xl', rot: '-12deg', delay: '0s' },
  { pos: 'right-[5%] top-[22%]', size: 'text-4xl sm:text-5xl', rot: '10deg', delay: '-1.7s' },
  { pos: 'left-[13%] bottom-[14%]', size: 'text-3xl sm:text-4xl', rot: '6deg', delay: '-3.2s' },
  { pos: 'right-[14%] bottom-[12%]', size: 'text-3xl sm:text-4xl', rot: '-8deg', delay: '-4.5s' },
  { pos: 'hidden sm:block left-[26%] top-[8%]', size: 'text-3xl', rot: '4deg', delay: '-2.4s' },
  { pos: 'hidden sm:block right-[27%] bottom-[6%]', size: 'text-3xl', rot: '-5deg', delay: '-5.1s' },
]

function Hero({ heroEmojis }: { heroEmojis: string[] }) {
  const shop = useCatalog((s) => s.shop)
  const hasProducts = useCatalog((s) => s.products.some((p) => p.active))
  const copy = useStorefrontCopy()
  if (!shop) return null
  return (
    <section className="tb-noise relative overflow-hidden rounded-3xl border border-hairline bg-surface px-6 py-20 sm:px-12 sm:py-28">
      {/* Aurora wash — accent, pop, and one warm ember */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="aurora-orb left-[-8%] top-[-22%] h-72 w-72" style={{ background: 'var(--accent)' }} />
        <div
          className="aurora-orb right-[-10%] top-[6%] h-80 w-80"
          style={{ background: 'var(--pop)', animationDelay: '-6s' }}
        />
        <div
          className="aurora-orb bottom-[-34%] left-[32%] h-64 w-64 opacity-[0.14]"
          style={{ background: 'var(--pop)', animationDelay: '-11s' }}
        />
      </div>

      {/* Floating product art — purely decorative, drawn from the live catalog */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
        {heroEmojis.map((emoji, i) => (
          <span
            key={i}
            className={cn('tb-bob absolute opacity-30', HERO_SPOTS[i].pos, HERO_SPOTS[i].size)}
            style={{ '--bob-rot': HERO_SPOTS[i].rot, animationDelay: HERO_SPOTS[i].delay } as CSSProperties}
          >
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
        <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-raised/70 px-4 py-1.5 text-xs font-medium tracking-wide text-ink-2 backdrop-blur">
          <span aria-hidden className="text-accent">✦</span>
          {copy.heroBadge}
        </span>

        <div className="mt-7">
          <img
            src="/brand/logo.png"
            alt=""
            className="tb-bob mx-auto h-24 w-24 rounded-full shadow-pop ring-2 ring-edge sm:h-28 sm:w-28"
            style={{ '--bob-rot': '-2deg', animationDelay: '-2s' } as CSSProperties}
          />
        </div>

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-ink sm:text-6xl">
          <span className="shimmer-text">{shop.businessName}</span>
        </h1>
        <p className="mt-4 text-lg font-medium text-ink-2 sm:text-xl">{shop.tagline}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-3">{copy.heroSubtext}</p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <span className="glow-halo inline-flex rounded-xl">
            <Link to="/shop">
              <Button size="lg" icon={<ShoppingBag />}>Shop the collection</Button>
            </Link>
          </span>
          {hasProducts && (
            <a href="#best-sellers">
              <Button size="lg" variant="outline" className="bg-transparent backdrop-blur hover:bg-raised">
                Best sellers
              </Button>
            </a>
          )}
        </div>
      </motion.div>
    </section>
  )
}

// ── Emoji marquee — the catalog rolling by between hero and content ──────────

function EmojiMarquee({ products: allProducts }: { products: Product[] }) {
  // Cap the strip so the fixed 36s roll stays slow and readable on big catalogs
  const products = allProducts.slice(0, 20)
  if (!products.length) return null
  const strip = (hidden: boolean) => (
    <div aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-3 pr-3">
      {products.map((p) => (
        <span
          key={p.id}
          className="flex items-center gap-2.5 rounded-full border border-hairline bg-surface py-1.5 pl-1.5 pr-4"
        >
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full text-base" style={tileGradient(p)}>
            {p.image}
          </span>
          <span className="whitespace-nowrap text-xs font-medium text-ink-2">{p.name}</span>
        </span>
      ))}
    </div>
  )
  return (
    <div className="tb-marquee mt-5">
      <div className="tb-marquee-track">
        {strip(false)}
        {strip(true)}
      </div>
    </div>
  )
}

// ── Promo banner — owner-managed announcement strip under the hero ───────────

function PromoBannerStrip() {
  const banner = useCatalog((s) => s.shop?.promoBanner)
  if (!banner?.enabled || !banner.heading.trim()) return null

  const linkUrl = banner.linkUrl?.trim() ?? ''
  const linkLabel = banner.linkLabel?.trim() ?? ''
  const ctaButton = (
    <Button size="sm" className="w-full sm:w-auto">
      {linkLabel} <ArrowRight className="h-4 w-4" />
    </Button>
  )

  return (
    <motion.section {...REVEAL} aria-label="Announcement" className="mt-5">
      <div className="glass relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] px-5 py-4 shadow-pop sm:flex-row sm:items-center sm:justify-between sm:px-6">
        {/* Accent wash — brightest at the edges so the copy stays readable */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent-wash via-transparent to-accent-wash" />
        <div className="relative flex min-w-0 items-start gap-3.5 sm:items-center">
          {banner.imageUrl ? (
            <img
              src={banner.imageUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-xl border border-hairline object-cover shadow-soft sm:h-16 sm:w-16"
            />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-strong dark:text-accent">
              <Megaphone className="h-[18px] w-[18px]" />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-base font-bold tracking-tight text-ink">{emojify(banner.heading)}</p>
            {banner.body?.trim() && <p className="mt-0.5 text-sm text-ink-2">{emojify(banner.body)}</p>}
          </div>
        </div>
        {linkUrl && linkLabel && (
          <div className="relative shrink-0">
            {linkUrl.startsWith('/') ? (
              <Link to={linkUrl} className="block">
                {ctaButton}
              </Link>
            ) : (
              <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
                {ctaButton}
              </a>
            )}
          </div>
        )}
      </div>
    </motion.section>
  )
}

// ── Trust strip ──────────────────────────────────────────────────────────────

function TrustStrip() {
  const copy = useStorefrontCopy()
  const props = [
    { icon: Truck, title: copy.trust1Title, body: copy.trust1Body },
    { icon: Sparkles, title: copy.trust2Title, body: copy.trust2Body },
    { icon: HeartHandshake, title: copy.trust3Title, body: copy.trust3Body },
  ]
  return (
    <section className="mt-5 grid gap-3 sm:grid-cols-3 sm:gap-4">
      {props.map(({ icon: Icon, title, body }, i) => (
        <motion.div
          key={title}
          {...REVEAL}
          transition={{ ...REVEAL.transition, delay: i * 0.08 }}
          className="glass flex items-center gap-3.5 rounded-2xl border border-hairline px-5 py-4"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-strong dark:text-accent">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink">{title}</div>
            <div className="truncate text-xs text-ink-3">{body}</div>
          </div>
        </motion.div>
      ))}
    </section>
  )
}

// ── Section heading ──────────────────────────────────────────────────────────

function SectionHeading({
  kicker,
  title,
  subtitle,
  viewAll,
}: {
  kicker?: string
  title: string
  subtitle: string
  viewAll?: boolean
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {kicker && (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{kicker}</div>
        )}
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
      </div>
      {viewAll && (
        <Link
          to="/shop"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent-strong hover:underline dark:text-accent"
        >
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

// ── By the numbers — catalog-derived stats with a count-up ───────────────────

/** rAF count-up that jumps straight to the target under prefers-reduced-motion */
function useCountUp(target: number, start: boolean, duration = 1100): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!start) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      if (p >= 1) {
        setValue(target)
        return
      }
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, start, duration])
  return value
}

function StatsBand({ designs, collections, threshold }: { designs: number; collections: number; threshold: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const d = useCountUp(designs, inView)
  const c = useCountUp(collections, inView)
  const t = useCountUp(threshold, inView)
  const stats = [
    { value: String(d), label: 'original designs' },
    { value: String(c), label: c === 1 ? 'collection' : 'collections' },
    { value: money(t), label: 'free-shipping threshold' },
  ]
  return (
    <motion.section {...REVEAL}>
      <div
        ref={ref}
        className="tb-noise relative overflow-hidden rounded-3xl border border-hairline bg-surface px-6 py-10 sm:px-12"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="aurora-orb left-[-6%] top-[-60%] h-56 w-56 opacity-25" style={{ background: 'var(--accent)' }} />
          <div
            className="aurora-orb bottom-[-70%] right-[-4%] h-56 w-56 opacity-25"
            style={{ background: 'var(--pop)', animationDelay: '-8s' }}
          />
        </div>
        <div className="relative grid gap-8 text-center sm:grid-cols-3">
          {stats.map(({ value, label }) => (
            <div key={label}>
              <div className="tnum text-4xl font-extrabold tracking-tight text-ink">{value}</div>
              <div className="mt-1.5 text-sm text-ink-3">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

// ── Newsletter signup — writes into the real subscribers collection ──────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function NewsletterSignup() {
  const copy = useStorefrontCopy()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Please enter a valid email address.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await api.subscribe(value)
      if (res.already) toast('You are already on the list', { tone: 'default' })
      else toast("You're in!", { description: 'Watch your inbox for the next drop.', tone: 'success' })
      setEmail('')
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 0 ? 'That email doesn’t look right.' : 'Could not subscribe right now — try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section {...REVEAL}>
      <div className="tb-noise relative overflow-hidden rounded-3xl border border-hairline bg-surface px-6 py-14 sm:px-12 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="aurora-orb left-[-10%] top-[-40%] h-72 w-72 opacity-[0.18]" style={{ background: 'var(--pop)' }} />
          <div
            className="aurora-orb bottom-[-50%] right-[-8%] h-72 w-72 opacity-[0.16]"
            style={{ background: 'var(--accent)', animationDelay: '-7s' }}
          />
        </div>
        <div className="relative mx-auto max-w-xl text-center">
          <span aria-hidden className="inline-flex h-11 w-11 items-center justify-center rounded-xl brand-gradient text-[color:var(--accent-fg)] shadow-pop">
            <Mail className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{copy.newsletterHeading}</h2>
          <p className="mt-2 text-sm text-ink-2">
            {copy.newsletterSubtext}
          </p>
          <form onSubmit={onSubmit} noValidate className="mx-auto mt-7 flex max-w-md flex-col gap-2 sm:flex-row">
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
              className="h-11 flex-1 bg-raised"
            />
            <span className="glow-halo inline-flex shrink-0 rounded-xl">
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? 'Subscribing…' : 'Subscribe'}
              </Button>
            </span>
          </form>
          <p id="newsletter-error" aria-live="polite" className="mt-2 min-h-[18px] text-xs font-medium text-critical">
            {error ?? ''}
          </p>
          <p className="text-xs text-ink-3">{copy.newsletterFinePrint}</p>
        </div>
      </div>
    </motion.section>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StoreHome() {
  const shop = useCatalog((s) => s.shop)
  const copy = useStorefrontCopy()
  const products = useCatalog((s) => s.products)
  const bestSellerIds = useCatalog((s) => s.bestSellerIds)
  const threshold = useCatalog((s) => s.shop?.freeShippingOver ?? FREE_SHIPPING_OVER)

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products])

  /** Top 4 best sellers (server-ranked), padded with other active products */
  const featured = useMemo(() => {
    const byId = new Map(activeProducts.map((p) => [p.id, p]))
    const picks: Product[] = []
    for (const id of bestSellerIds) {
      const p = byId.get(id)
      if (p && !picks.includes(p)) picks.push(p)
      if (picks.length === 4) break
    }
    for (const p of activeProducts) {
      if (picks.length >= 4) break
      if (!picks.includes(p)) picks.push(p)
    }
    return picks
  }, [bestSellerIds, activeProducts])

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
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6">
      <div className="space-y-16 sm:space-y-20">
        <div>
          <Hero heroEmojis={heroEmojis} />
          <EmojiMarquee products={activeProducts} />
          <PromoBannerStrip />
          <TrustStrip />
        </div>

        {/* Best sellers — hidden until the catalog has products */}
        {featured.length > 0 && (
        <section id="best-sellers" className="scroll-mt-24">
          <motion.div {...REVEAL}>
            <SectionHeading
              kicker="Fresh off the printer"
              title="Best sellers"
              subtitle="The pieces our customers keep coming back for."
              viewAll
            />
          </motion.div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {featured.map((p, i) => (
              <motion.div key={p.id} {...REVEAL} transition={{ ...REVEAL.transition, delay: i * 0.07 }}>
                <div className="glow-card h-full rounded-2xl">
                  <StoreProductCard
                    product={p}
                    badge={
                      i === 0 ? (
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 shadow-soft">
                          👑 Best seller
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </section>
        )}

        {/* By the numbers — straight from the live catalog */}
        {activeProducts.length > 0 && (
          <StatsBand designs={activeProducts.length} collections={categories.length} threshold={threshold} />
        )}

        {/* Shop by category */}
        {categories.length > 0 && (
        <section>
          <motion.div {...REVEAL}>
            <SectionHeading kicker="Browse" title="Shop by category" subtitle="Find your kind of delightful." />
          </motion.div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.map((c, i) => (
              <motion.div key={c.name} {...REVEAL} transition={{ ...REVEAL.transition, delay: i * 0.06 }}>
                <Link
                  to={`/shop?cat=${encodeURIComponent(c.name)}`}
                  className="group card glow-card flex flex-col items-center gap-1 p-4 text-center hover:-translate-y-0.5"
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
              </motion.div>
            ))}
          </div>
        </section>
        )}

        {/* About the maker */}
        <motion.section {...REVEAL}>
          <div className="tb-noise relative overflow-hidden rounded-3xl border border-hairline bg-surface">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="aurora-orb left-[-6%] top-[-50%] h-64 w-64 opacity-30" style={{ background: 'var(--accent)' }} />
              <div
                className="aurora-orb bottom-[-60%] right-[-6%] h-64 w-64 opacity-[0.18]"
                style={{ background: 'var(--pop)', animationDelay: '-9s' }}
              />
            </div>
            <div className="relative grid sm:grid-cols-[260px_1fr]">
              <div aria-hidden className="flex min-h-[180px] items-center justify-center brand-gradient-soft">
                {/* The owner's photo when they've added one, else the shop logo */}
                <img
                  src={shop?.makerPhoto || '/brand/logo.png'}
                  alt=""
                  className="tb-bob h-32 w-32 rounded-full object-cover shadow-lifted ring-2 ring-edge sm:h-36 sm:w-36"
                  style={{ '--bob-rot': '-4deg' } as CSSProperties}
                />
              </div>
              <div className="p-6 sm:p-10">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-strong dark:text-accent">
                  About the maker
                </div>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">{copy.aboutHeading}</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-2">{copy.aboutBody1}</p>
                {copy.aboutBody2 && (
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-2">{copy.aboutBody2}</p>
                )}
              </div>
            </div>
          </div>
        </motion.section>

        <NewsletterSignup />
      </div>
    </div>
  )
}
