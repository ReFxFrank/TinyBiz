import { Link, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen, Store, X } from 'lucide-react'
import { NAV_GROUPS, SETTINGS_ITEM, type NavItem } from './nav'
import { useUI } from '@/store/useUI'
import { useStore } from '@/store/useStore'
import { useAuth, canOpen, pathPerm } from '@/store/useAuth'
import { Tip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'

function NavRow({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.path}
      end={item.path === '/admin'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-accent-wash text-accent-strong dark:text-accent'
            : 'text-ink-2 hover:bg-sunken hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active-pip"
              className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-accent"
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
  return collapsed ? (
    <Tip content={item.label} side="right">
      {link}
    </Tip>
  ) : (
    link
  )
}

/** Link out of the admin into the customer-facing storefront */
function StorefrontRow({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const link = (
    <Link
      to="/"
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-sunken hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
    >
      <Store className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">View storefront</span>}
    </Link>
  )
  return collapsed ? (
    <Tip content="View storefront" side="right">
      {link}
    </Tip>
  ) : (
    link
  )
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const settings = useStore((s) => s.settings)
  const toggleSidebar = useUI((s) => s.toggleSidebar)
  const user = useAuth((s) => s.user)
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canOpen(user, pathPerm(i.path))) })).filter(
    (g) => g.items.length > 0,
  )

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-2.5 px-4 pb-2 pt-5', collapsed && 'justify-center px-0')}>
        <img src="/brand/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-full ring-1 ring-white/15 shadow-pop" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{settings.businessName}</div>
            <div className="truncate text-[11px] text-ink-3">TinyBiz workspace</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="Primary">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi}>
            {group.label && !collapsed && (
              <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {group.label}
              </div>
            )}
            {group.label && collapsed && gi > 0 && <div className="mx-3 mb-2 h-px bg-hairline" />}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow key={item.path} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-edge px-3 py-3">
        <StorefrontRow collapsed={collapsed} onNavigate={onNavigate} />
        {canOpen(user, 'settings') && <NavRow item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />}
        <button
          onClick={toggleSidebar}
          className={cn(
            'hidden lg:flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-3 transition-colors hover:bg-sunken hover:text-ink',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useUI((s) => s.sidebarCollapsed)
  const mobileOpen = useUI((s) => s.mobileNavOpen)
  const setMobileNav = useUI((s) => s.setMobileNav)

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-edge bg-surface transition-[width] duration-200 lg:block',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* Mobile slide-over */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileNav(false)}
            />
            <motion.div
              className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-lifted"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-label="Navigation"
            >
              <button
                onClick={() => setMobileNav(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-5 rounded-lg p-1.5 text-ink-3 hover:bg-sunken hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent collapsed={false} onNavigate={() => setMobileNav(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
