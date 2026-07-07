import { forwardRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useUI, type Toast } from '@/store/useUI'
import { cn } from '@/lib/utils'

// forwardRef: AnimatePresence popLayout measures exiting children via ref
const ToastRow = forwardRef<HTMLDivElement, { toast: Toast }>(function ToastRow({ toast }, ref) {
  const dismiss = useUI((s) => s.dismissToast)
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), 4200)
    return () => clearTimeout(t)
  }, [toast.id, dismiss])

  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? XCircle : Info
  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-edge bg-raised p-3.5 shadow-lifted"
      role="status"
    >
      <Icon
        className={cn(
          'mt-0.5 h-[18px] w-[18px] shrink-0',
          toast.tone === 'success' && 'text-good',
          toast.tone === 'error' && 'text-critical',
          toast.tone === 'default' && 'text-accent',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{toast.title}</div>
        {toast.description && <div className="mt-0.5 text-[13px] text-ink-3">{toast.description}</div>}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-ink-3 hover:bg-sunken hover:text-ink transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
})

/** Fixed bottom-right toast stack — mount once in the app shell */
export function Toaster() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
