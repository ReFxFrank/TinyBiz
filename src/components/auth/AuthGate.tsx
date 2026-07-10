// Gates the admin behind the server: first run shows a one-time Setup screen
// (create the owner account + choose starting data), afterwards a Login. Once
// authenticated it hydrates the store from the server and starts the sync
// engine, then renders the admin.

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { KeyRound, MailCheck, Rocket, ServerOff } from 'lucide-react'
import { Button, Field, Input } from '@/components/ui'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/store/useAuth'
import { hydrate, startSync } from '@/store/sync'
import { seedCollections, useStore } from '@/store/useStore'
import { useApplyTheme } from '@/components/layout/AppShell'
import { cn } from '@/lib/utils'

type Phase = 'checking' | 'setup' | 'login' | 'ready' | 'offline'

/** The persisted pre-backend dataset in this browser, if any */
function localData(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem('tms-data') || localStorage.getItem('tinybiz-data')
    if (!raw) return null
    const state = JSON.parse(raw)?.state
    return state && Array.isArray(state.orders) ? state : null
  } catch {
    return null
  }
}

function Shell({ children }: { children: ReactNode }) {
  useApplyTheme()
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 text-center">
      <img src="/brand/logo.png" alt="" className="mx-auto h-16 w-16 rounded-full ring-2 ring-white/15 shadow-pop" />
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">The Tiny Magic Studio</h1>
      <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
    </div>
  )
}

type DataChoice = 'sample' | 'import' | 'empty'

function SetupScreen({ onDone }: { onDone: () => Promise<void> }) {
  const hasLocal = localData() !== null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [choice, setChoice] = useState<DataChoice>(hasLocal ? 'import' : 'sample')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!/\S+@\S+\.\S+/.test(email.trim())) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setError(null)
    setBusy(true)
    try {
      const state =
        choice === 'import'
          ? localData()
          : choice === 'sample'
            ? seedCollections()
            : { ...Object.fromEntries(Object.entries(seedCollections()).map(([k, v]) => [k, Array.isArray(v) ? [] : v])) }
      await api.setup(email.trim(), password, state)
      await onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed — is the server running?')
      setBusy(false)
    }
  }

  const choices: Array<{ value: DataChoice; label: string; body: string; show: boolean }> = [
    { value: 'import', label: 'Import this browser’s data', body: 'Move everything you’ve built here onto the server.', show: hasLocal },
    { value: 'sample', label: 'Start with sample data', body: 'A realistic demo shop you can explore and edit.', show: true },
    { value: 'empty', label: 'Start empty', body: 'A clean slate — just you and the settings page.', show: true },
  ]

  return (
    <Shell>
      <BrandHeader subtitle="One-time setup — create your owner account. Everything will be stored on your server from here on." />
      <form onSubmit={submit} className="card space-y-4 p-6">
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourshop.com" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" required hint="At least 8 characters.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Starting data</div>
          <div className="space-y-2" role="radiogroup" aria-label="Starting data">
            {choices.filter((c) => c.show).map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={choice === c.value}
                onClick={() => setChoice(c.value)}
                className={cn(
                  'w-full rounded-xl border px-3.5 py-2.5 text-left transition-all',
                  choice === c.value ? 'border-accent bg-accent-wash ring-1 ring-accent' : 'border-edge bg-surface hover:border-ink-3',
                )}
              >
                <div className={cn('text-sm font-medium', choice === c.value ? 'text-accent-strong dark:text-accent' : 'text-ink')}>
                  {c.label}
                </div>
                <div className="mt-0.5 text-xs text-ink-3">{c.body}</div>
              </button>
            ))}
          </div>
        </div>

        <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
        <Button type="submit" size="lg" className="w-full" icon={<Rocket />} disabled={busy}>
          {busy ? 'Setting up…' : 'Create account & launch'}
        </Button>
      </form>
    </Shell>
  )
}

