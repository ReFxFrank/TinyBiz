// Customer account page: create an account / sign in, keep shipping details
// on file (they prefill checkout), and see every order placed with your email.

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, CircleUserRound, KeyRound, LifeBuoy, LogOut, MailCheck, PackageOpen, ExternalLink, Sparkles } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, type BadgeTone } from '@/components/ui'
import { api, ApiError, type PublicOrder } from '@/lib/api'
import { useShopAccount } from '@/store/useShopAccount'
import { useCatalog } from '@/store/useCatalog'
import { toast } from '@/store/useUI'
import { fmtDate, money } from '@/lib/format'
import type { OrderStatus } from '@/data/types'

const STATUS_TONE: Partial<Record<OrderStatus, BadgeTone>> = {
  New: 'blue',
  Shipped: 'violet',
  Delivered: 'green',
  Cancelled: 'red',
  Returned: 'red',
}

// ── Signed-out: sign in / create account ─────────────────────────────────────

function AuthCard() {
  const setAccount = useShopAccount((s) => s.setAccount)
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'forgot') {
        await api.account.forgot(email.trim())
        setResetSent(true)
        return
      }
      const res =
        mode === 'signup'
          ? await api.account.signup({ name: name.trim(), email: email.trim(), password })
          : await api.account.login({ email: email.trim(), password })
      setAccount(res.account)
      toast(mode === 'signup' ? 'Welcome! Your account is ready.' : `Welcome back${res.account.name ? `, ${res.account.name.split(' ')[0]}` : ''}!`, { tone: 'success' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient-soft text-accent">
            <KeyRound className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Reset your password</h1>
          <p className="mt-2 text-sm text-ink-3">
            Tell us your email and we&rsquo;ll send a one-time reset link. It works for shopper accounts and studio
            logins alike.
          </p>
        </div>
        <Card padding="lg" className="mt-8">
          {resetSent ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-8 w-8 text-accent-strong dark:text-accent" aria-hidden />
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                If <span className="font-semibold text-ink">{email.trim()}</span> has an account here, a reset link is
                on its way. It expires in an hour — check your spam folder if it&rsquo;s shy.
              </p>
              <Button
                variant="secondary"
                className="mt-5"
                onClick={() => {
                  setMode('login')
                  setResetSent(false)
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <Field label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" autoFocus />
              </Field>
              <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
              <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
                {busy ? 'One moment…' : 'Send reset link'}
              </Button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-center text-[13px] font-medium text-ink-3 hover:text-ink"
              >
                Never mind — back to sign in
              </button>
            </form>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="text-center">
        <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient-soft text-accent">
          <CircleUserRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Your account</h1>
        <p className="mt-2 text-sm text-ink-3">
          Keep your details on file for faster checkout and see all your orders in one place. Studio owner or staff?
          Just sign in with your usual login.
        </p>
      </div>

      <Card padding="lg" className="mt-8">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1" role="tablist" aria-label="Sign in or create account">
          {(
            [
              ['login', 'Sign in'],
              ['signup', 'Create account'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={
                mode === m
                  ? 'rounded-lg bg-surface px-3 py-1.5 text-sm font-semibold text-ink shadow-soft'
                  : 'rounded-lg px-3 py-1.5 text-sm font-medium text-ink-3 hover:text-ink'
              }
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          {mode === 'signup' && (
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </Field>
          )}
          <Field label="Email" required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <Field label="Password" required hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </Field>
          <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
          <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password || (mode === 'signup' && !name.trim())}>
            {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Button>
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setError(null)
              }}
              className="w-full text-center text-[13px] font-medium text-ink-3 hover:text-ink"
            >
              Forgot password?
            </button>
          )}
        </form>
      </Card>
    </div>
  )
}

// ── Reset link landing (/account?reset=<token>) ──────────────────────────────

function ResetCard({ token, onDone }: { token: string; onDone: () => void }) {
  const setAccount = useShopAccount((s) => s.setAccount)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (password.length < 8) return setError('Passwords need at least 8 characters.')
    if (password !== confirm) return setError('Those passwords don’t match.')
    setBusy(true)
    setError(null)
    try {
      const res = await api.account.reset(token, password)
      setAccount(res.account)
      toast('Password updated — you’re signed in', { tone: 'success' })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong — try again in a moment.')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="text-center">
        <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient-soft text-accent">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Choose a new password</h1>
        <p className="mt-2 text-sm text-ink-3">You&rsquo;ll be signed straight in once it&rsquo;s saved.</p>
      </div>
      <Card padding="lg" className="mt-8">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Field label="New password" required hint="At least 8 characters.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
          </Field>
          <Field label="Confirm new password" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
          <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
            {busy ? 'Saving…' : 'Save & sign in'}
          </Button>
          <button type="button" onClick={onDone} className="w-full text-center text-[13px] font-medium text-ink-3 hover:text-ink">
            Cancel
          </button>
        </form>
      </Card>
    </div>
  )
}

// ── Signed-in: details, address, password, orders ────────────────────────────

function DetailsCard() {
  const account = useShopAccount((s) => s.account)
  const setAccount = useShopAccount((s) => s.setAccount)
  const [name, setName] = useState(account?.name ?? '')
  const [line1, setLine1] = useState(account?.address?.line1 ?? '')
  const [city, setCity] = useState(account?.address?.city ?? '')
  const [state, setState] = useState(account?.address?.state ?? '')
  const [zip, setZip] = useState(account?.address?.zip ?? '')
  const [busy, setBusy] = useState(false)

  const dirty =
    name.trim() !== (account?.name ?? '') ||
    line1.trim() !== (account?.address?.line1 ?? '') ||
    city.trim() !== (account?.address?.city ?? '') ||
    state.trim() !== (account?.address?.state ?? '') ||
    zip.trim() !== (account?.address?.zip ?? '')

  const save = async () => {
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      const hasAddress = line1.trim() || city.trim() || state.trim() || zip.trim()
      const res = await api.account.update({
        name: name.trim(),
        address: hasAddress ? { line1: line1.trim(), city: city.trim(), state: state.trim(), zip: zip.trim() } : null,
      })
      setAccount(res.account)
      toast('Details saved', { description: 'Checkout will prefill these for you.', tone: 'success' })
    } catch (err) {
      toast('Couldn’t save', { description: err instanceof ApiError ? err.message : 'Try again in a moment.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-[15px] font-semibold text-ink">Your details</h2>
      <p className="mt-1 text-[13px] text-ink-3">Saved shipping details prefill checkout automatically.</p>
      <div className="mt-4 space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input value={account?.email ?? ''} disabled readOnly />
        </Field>
        <Field label="Street address">
          <Input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Street address, apt, suite…" autoComplete="address-line1" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" className="col-span-1">
            <Input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </Field>
          <Field label="Province">
            <Input value={state} onChange={(e) => setState(e.target.value)} autoComplete="address-level1" />
          </Field>
          <Field label="Postal code">
            <Input value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" />
          </Field>
        </div>
        <Button onClick={() => void save()} disabled={busy || !dirty || !name.trim()}>
          {busy ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </Card>
  )
}

function PasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  const change = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api.account.password({ current, next })
      setCurrent('')
      setNext('')
      toast('Password updated', { tone: 'success' })
    } catch (err) {
      toast('Couldn’t change password', { description: err instanceof ApiError ? err.message : 'Try again in a moment.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card padding="lg">
      <h2 className="text-[15px] font-semibold text-ink">Change password</h2>
      <div className="mt-4 space-y-4">
        <Field label="Current password">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button variant="secondary" onClick={() => void change()} disabled={busy || !current || next.length < 8}>
          {busy ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </Card>
  )
}

function OrdersCard() {
  const account = useShopAccount((s) => s.account)
  const shopCurrency = useCatalog((s) => s.shop?.currency)
  const [orders, setOrders] = useState<PublicOrder[] | null>(null)

  const loadOrders = () =>
    api.account
      .orders()
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders((prev) => prev ?? []))

  useEffect(() => {
    void loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bought as a guest (maybe under a different email) before making the
  // account? Number + purchase email links that order into this history.
  const [claimOpen, setClaimOpen] = useState(false)
  const [claimNumber, setClaimNumber] = useState('')
  const [claimEmail, setClaimEmail] = useState('')
  const [claiming, setClaiming] = useState(false)
  const claim = async () => {
    if (claiming || !claimNumber.trim() || !claimEmail.trim()) return
    setClaiming(true)
    try {
      const r = await api.account.claim(claimNumber.trim(), claimEmail.trim())
      toast(`Order ${r.order.number} added to your history`, { tone: 'success' })
      setClaimNumber('')
      setClaimEmail('')
      setClaimOpen(false)
      await loadOrders()
    } catch (err) {
      toast('Couldn’t find that order', {
        description: err instanceof ApiError ? err.message : 'Try again in a moment.',
        tone: 'error',
      })
    } finally {
      setClaiming(false)
    }
  }

  // Receipts show what was actually charged — never the display-currency estimate
  const charged = (n: number) => money(n, shopCurrency ?? 'USD')
  const total = (o: PublicOrder) =>
    o.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0) + o.shippingCharged + o.taxCollected - (o.discountTotal ?? 0)

  return (
    <Card padding="lg">
      <h2 className="text-[15px] font-semibold text-ink">Your orders</h2>
      <p className="mt-1 text-[13px] text-ink-3">Every order placed with {account?.email} — even before you had an account.</p>
      {orders === null ? (
        <div className="mt-4 space-y-2">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-2">
          <EmptyState
            icon={<PackageOpen />}
            title="No orders yet"
            description="When you order, it shows up here with live status."
            action={
              <Link to="/shop">
                <Button size="sm">Browse the shop</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-hairline">
          {orders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{o.number}</span>
                  <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-3">
                  {fmtDate(o.placedAt)} · {o.items.reduce((a, i) => a + i.quantity, 0)} item
                  {o.items.reduce((a, i) => a + i.quantity, 0) === 1 ? '' : 's'} ·{' '}
                  {o.items
                    .map((i) => i.name)
                    .join(', ')}
                </div>
              </div>
              <span className="tnum text-sm font-semibold text-ink">{charged(total(o))}</span>
              <Link
                to={`/track?number=${encodeURIComponent(o.number)}&email=${encodeURIComponent(account?.email ?? '')}`}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline dark:text-accent"
              >
                Track <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Staff accounts see their studio email's orders only — claiming is a shopper thing */}
      {!account?.staff && (
        <div className="mt-5 border-t border-hairline pt-4">
          {claimOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void claim()
              }}
              className="space-y-3"
            >
              <p className="text-[13px] text-ink-3">
                Enter the order number from your confirmation email, and the email address you used at checkout.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={claimNumber}
                  onChange={(e) => setClaimNumber(e.target.value)}
                  placeholder="TMS-1024"
                  aria-label="Order number"
                  className="font-mono"
                />
                <Input
                  type="email"
                  value={claimEmail}
                  onChange={(e) => setClaimEmail(e.target.value)}
                  placeholder="Email used at checkout"
                  aria-label="Email used at checkout"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={claiming || !claimNumber.trim() || !claimEmail.trim()}>
                  {claiming ? 'Looking…' : 'Add to my history'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setClaimOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setClaimOpen(true)}
              className="text-[13px] font-medium text-accent-strong hover:underline dark:text-accent"
            >
              Bought something before creating your account? Link that order →
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

/** Pointer to the support hub — the requests themselves live at /support */
function SupportCard() {
  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-strong dark:text-accent">
          <LifeBuoy className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-ink">Need a hand?</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            Open a support request about any order — you'll see our replies here and by email.
          </p>
        </div>
        <Link to="/support" className="shrink-0">
          <Button variant="secondary" size="sm">
            Support <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StoreAccount() {
  const navigate = useNavigate()
  const account = useShopAccount((s) => s.account)
  const status = useShopAccount((s) => s.status)
  const setAccount = useShopAccount((s) => s.setAccount)
  const load = useShopAccount((s) => s.load)
  const [searchParams, setSearchParams] = useSearchParams()
  const resetToken = searchParams.get('reset')
  useEffect(() => {
    void load()
  }, [load])

  const logout = async () => {
    try {
      // Staff signed in with the studio login — signing out ends that session
      if (account?.staff) await api.logout()
      else await api.account.logout()
    } catch {
      /* signing out locally regardless */
    }
    setAccount(null)
    toast('Signed out', { tone: 'success' })
    navigate('/')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6"
    >
      {status !== 'ready' ? (
        <div className="mx-auto max-w-md space-y-3">
          <div className="skeleton h-10" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : !account && resetToken ? (
        <ResetCard token={resetToken} onDone={() => setSearchParams({}, { replace: true })} />
      ) : !account ? (
        <AuthCard />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Hi, {account.name.split(' ')[0] || 'there'} 👋
              </h1>
              <p className="mt-1 text-sm text-ink-3">{account.email}</p>
            </div>
            <Button variant="secondary" size="sm" icon={<LogOut />} onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
          {account.staff ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <Card padding="lg">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-wash text-accent-strong dark:text-accent">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold text-ink">
                      This is your studio {account.role === 'owner' ? 'owner' : 'staff'} account
                    </h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                      No separate shopper account needed — you&rsquo;re signed in with your usual login. Your name,
                      password and everything else live in the admin.
                    </p>
                  </div>
                </div>
                <Link to="/admin" className="mt-4 block">
                  <Button className="w-full">
                    Open the admin <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </Card>
              <OrdersCard />
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="space-y-5">
                <DetailsCard />
                <PasswordCard />
              </div>
              <div className="space-y-5">
                <OrdersCard />
                <SupportCard />
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
