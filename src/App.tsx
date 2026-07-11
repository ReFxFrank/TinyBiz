import { Suspense, lazy, type ComponentType } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { StoreShell } from '@/pages/store/StoreShell'

/** Legacy /store/* links (bookmarks, old emails) → the same page at the root */
function LegacyStoreRedirect() {
  const { pathname, search } = useLocation()
  return <Navigate to={pathname.replace(/^\/store\/?/, '/') + search} replace />
}

/**
 * lazy() that survives deploys. Every build renames the hashed chunks, so a
 * tab opened before a deploy asks for files that no longer exist the moment
 * it navigates to a not-yet-loaded page — and a failed import used to blank
 * the whole app. Reload once to pick up the fresh index.html; if the chunk
 * is still missing right after that reload, let the error boundary show a
 * real message instead. This is the ONLY chunk-failure handler on purpose:
 * a vite:preloadError listener with preventDefault() makes Vite resolve the
 * import as `undefined` and hard-crashes React lazy.
 */
const RELOAD_STAMP = 'tms-chunk-reload' // "<epoch>:<consecutive count>"
// Storage can be BLOCKED (Chrome site setting, enterprise policy) — the
// recovery path must never die on its own bookkeeping
function safeStorage(fn: () => void) {
  try {
    fn()
  } catch {
    /* storage unavailable — recovery still works, just without the throttle */
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (mod) => {
        safeStorage(() => sessionStorage.removeItem(RELOAD_STAMP))
        return mod
      },
      (err) => {
        let last = 0
        let count = 0
        try {
          const [t, c] = String(sessionStorage.getItem(RELOAD_STAMP) || '0:0').split(':')
          last = Number(t) || 0
          count = Number(c) || 0
        } catch {
          count = 99 // can't track attempts → never auto-reload (no loop risk)
        }
        // At most two automatic reloads, however slowly the failures arrive —
        // a time-only throttle loops forever when each fetch takes >15s to die
        if (count < 2 || Date.now() - last > 10 * 60_000) {
          const next = Date.now() - last > 10 * 60_000 ? 1 : count + 1
          safeStorage(() => sessionStorage.setItem(RELOAD_STAMP, `${Date.now()}:${next}`))
          window.location.reload()
          return new Promise<never>(() => {}) // the reload takes it from here
        }
        throw err
      },
    ),
  )
}

// Admin shells load on demand so the storefront entry chunk stays lean
const AdminApp = lazyReload(() => import('@/AdminApp'))

const Dashboard = lazyReload(() => import('@/pages/Dashboard'))
const Orders = lazyReload(() => import('@/pages/Orders'))
const Support = lazyReload(() => import('@/pages/Support'))
const Inventory = lazyReload(() => import('@/pages/Inventory'))
const Products = lazyReload(() => import('@/pages/Products'))
const Customers = lazyReload(() => import('@/pages/Customers'))
const Suppliers = lazyReload(() => import('@/pages/Suppliers'))
const Expenses = lazyReload(() => import('@/pages/Expenses'))
const Income = lazyReload(() => import('@/pages/Income'))
const Accounting = lazyReload(() => import('@/pages/Accounting'))
const Shipping = lazyReload(() => import('@/pages/Shipping'))
const Manufacturing = lazyReload(() => import('@/pages/Manufacturing'))
const Analytics = lazyReload(() => import('@/pages/Analytics'))
const Marketing = lazyReload(() => import('@/pages/Marketing'))
const Reviews = lazyReload(() => import('@/pages/Reviews'))
const Newsletter = lazyReload(() => import('@/pages/Newsletter'))
const SocialMedia = lazyReload(() => import('@/pages/SocialMedia'))
const CalendarPage = lazyReload(() => import('@/pages/CalendarPage'))
const Tasks = lazyReload(() => import('@/pages/Tasks'))
const Documents = lazyReload(() => import('@/pages/Documents'))
const Employees = lazyReload(() => import('@/pages/Employees'))
const Settings = lazyReload(() => import('@/pages/Settings'))

// Customer-facing storefront (no admin chrome)
const StoreHome = lazyReload(() => import('@/pages/store/StoreHome'))
const StoreShop = lazyReload(() => import('@/pages/store/StoreShop'))
const StoreProduct = lazyReload(() => import('@/pages/store/StoreProduct'))
const StoreCheckout = lazyReload(() => import('@/pages/store/StoreCheckout'))
const StoreConfirmation = lazyReload(() => import('@/pages/store/StoreConfirmation'))
const StoreTrack = lazyReload(() => import('@/pages/store/StoreTrack'))
const StorePolicies = lazyReload(() => import('@/pages/store/StorePolicies'))
const StoreAccount = lazyReload(() => import('@/pages/store/StoreAccount'))
const StoreSupport = lazyReload(() => import('@/pages/store/StoreSupport'))

export default function App() {
  return (
    <Routes>
      {/* The shop IS the site — customers land here */}
      <Route path="/" element={<StoreShell />}>
        <Route index element={<StoreHome />} />
        <Route path="shop" element={<StoreShop />} />
        <Route path="product/:id" element={<StoreProduct />} />
        <Route path="checkout" element={<StoreCheckout />} />
        <Route path="confirmation/:orderId" element={<StoreConfirmation />} />
        <Route path="track" element={<StoreTrack />} />
        <Route path="policies" element={<StorePolicies />} />
        <Route path="account" element={<StoreAccount />} />
        <Route path="support" element={<StoreSupport />} />
      </Route>

      {/* Old /store/* links keep working */}
      <Route path="/store/*" element={<LegacyStoreRedirect />} />
      <Route path="/store" element={<Navigate to="/" replace />} />

      {/* Owner's workspace — sign-in required, reachable only at /admin */}
      <Route
        path="/admin"
        element={
          <Suspense fallback={<div className="min-h-screen bg-page" />}>
            <AdminApp />
          </Suspense>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="support" element={<Support />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="products" element={<Products />} />
        <Route path="customers" element={<Customers />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="income" element={<Income />} />
        <Route path="accounting" element={<Accounting />} />
        <Route path="shipping" element={<Shipping />} />
        <Route path="manufacturing" element={<Manufacturing />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="marketing" element={<Marketing />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="newsletter" element={<Newsletter />} />
        <Route path="social" element={<SocialMedia />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="documents" element={<Documents />} />
        <Route path="employees" element={<Employees />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      {/* Anything else lands on the shop */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
