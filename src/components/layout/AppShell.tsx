import { Suspense, useEffect, Component, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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

/** Applies the theme class to <html>, following system preference when set */
function useApplyTheme() {
  const theme = useUI((s) => s.theme)
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle('dark', isDark(theme))
    apply()
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
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
  const location = useLocation()

  return (
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
                    <Outlet />
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
  )
}
