import * as Popover from '@radix-ui/react-popover'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, CircleAlert, MessageSquare, Package, Receipt, FileBarChart, ShoppingCart, Truck } from 'lucide-react'
import type { AppNotification, NotificationType } from '@/data/types'
import { useStore } from '@/store/useStore'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

const typeIcon: Record<NotificationType, LucideIcon> = {
  'low-stock': Package,
  order: ShoppingCart,
  shipping: Truck,
  expense: Receipt,
  report: FileBarChart,
  message: MessageSquare,
  task: CircleAlert,
}

const typeTint: Record<NotificationType, string> = {
  'low-stock': 'bg-serious-wash text-serious',
  order: 'bg-accent-wash text-accent',
  shipping: 'bg-accent-wash text-accent',
  expense: 'bg-warn-wash text-[#8a6100] dark:text-warn',
  report: 'bg-pop-soft text-pop',
  message: 'bg-good-wash text-[#006300] dark:text-good',
  task: 'bg-critical-wash text-critical',
}

function NotificationRow({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const Icon = typeIcon[n.type]
  return (
    // Popover.Close closes the panel before the row's navigation fires
    <Popover.Close asChild>
    <button
      onClick={() => onOpen(n)}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sunken',
        !n.read && 'bg-accent-wash/50',
      )}
    >
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', typeTint[n.type])}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-[13px]', n.read ? 'font-medium text-ink-2' : 'font-semibold text-ink')}>
            {n.title}
          </span>
          <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(n.createdAt)}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-3">{n.body}</span>
      </span>
      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
    </button>
    </Popover.Close>
  )
}

export function NotificationsPanel() {
  const notifications = useStore((s) => s.notifications)
  const markRead = useStore((s) => s.markNotificationRead)
  const markAllRead = useStore((s) => s.markAllNotificationsRead)
  const navigate = useNavigate()
  const unread = notifications.filter((n) => !n.read).length

  const open = (n: AppNotification) => {
    markRead(n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label={unread ? `Notifications — ${unread} unread` : 'Notifications'}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[380px] max-w-[92vw] rounded-2xl border border-edge bg-raised p-2 shadow-lifted animate-slide-up"
        >
          <div className="flex items-center justify-between px-3 pb-2 pt-2">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent-wash transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] space-y-0.5 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-10 text-center text-[13px] text-ink-3">You're all caught up 🎉</div>
            ) : (
              notifications.slice(0, 20).map((n) => <NotificationRow key={n.id} n={n} onOpen={open} />)
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