function LoginScreen({ onDone }: { onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(email.trim())
        setResetSent(true)
        return
      }
      await api.login(email.trim(), password)
      await onDone()
      return
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Wrong email or password.'
          : err instanceof ApiError && err.status === 429
            ? err.message // rate limited — the server says how long to wait
            : 'Could not sign in — is the server running?',
      )
    }
    setBusy(false)
  }

  if (mode === 'forgot') {
    return (
      <Shell>
        <BrandHeader subtitle="Reset your password" />
        <div className="card space-y-4 p-6">
          {resetSent ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-8 w-8 text-accent" aria-hidden />
              <p className="mt-3 text-sm leading-relaxed text-ink-2">
                If <span className="font-semibold text-ink">{email.trim()}</span> is a studio account, a reset link is
                on its way (it expires in an hour). Delivery uses the mail bridge configured in Settings → Newsletter.
              </p>
              <Button
                className="mt-5"
                variant="secondary"
                onClick={() => {
                  setMode('login')
                  setResetSent(false)
                  setBusy(false)
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Email" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
              </Field>
              <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
              <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : 'Send reset link'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError(null)
                }}
                className="w-full text-center text-[13px] font-medium text-ink-3 hover:text-ink"
              >
                Never mind — back to sign in
              </button>
            </form>
          )}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <BrandHeader subtitle="Sign in to your workspace" />
      <form onSubmit={submit} className="card space-y-4 p-6">
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
        </Field>
        <Field label="Password" required>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
        <Button type="submit" size="lg" className="w-full" icon={<KeyRound />} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
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
      </form>
    </Shell>
  )
}

/** Landing for /admin?reset=<token> — choose a new password, sign right in */
function ResetScreen({ token, onDone, onCancel }: { token: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    setError(null)
    try {
      await api.resetPassword(token, password)
      await onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset — is the server running?')
      setBusy(false)
    }
  }

  return (
    <Shell>
      <BrandHeader subtitle="Choose a new password — you'll be signed straight in" />
      <form onSubmit={submit} className="card space-y-4 p-6">
        <Field label="New password" required hint="At least 8 characters.">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" required>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <div aria-live="polite">{error && <p className="text-[13px] text-critical">{error}</p>}</div>
        <Button type="submit" size="lg" className="w-full" icon={<KeyRound />} disabled={busy}>
          {busy ? 'Saving…' : 'Save & sign in'}
        </Button>
        <button type="button" onClick={onCancel} className="w-full text-center text-[13px] font-medium text-ink-3 hover:text-ink">
          Cancel — back to sign in
        </button>
      </form>
    </Shell>
  )
}

function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Shell>
      <BrandHeader subtitle="Can’t reach the studio server" />
      <div className="card p-6 text-center">
        <ServerOff className="mx-auto h-8 w-8 text-ink-3" aria-hidden />
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          The API server isn’t responding. In development, run{' '}
          <span className="font-mono text-[13px] text-ink">node server/index.js</span>. On a VPS, check{' '}
          <span className="font-mono text-[13px] text-ink">systemctl status tinymagic-api</span>.
        </p>
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Shell>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking')
  // Reset links land on /admin?reset=<token>. Handled outside the router —
  // AuthGate renders before any admin routes exist.
  const [resetToken, setResetToken] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('reset'),
  )
  const clearResetParam = () => {
    setResetToken(null)
    window.history.replaceState(null, '', window.location.pathname)
  }

  const enter = async () => {
    // Re-fetch /me so the freshly-created session's perms are in hand before
    // hydrating — the sync engine and UI gates read them from useAuth.
    const me = await api.me()
    useAuth.getState().setUser(me.user)
    await hydrate()
    startSync()
    setPhase('ready')
  }

  const check = async () => {
    setPhase('checking')
    try {
      const me = await api.me()
      if (me.needsSetup) setPhase('setup')
      else if (me.user) {
        useAuth.getState().setUser(me.user)
        await enter()
      } else setPhase('login')
    } catch {
      setPhase('offline')
    }
  }

  useEffect(() => {
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'ready') return <>{children}</>
  if (phase === 'setup') return <SetupScreen onDone={enter} />
  if (phase === 'login' && resetToken) {
    return (
      <ResetScreen
        token={resetToken}
        onDone={async () => {
          clearResetParam()
          await enter()
        }}
        onCancel={clearResetParam}
      />
    )
  }
  if (phase === 'login') return <LoginScreen onDone={enter} />
  if (phase === 'offline') return <OfflineScreen onRetry={() => void check()} />
  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 py-16">
        <span className="inline-flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl brand-gradient text-2xl" aria-hidden>
          🐣
        </span>
        <span className="text-sm text-ink-3">Connecting…</span>
      </div>
    </Shell>
  )
}

/** Sign out and drop back to the login screen */
export async function signOut(): Promise<void> {
  try {
    await api.logout()
  } finally {
    window.location.assign('/admin')
  }
}

// Keep useStore referenced so tree-shaking never drops the persist hydration
void useStore
