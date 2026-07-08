// Customer-facing storefront shell — no admin chrome. Shares the workspace's
// theme/accent so the shop matches the brand, but everything a shopper sees
// lives under /store with its own header, footer, and cart.

import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ArrowLeft, ShoppingBag, X } from 'lucide-react'
import { useApplyTheme } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/Toaster'
import { ErrorState } from '@/components/ui/EmptyState'
import { useUI } from '@/store/useUI'
import { api } from '@/lib/api'
import { useCatalog } from '@/store/useCatalog'
import { useCart, useCartDetails } from '@/store/useCart'
import { CartDrawer } from './CartDrawer'
import { cn } from '@/lib/utils'

const NAV = [
  { path: '/store', label: 'Home', end: true },
  { path: '/store/shop', label: 'Shop', end: false },
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
      <Link to="/" className="flex shrink-0 items-center gap-1 underline underline-offset-2 hover:opacity-80">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to TinyBiz
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

function StoreHeader() {
  const shop = useCatalog((s) => s.shop)
  const setDrawerOpen = useCart((s) => s.setDrawerOpen)
  const { count } = useCartDetails()

  return (
    <header
      className="sticky top-0 z-30 border-b border-hairline backdrop-blur-md"
      // Tailwind can't alpha the --surface var (no <alpha-value>), so mix it here
      style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 82%, transparent)' }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/store" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl brand-gradient text-lg shadow-pop">
            {shop?.logoEmoji ?? '🛍️'}
          </span>
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

function StoreFooter() {
  const shop = useCatalog((s) => s.shop)
  if (!shop) return null
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient text-lg">
                {shop.logoEmoji}
              </span>
              <span className="text-[15px] font-semibold text-ink">{shop.businessName}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-3">{shop.tagline}</p>
          </div>
          <div className="flex gap-12 text-sm">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Shop</div>
              <div className="space-y-1.5">
                <Link to="/store" className="block text-ink-2 hover:text-ink">Home</Link>
                <Link to="/store/shop" className="block text-ink-2 hover:text-ink">All products</Link>
                <Link to="/store/track" className="block text-ink-2 hover:text-ink">Track your order</Link>
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Contact</div>
              <div className="space-y-1.5 text-ink-2">
                <div>{shop.email}</div>
                <div>
                  {shop.city}, {shop.state}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-hairline pt-5 text-xs text-ink-3">
          <span>
            © {new Date().getFullYear()} {shop.businessName}
          </span>
          <span>
            Powered by <span className="font-semibold text-ink-2">TinyBiz</span>
          </span>
        </div>
      </div>
    </footer>
  )
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

export function StoreShell() {
  useApplyTheme()
  const reduceMotion = useUI((s) => s.reduceMotion)
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])

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
        <PreviewBanner />
        <StoreHeader />
        <main className="flex-1">
          {status === 'error' ? (
            <div className="mx-auto w-full max-w-lg px-4 py-20">
              <ErrorState
                title="The shop is taking a quick break"
                description="We couldn't reach the store server. Try again in a moment."
                onRetry={() => void load(true)}
              />
            </div>
          ) : status === 'ready' ? (
            <Suspense fallback={<StoreFallback />}>
              <Outlet />
            </Suspense>
          ) : (
            <StoreFallback />
          )}
        </main>
        <StoreFooter />
        <CartDrawer />
        <Toaster />
      </div>
    </MotionConfig>
  )
}
