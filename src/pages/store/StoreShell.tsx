// Customer-facing storefront shell — the site's public face, served at the
// root. Shares the workspace's theme/accent so the shop matches the brand;
// the admin lives separately under /admin.

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ArrowLeft, ChevronDown, CircleUserRound, Instagram, Moon, ShoppingBag, Sun, X, Youtube } from 'lucide-react'
import { Toaster } from '@/components/ui/Toaster'
import { ErrorState } from '@/components/ui/EmptyState'
import { useUI } from '@/store/useUI'
import { api } from '@/lib/api'
import { setDisplayCurrency } from '@/lib/format'
import { useCatalog } from '@/store/useCatalog'
import { useCart, useCartDetails } from '@/store/useCart'
import { useStoreTheme } from '@/store/useStoreTheme'
import { useStoreCurrency } from '@/store/useStoreCurrency'
import { useShopAccount } from '@/store/useShopAccount'
import { DISPLAY_CURRENCIES, type DisplayCurrencyCode } from '@/data/types'
import { CartDrawer } from './CartDrawer'
import { cn } from '@/lib/utils'

const NAV = [
  { path: '/', label: 'Home', end: true },
  { path: '/shop', label: 'Shop', end: false },
]

function PreviewBanner() {
  const [dismissed, setDismissed] = useState(false)
  // Only the signed-in owner sees this bar — customers get a clean shop
  const [isOwner, setIsOwner] = useState(false)
  useEffect(() => {
    api
      .me()
      .then((r) => setIsOwner(Boolean(r.user)))
      .catch(() => setIsOwner(false))
  }, [])
  if (dismissed || !isOwner) return null
  return (
    <div className="flex items-center justify-center gap-3 bg-accent px-4 py-1.5 text-[13px] font-medium text-[color:var(--accent-fg)]">
      <span className="truncate">You&rsquo;re viewing your live storefront — customers don&rsquo;t see this bar.</span>
      <Link to="/admin" className="flex shrink-0 items-center gap-1 underline underline-offset-2 hover:opacity-80">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to admin
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss preview banner"
        className="shrink-0 rounded p-0.5 hover:bg-white/20"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// Real SVG flags (src/assets/flags, from flag-icons, MIT) — emoji flags render
// as bare letter pairs on Chrome for Windows, so images are the only way
// every visitor actually sees a flag.
import flagUS from '@/assets/flags/us.svg'
import flagEU from '@/assets/flags/eu.svg'
import flagJP from '@/assets/flags/jp.svg'
import flagGB from '@/assets/flags/gb.svg'
import flagCN from '@/assets/flags/cn.svg'
import flagAU from '@/assets/flags/au.svg'
import flagCA from '@/assets/flags/ca.svg'
import flagCH from '@/assets/flags/ch.svg'
import flagHK from '@/assets/flags/hk.svg'
import flagSG from '@/assets/flags/sg.svg'

const CURRENCY_META: Record<DisplayCurrencyCode, { flag: string; name: string }> = {
  USD: { flag: flagUS, name: 'US Dollar' },
  EUR: { flag: flagEU, name: 'Euro' },
  JPY: { flag: flagJP, name: 'Japanese Yen' },
  GBP: { flag: flagGB, name: 'British Pound' },
  CNY: { flag: flagCN, name: 'Chinese Yuan' },
  AUD: { flag: flagAU, name: 'Australian Dollar' },
  CAD: { flag: flagCA, name: 'Canadian Dollar' },
  CHF: { flag: flagCH, name: 'Swiss Franc' },
  HKD: { flag: flagHK, name: 'Hong Kong Dollar' },
  SGD: { flag: flagSG, name: 'Singapore Dollar' },
}

function Flag({ code, className }: { code: DisplayCurrencyCode; className?: string }) {
  return (
    <img
      src={CURRENCY_META[code].flag}
      alt=""
      aria-hidden
      className={cn('h-3.5 w-5 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10 dark:ring-white/10', className)}
    />
  )
}

/** Compact currency picker — only currencies the day's rate sheet covers.
 *  A custom listbox (not a native select) because option rows carry flag
 *  images, which <option> can't. */
function CurrencySelect() {
  const shop = useCatalog((s) => s.shop)
  const selected = useStoreCurrency((s) => s.selected)
  const setSelected = useStoreCurrency((s) => s.setSelected)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Outside click / Escape closes the menu
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const rates = shop?.currencyRates?.rates
  if (!shop || !rates) return null
  const options = DISPLAY_CURRENCIES.filter((c) => c === shop.currency || Number(rates[c]) > 0)
  if (options.length < 2) return null
  const value = selected && options.includes(selected) ? selected : shop.currency

  const moveFocus = (delta: number) => {
    const items = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(at + delta + items.length) % items.length]?.focus()
  }

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      title="Prices convert at today's rate — the shop charges in its own currency"
    >
      <button
        type="button"
        aria-label="Display currency"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink focus:outline-none"
      >
        <Flag code={value as DisplayCurrencyCode} />
        {value}
        <ChevronDown className={cn('h-3.5 w-3.5 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Display currency"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1) }
            if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1) }
          }}
          className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-xl border border-edge bg-surface p-1 shadow-pop"
        >
          {options.map((c) => {
            const active = c === value
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={active}
                autoFocus={active}
                onClick={() => {
                  setSelected(c)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  active
                    ? 'bg-accent-wash font-semibold text-accent-strong dark:text-accent'
                    : 'text-ink-2 hover:bg-sunken hover:text-ink',
                )}
              >
                <Flag code={c} />
                <span className="w-10 shrink-0 font-medium">{c}</span>
                <span className="truncate text-[13px] font-normal text-ink-3">{CURRENCY_META[c].name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StoreHeader() {
  const shop = useCatalog((s) => s.shop)
  const setDrawerOpen = useCart((s) => s.setDrawerOpen)
  const { count } = useCartDetails()
  const theme = useStoreTheme((s) => s.theme)
  const toggleTheme = useStoreTheme((s) => s.toggle)
  const signedIn = useShopAccount((s) => Boolean(s.account))

  return (
    <header
      className="sticky top-0 z-30 border-b border-hairline backdrop-blur-md"
      // Tailwind can't alpha the --surface var (no <alpha-value>), so mix it here
      style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 82%, transparent)' }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <img src="/brand/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-full ring-1 ring-edge" />
          <span className="truncate text-[15px] font-semibold text-ink">{shop?.businessName ?? 'Shop'}</span>
        </Link>

        <nav className="flex flex-1 items-center gap-1" aria-label="Store">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent-wash text-accent-strong dark:text-accent' : 'text-ink-2 hover:bg-sunken hover:text-ink',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <CurrencySelect />

        <Link
          to="/account"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
          aria-label={signedIn ? 'Your account' : 'Sign in or create an account'}
          title={signedIn ? 'Your account' : 'Sign in'}
        >
          <CircleUserRound className={cn('h-[19px] w-[19px]', signedIn && 'text-accent-strong dark:text-accent')} />
        </Link>

        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        <button
          onClick={() => setDrawerOpen(true)}
          className="relative flex items-center gap-2 rounded-xl border border-edge bg-surface px-3.5 py-2 text-sm font-medium text-ink shadow-soft transition-all hover:shadow-pop active:scale-[0.98]"
          aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}
        >
          <ShoppingBag className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">Cart</span>
          {count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-[color:var(--accent-fg)]">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}

// lucide-react has no TikTok/Etsy marks, so these two are inlined (simple-icons paths)
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

function EtsyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M8.559 2.445c0-.325.033-.52.59-.52h7.465c1.3 0 2.02 1.11 2.54 3.193l.42 1.666h1.27c.23-4.728.43-6.784.43-6.784s-3.196.36-5.09.36H6.635L1.521.196v1.37l1.725.326c1.21.24 1.5.496 1.6 1.606 0 0 .11 3.27.11 8.64 0 5.385-.09 8.61-.09 8.61 0 .973-.39 1.333-1.59 1.573l-1.722.33V24l5.13-.165h8.55c1.935 0 6.39.165 6.39.165.105-1.17.75-6.48.855-7.064h-1.2l-1.284 2.91c-1.005 2.28-2.476 2.445-4.11 2.445h-4.906c-1.63 0-2.415-.64-2.415-2.05V12.8s3.62 0 4.79.096c.912.064 1.463.325 1.76 1.598l.39 1.695h1.41l-.09-4.278.192-4.305h-1.391l-.45 1.89c-.283 1.244-.48 1.47-1.754 1.6-1.666.17-4.815.14-4.815.14V2.45h-.05z" />
    </svg>
  )
}

function StoreFooter() {
  const shop = useCatalog((s) => s.shop)
  if (!shop) return null
  // Only profiles the owner actually filled in — no socials, no row
  const socials = [
    { href: shop.social.instagram, label: 'Instagram', Icon: Instagram },
    { href: shop.social.tiktok, label: 'TikTok', Icon: TikTokIcon },
    { href: shop.social.youtube, label: 'YouTube', Icon: Youtube },
    { href: shop.social.etsy, label: 'Etsy', Icon: EtsyIcon },
  ].filter((s) => s.href)
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <img src="/brand/logo.png" alt="" className="h-9 w-9 rounded-full ring-1 ring-edge" />
              <span className="text-[15px] font-semibold text-ink">{shop.businessName}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-3">{shop.tagline}</p>
            {socials.length > 0 && (
              <div className="mt-4 flex items-center gap-1">
                {socials.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="rounded-lg p-1.5 text-ink-3 transition-colors hover:text-ink"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-12 text-sm">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Shop</div>
              <div className="space-y-1.5">
                <Link to="/" className="block text-ink-2 hover:text-ink">Home</Link>
                <Link to="/shop" className="block text-ink-2 hover:text-ink">All products</Link>
                <Link to="/track" className="block text-ink-2 hover:text-ink">Track your order</Link>
                <Link to="/support" className="block text-ink-2 hover:text-ink">Get help</Link>
                <Link to="/policies" className="block text-ink-2 hover:text-ink">Policies</Link>
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Contact</div>
              <div className="space-y-1.5 text-ink-2">
                {shop.email && <a href={`mailto:${shop.email}`} className="block hover:text-ink">{shop.email}</a>}
                {(shop.city || shop.state) && <div>{[shop.city, shop.state].filter(Boolean).join(', ')}</div>}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-hairline pt-5 text-xs text-ink-3">
          <span>
            © {new Date().getFullYear()} {shop.businessName}
          </span>
          <span>Made in Canada 🍁</span>
        </div>
      </div>
    </footer>
  )
}

/**
 * Last line of defense for the storefront: a page that throws (or a chunk
 * that can't load even after lazyReload's one retry) shows a friendly retry
 * card instead of unmounting the whole app into a blank page. Keyed on the
 * pathname so back/forward navigation gets a fresh attempt automatically.
 */
class StoreErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto w-full max-w-lg px-4 py-20">
          <ErrorState
            title="This page hit a snag"
            description="Something went wrong loading this page — usually a refresh sorts it right out."
            onRetry={() => window.location.reload()}
          />
          {/* The raw error, small — a screenshot of this card IS the bug report */}
          <p className="mt-4 break-words text-center font-mono text-[11px] leading-relaxed text-ink-3 opacity-70">
            {String(this.state.error.message || this.state.error).slice(0, 300)}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

function StoreFallback() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="skeleton mb-6 h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

/**
 * The storefront always wears the shop's brand accent (the "tinymagic"
 * sage/pink preset drawn from the logo) and follows the VISITOR's theme
 * choice — soft cream by default, dark via the header toggle. Both are
 * independent of the owner's admin theme, which is restored when they hop
 * back to /admin.
 */
function useStorefrontTheme() {
  const shop = useCatalog((s) => s.shop)
  const theme = useStoreTheme((s) => s.theme)
  useEffect(() => {
    const el = document.documentElement
    const wasDark = el.classList.contains('dark')
    const prevAccent = el.getAttribute('data-accent')
    el.setAttribute('data-storefront', '1')
    el.setAttribute('data-accent', 'tinymagic')
    return () => {
      el.removeAttribute('data-storefront')
      el.classList.toggle('dark', wasDark)
      if (prevAccent) el.setAttribute('data-accent', prevAccent)
      else el.removeAttribute('data-accent')
    }
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  // Shop-branded tab: title + logo favicon (restored for the admin on unmount)
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    const prevHref = icon?.href
    const prevTitle = document.title
    if (icon) icon.href = '/brand/favicon.png'
    if (shop) document.title = `${shop.businessName} — ${shop.tagline || 'made with magic'}`
    return () => {
      if (icon && prevHref) icon.href = prevHref
      document.title = prevTitle
    }
  }, [shop])
}

/**
 * Applies the visitor's display currency to the money formatters. Runs during
 * render (not in an effect) so the page tree below — remounted via key when
 * the currency changes — formats with the new currency on its first paint.
 */
function useDisplayCurrency(): string {
  const shop = useCatalog((s) => s.shop)
  const selected = useStoreCurrency((s) => s.selected)
  const rates = shop?.currencyRates?.rates
  const rate = selected && rates ? Number(rates[selected]) : 0
  const active = shop && selected && selected !== shop.currency && rate > 0 ? selected : null
  setDisplayCurrency(active, rate)
  useEffect(() => () => setDisplayCurrency(null), [])
  return active ?? shop?.currency ?? 'shop'
}

export function StoreShell() {
  useStorefrontTheme()
  const displayCur = useDisplayCurrency()
  const reduceMotion = useUI((s) => s.reduceMotion)
  const { pathname } = useLocation()
  // Braces matter: system software (scroll utilities, "web protection") can
  // patch window.scrollTo to RETURN a value — a concise arrow would hand that
  // to React as an effect cleanup, crashing every navigation on that machine.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // The signed-in shopper (if any) — header state + checkout prefill
  const loadAccount = useShopAccount((s) => s.load)
  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  // Warm every storefront chunk once the first paint settles. Deploys rename
  // the hashed files, so a page fetched only when clicked could 404 for tabs
  // opened before the deploy — fetched NOW, it lives in the module cache and
  // clicking Account (or checkout…) hours later just works.
  useEffect(() => {
    const warm = () =>
      void Promise.allSettled([
        import('@/pages/store/StoreHome'),
        import('@/pages/store/StoreShop'),
        import('@/pages/store/StoreProduct'),
        import('@/pages/store/StoreCheckout'),
        import('@/pages/store/StoreConfirmation'),
        import('@/pages/store/StoreTrack'),
        import('@/pages/store/StorePolicies'),
        import('@/pages/store/StoreAccount'),
        import('@/pages/store/StoreSupport'),
      ])
    const w = window as Window & { requestIdleCallback?: (fn: () => void) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(warm)
    else setTimeout(warm, 2000)
  }, [])

  // The storefront runs off the public catalog API — load it once, refresh on focus
  const load = useCatalog((s) => s.load)
  const status = useCatalog((s) => s.status)
  useEffect(() => {
    void load()
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [load])

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <div className="flex min-h-screen flex-col bg-page">
        {/* Outer boundary: a crash in the HEADER or cart drawer (they render
            on every page) must show a retry card, not unmount the app into a
            blank page. The inner boundary keeps page errors from taking the
            chrome down with them. */}
        <StoreErrorBoundary resetKey={`shell-${pathname}`}>
          <PreviewBanner />
          <StoreHeader />
          {/* Keyed on the display currency: memoized price strings anywhere in
              the tree re-derive the moment the visitor switches currency */}
          <main className="flex-1" key={`main-${displayCur}`}>
            {status === 'error' ? (
              <div className="mx-auto w-full max-w-lg px-4 py-20">
                <ErrorState
                  title="The shop is taking a quick break"
                  description="We couldn't reach the store server. Try again in a moment."
                  onRetry={() => void load(true)}
                />
              </div>
            ) : status === 'ready' ? (
              <StoreErrorBoundary resetKey={pathname}>
                <Suspense fallback={<StoreFallback />}>
                  <Outlet />
                </Suspense>
              </StoreErrorBoundary>
            ) : (
              <StoreFallback />
            )}
          </main>
          <StoreFooter />
          <CartDrawer key={`cart-${displayCur}`} />
        </StoreErrorBoundary>
        <Toaster />
      </div>
    </MotionConfig>
  )
}
