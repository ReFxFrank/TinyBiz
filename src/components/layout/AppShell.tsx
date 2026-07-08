import { Suspense, useEffect, useState, Component, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { ALL_NAV_ITEMS, SETTINGS_ITEM } from './nav'
import { useAuth, canOpen, pathPerm } from '@/store/useAuth'
import { signOut } from '@/components/auth/AuthGate'
import { Lock } from 'lucide-react'
import { useUI, isDark } from '@/store/useUI'
import { applyCustomAccentStyle } from '@/lib/color'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { Toaster } from '@/components/ui/Toaster'
import { ErrorState } from '@/components/ui/EmptyState'
import { SkeletonStats, SkeletonChart } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

/** Applies the theme class + appearance attributes to <html>, following system preference when set */
export function useApplyTheme() {
  const theme = useUI((s) => s.theme)
  const accent = useUI((s) => s.accent)
  const radius = useUI((s) => s.radius)
  const scale = useUI((s) => s.scale)
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle('dark', isDark(theme))
    apply()
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  const customAccent = useUI((s) => s.customAccent)
  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-accent', accent)
    el.setAttribute('data-radius', radius)
    el.setAttribute('data-scale', scale)
    applyCustomAccentStyle(accent === 'custom' ? customAccent : null)
  }, [accent, radius, scale, customAccent])
}

/** ⌘K palette + `g <letter>` page-jump chords */
function useGlobalShortcuts() {
  const setPalette = useUI((s) => s.setPalette)
  const navigate = useNavigate()
  useEffect(() => {
    let pendingG = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (pendingG) {
        pendingG = false
        clearTimeout(timer)
        const me = useAuth.getState().user
        const item = ALL_NAV_ITEMS.find((n) => n.shortcut === e.key.toLowerCase() && canOpen(me, pathPerm(n.path)))
        if (item) {
          e.preventDefault()
          navigate(item.path)
        }
        return
      }
      if (e.key.toLowerCase() === 'g') {
        pendingG = true
        timer = setTimeout(() => (pendingG = false), 900)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [setPalette, navigate])
}

class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card mx-auto mt-10 max-w-lg">
          <ErrorState
            description={this.state.error.message || 'An unexpected error occurred rendering this page.'}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Freezes the outlet it mounted with. Without this, AnimatePresence's exiting
 * wrapper would render the NEW route during its exit animation, double-mounting
 * pages and swallowing one-shot ?new=1 effects.
 */
function FrozenOutlet() {
  const outlet = useOutlet()
  const [frozen] = useState(outlet)
  return frozen
}

/** First section this account may open — where /admin lands for staff */
export function firstAllowedPath(user: ReturnType<typeof useAuth.getState>['user']): string | null {
  for (const item of [...ALL_NAV_ITEMS, SETTINGS_ITEM]) {
    if (canOpen(user, pathPerm(item.path))) return item.path
  }
  return null
}

function AccessDenied() {
  const user = useAuth((s) => s.user)
  const fallback = firstAllowedPath(user)
  const navigate = useNavigate()
  return (
    <div className="card mx-auto mt-10 flex max-w-md flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sunken text-ink-3">
        <Lock className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-[15px] font-semibold text-ink">You don&rsquo;t have access to this section</h2>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">
        Ask the owner to grant it under Settings → Team &amp; access.
      </p>
      <div className="mt-5 flex gap-2">
        {fallback ? (
          <button
            onClick={() => navigate(fallback)}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-[color:var(--accent-fg)] hover:bg-accent-strong"
          >
            Go to your workspace
          </button>
        ) : (
          <button
            onClick={() => void signOut()}
            className="rounded-xl bg-sunken px-4 py-2 text-sm font-medium text-ink hover:bg-hairline"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  )
}

function PageFallback() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-7 w-48" />
      <SkeletonStats />
      <SkeletonChart />
    </div>
  )
}

export function AppShell() {
  useApplyTheme()
  useGlobalShortcuts()
  const collapsed = useUI((s) => s.sidebarCollapsed)
  const reduceMotion = useUI((s) => s.reduceMotion)
  const location = useLocation()
  const user = useAuth((s) => s.user)

  // Staff without dashboard access land on their first permitted section
  const allowed = canOpen(user, pathPerm(location.pathname))
  if (!allowed && (location.pathname === '/admin' || location.pathname === '/admin/')) {
    const fallback = firstAllowedPath(user)
    if (fallback) return <Navigate to={fallback} replace />
  }

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
    <TooltipProvider>
      <div className="min-h-full">
        <Sidebar />
        <div className={cn('flex min-h-screen flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-60')}>
          <Topbar />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
            <PageErrorBoundary resetKey={location.pathname}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Suspense fallback={<PageFallback />}>
                    {allowed ? <FrozenOutlet key={location.pathname} /> : <AccessDenied />}
                  </Suspense>
                </motion.div>
              </AnimatePresence>
            </PageErrorBoundary>
          </main>
        </div>
        <CommandPalette />
        <Toaster />
      </div>
    </TooltipProvider>
    </MotionConfig>
  )
}
