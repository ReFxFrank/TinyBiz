import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { StoreShell } from '@/pages/store/StoreShell'

/** Legacy /store/* links (bookmarks, old emails) → the same page at the root */
function LegacyStoreRedirect() {
  const { pathname, search } = useLocation()
  return <Navigate to={pathname.replace(/^\/store\/?/, '/') + search} replace />
}

// Admin shells load on demand so the storefront entry chunk stays lean
const AdminApp = lazy(() => import('@/AdminApp'))

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Orders = lazy(() => import('@/pages/Orders'))
const Inventory = lazy(() => import('@/pages/Inventory'))
const Products = lazy(() => import('@/pages/Products'))
const Customers = lazy(() => import('@/pages/Customers'))
const Suppliers = lazy(() => import('@/pages/Suppliers'))
const Expenses = lazy(() => import('@/pages/Expenses'))
const Income = lazy(() => import('@/pages/Income'))
const Accounting = lazy(() => import('@/pages/Accounting'))
const Shipping = lazy(() => import('@/pages/Shipping'))
const Manufacturing = lazy(() => import('@/pages/Manufacturing'))
const Analytics = lazy(() => import('@/pages/Analytics'))
const Marketing = lazy(() => import('@/pages/Marketing'))
const Newsletter = lazy(() => import('@/pages/Newsletter'))
const SocialMedia = lazy(() => import('@/pages/SocialMedia'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const Tasks = lazy(() => import('@/pages/Tasks'))
const Documents = lazy(() => import('@/pages/Documents'))
const Employees = lazy(() => import('@/pages/Employees'))
const Settings = lazy(() => import('@/pages/Settings'))

// Customer-facing storefront (no admin chrome)
const StoreHome = lazy(() => import('@/pages/store/StoreHome'))
const StoreShop = lazy(() => import('@/pages/store/StoreShop'))
const StoreProduct = lazy(() => import('@/pages/store/StoreProduct'))
const StoreCheckout = lazy(() => import('@/pages/store/StoreCheckout'))
const StoreConfirmation = lazy(() => import('@/pages/store/StoreConfirmation'))
const StoreTrack = lazy(() => import('@/pages/store/StoreTrack'))
const StorePolicies = lazy(() => import('@/pages/store/StorePolicies'))

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
