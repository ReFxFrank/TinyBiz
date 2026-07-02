import { Suspense, useEffect, useState, Component, type ReactNode } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { ALL_NAV_ITEMS } from './nav'
import { useUI, isDark } from '@/store/useUI'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { Toaster } from '@/components/ui/Toaster'
import { ErrorState } from '@/components/ui/EmptyState'
import { SkeletonStats, SkeletonChart } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'

/** Applies the theme class + appearance attributes to <html>, following system preference when set */
function useApplyTheme() {
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
  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('data-accent', accent)
    el.setAttribute('data-radius', radius)
    el.setAttribute('data-scale', scale)
  }, [accent, radius, scale])
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
        const item = ALL_NAV_ITEMS.find((n) => n.shortcut === e.key.toLowerCase())
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
                    <FrozenOutlet key={location.pathname} />
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
