// Global search (⌘K): entities + navigation + quick actions, arrow-key nav.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Box,
  ClipboardList,
  Contact2,
  CornerDownLeft,
  FileText,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { ALL_NAV_ITEMS } from './nav'
import { Kbd } from '@/components/ui/Misc'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Result {
  id: string
  icon: LucideIcon
  title: string
  subtitle?: string
  section: string
  action: () => void
}

const QUICK_ACTIONS: Array<{ label: string; path: string }> = [
  { label: 'New order', path: '/orders?new=1' },
  { label: 'New product', path: '/products?new=1' },
  { label: 'New customer', path: '/customers?new=1' },
  { label: 'New expense', path: '/expenses?new=1' },
  { label: 'New task', path: '/tasks?new=1' },
]

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setOpen = useUI((s) => s.setPalette)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const products = useStore((s) => s.products)
  const orders = useStore((s) => s.orders)
  const customers = useStore((s) => s.customers)
  const expenses = useStore((s) => s.expenses)
  const materials = useStore((s) => s.materials)
  const tasks = useStore((s) => s.tasks)
  const documents = useStore((s) => s.documents)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    const out: Result[] = []
    const match = (...fields: Array<string | undefined>) => fields.some((f) => f?.toLowerCase().includes(q))

    if (!q) {
      for (const item of ALL_NAV_ITEMS) {
        out.push({
          id: `nav-${item.path}`,
          icon: item.icon,
          title: item.label,
          subtitle: item.shortcut ? `g then ${item.shortcut}` : undefined,
          section: 'Go to',
          action: () => go(item.path),
        })
      }
      for (const qa of QUICK_ACTIONS) {
        out.push({
          id: `qa-${qa.path}`,
          icon: Plus,
          title: qa.label,
          section: 'Quick actions',
          action: () => go(qa.path),
        })
      }
      return out
    }

    for (const item of ALL_NAV_ITEMS.filter((n) => match(n.label))) {
      out.push({ id: `nav-${item.path}`, icon: item.icon, title: item.label, section: 'Go to', action: () => go(item.path) })
    }
    for (const qa of QUICK_ACTIONS.filter((a) => match(a.label))) {
      out.push({ id: `qa-${qa.path}`, icon: Plus, title: qa.label, section: 'Quick actions', action: () => go(qa.path) })
    }
    for (const p of products.filter((p) => match(p.name, p.sku, ...p.tags)).slice(0, 5)) {
      out.push({
        id: p.id,
        icon: Box,
        title: p.name,
        subtitle: `${p.sku} · ${money(p.price)} · ${p.stock} in stock`,
        section: 'Products',
        action: () => go(`/products?q=${encodeURIComponent(p.name)}`),
      })
    }
    for (const o of orders.filter((o) => match(o.number, o.customerName, o.email)).slice(0, 5)) {
      out.push({
        id: o.id,
        icon: ShoppingCart,
        title: `${o.number} — ${o.customerName}`,
        subtitle: `${o.status} · ${o.items.length} item${o.items.length === 1 ? '' : 's'}`,
        section: 'Orders',
        action: () => go(`/orders?q=${encodeURIComponent(o.number)}`),
      })
    }
    for (const c of customers.filter((c) => match(c.name, c.email)).slice(0, 5)) {
      out.push({
        id: c.id,
        icon: Users,
        title: c.name,
        subtitle: c.email,
        section: 'Customers',
        action: () => go(`/customers?q=${encodeURIComponent(c.name)}`),
      })
    }
    for (const m of materials.filter((m) => match(m.name, m.sku)).slice(0, 4)) {
      out.push({
        id: m.id,
        icon: Warehouse,
        title: m.name,
        subtitle: `${m.stock.toLocaleString()} ${m.unit} on hand`,
        section: 'Inventory',
        action: () => go(`/inventory?q=${encodeURIComponent(m.name)}`),
      })
    }
    for (const e of expenses.filter((e) => match(e.vendor, e.category)).slice(0, 4)) {
      out.push({
        id: e.id,
        icon: Receipt,
        title: e.vendor,
        subtitle: `${e.category} · ${money(e.amount)}`,
        section: 'Expenses',
        action: () => go(`/expenses?q=${encodeURIComponent(e.vendor)}`),
      })
    }
    for (const t of tasks.filter((t) => match(t.title, ...t.tags)).slice(0, 4)) {
      out.push({
        id: t.id,
        icon: ClipboardList,
        title: t.title,
        subtitle: t.status === 'in-progress' ? 'In progress' : t.status[0].toUpperCase() + t.status.slice(1),
        section: 'Tasks',
        action: () => go('/tasks'),
      })
    }
    for (const d of documents.filter((d) => match(d.name, ...d.tags)).slice(0, 3)) {
      out.push({
        id: d.id,
        icon: FileText,
        title: d.name,
        subtitle: d.category,
        section: 'Documents',
        action: () => go(`/documents?q=${encodeURIComponent(d.name)}`),
      })
    }
    return out
  }, [query, products, orders, customers, expenses, materials, tasks, documents])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      results[active]?.action()
    }
  }

  let lastSection = ''

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-x-0 top-[12vh] z-50 mx-auto w-[92vw] max-w-xl px-0 pointer-events-none"
                initial={{ opacity: 0, y: -8, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.99 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <Dialog.Title className="sr-only">Search</Dialog.Title>
                <div className="pointer-events-auto overflow-hidden rounded-2xl border border-edge bg-raised shadow-lifted">
                  <div className="flex items-center gap-3 border-b border-edge px-4">
                    <Search className="h-4 w-4 shrink-0 text-ink-3" />
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder="Search products, orders, customers… or jump anywhere"
                      className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                      role="combobox"
                      aria-expanded="true"
                      aria-controls="palette-results"
                    />
                    <Kbd>esc</Kbd>
                  </div>
                  <div id="palette-results" ref={listRef} role="listbox" className="max-h-[46vh] overflow-y-auto p-2">
                    {results.length === 0 ? (
                      <div className="px-3 py-10 text-center text-[13px] text-ink-3">
                        No matches for “{query}” — try a product, order number, or customer.
                      </div>
                    ) : (
                      results.map((r, i) => {
                        const showSection = r.section !== lastSection
                        lastSection = r.section
                        const Icon = r.icon
                        return (
                          <div key={r.id}>
                            {showSection && (
                              <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                                {r.section}
                              </div>
                            )}
                            <button
                              data-index={i}
                              role="option"
                              aria-selected={i === active}
                              onClick={r.action}
                              onMouseMove={() => setActive(i)}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                                i === active ? 'bg-accent-wash text-ink' : 'text-ink-2',
                              )}
                            >
                              <Icon className={cn('h-4 w-4 shrink-0', i === active ? 'text-accent' : 'text-ink-3')} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                                {r.subtitle && <span className="block truncate text-xs text-ink-3">{r.subtitle}</span>}
                              </span>
                              {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="flex items-center gap-4 border-t border-edge px-4 py-2.5 text-[11px] text-ink-3">
                    <span className="flex items-center gap-1.5">
                      <Kbd>↑</Kbd>
                      <Kbd>↓</Kbd> navigate
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Kbd>↵</Kbd> open
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <ArrowRight className="h-3 w-3" />
                      <Contact2 className="hidden" />
                      Tip: press <Kbd>g</Kbd> then a letter to jump between pages
                    </span>
                  </div>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
