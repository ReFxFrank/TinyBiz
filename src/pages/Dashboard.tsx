// Dashboard — the flagship homepage. Everything derives live from the store:
// greeting + pulse, quick actions, stat tiles with sparklines, sales overview
// chart, fulfillment queue, low stock, recent orders, best sellers, week
// agenda, tasks up next, and the month's expense mix.

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Box,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  PackageOpen,
  Receipt,
  ShoppingCart,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import type { EventType, Order, Product, TaskItem } from '@/data/types'
import { OPEN_STATUSES } from '@/data/types'
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  OrderStatusBadge,
  PriorityBadge,
  ProductTile,
  RankedProductTile,
  Segmented,
  SkeletonChart,
  SkeletonStats,
  SkeletonTable,
  Stat,
  StockBadge,
} from '@/components/ui'
import { BarList, ChartCard, DonutChart, TrendChart, foldSlices } from '@/components/charts'
import { dueIn, fmtDateShort, fmtMonth, money, money0, moneyCompact, timeAgo } from '@/lib/format'
import { dailySeries, monthlySeries, lowStockMaterials, lowStockProducts, orderRevenue, bestSellers } from '@/lib/metrics'
import { addDays, dayKey, startOfDay } from '@/lib/dates'
import { cn, useLoaded } from '@/lib/utils'

// ── Small helpers ────────────────────────────────────────────────────────────

function pctDelta(current: number, previous: number): number {
  if (previous !== 0) return ((current - previous) / Math.abs(previous)) * 100
  return current > 0 ? 100 : 0
}

function greetingParts(): { text: string; emoji: string } {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', emoji: '☀️' }
  if (h < 18) return { text: 'Good afternoon', emoji: '🌤️' }
  return { text: 'Good evening', emoji: '🌙' }
}

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
}

type RangeKey = '30d' | '90d' | '12m'

interface AgendaItem {
  id: string
  title: string
  /** ISO date */
  date: string
  kind: EventType | 'task'
}

const AGENDA_DOT: Record<AgendaItem['kind'], string> = {
  deadline: 'bg-critical',
  'ship-by': 'bg-accent',
  purchase: 'bg-warn',
  delivery: 'bg-good',
  production: 'bg-pop',
  market: 'bg-serious',
  other: 'bg-ink-3',
  task: 'bg-warn',
}

const AGENDA_LABEL: Record<AgendaItem['kind'], string> = {
  deadline: 'Deadline',
  'ship-by': 'Ship by',
  purchase: 'Purchase',
  delivery: 'Delivery',
  production: 'Production',
  market: 'Market',
  other: 'Event',
  task: 'Task',
}

/** Little "see everything" footer link used by the side cards */
function ViewAllLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-strong transition-colors"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  )
}

/** Tiny happy note for lists with nothing to show */
function HappyNote({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-good-wash px-3 py-2.5 text-[13px] text-[#006300] dark:text-good">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const loaded = useLoaded()

  const settings = useStore((s) => s.settings)
  const orders = useStore((s) => s.orders)
  const expenses = useStore((s) => s.expenses)
  const incomes = useStore((s) => s.incomes)
  const products = useStore((s) => s.products)
  const materials = useStore((s) => s.materials)
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)

  const [range, setRange] = useState<RangeKey>('30d')

  // ── Derived numbers ─────────────────────────────────────────────────────────

  const daily12 = useMemo(() => dailySeries(orders, expenses, 12), [orders, expenses])
  const months12 = useMemo(() => monthlySeries(orders, expenses, incomes, 12), [orders, expenses, incomes])
  const thisMonth = months12[months12.length - 1]
  const lastMonth = months12[months12.length - 2]

  const todayPoint = daily12[daily12.length - 1]
  const yesterdayPoint = daily12[daily12.length - 2]
  const newOrdersToday = todayPoint?.orders ?? 0

  const chart = useMemo(() => {
    if (range === '12m') {
      const pts = monthlySeries(orders, expenses, incomes, 12)
      return pts.map((p) => ({
        label: fmtMonth(p.date.toISOString()),
        revenue: Math.round(p.revenue),
        expenses: Math.round(p.expenses),
        profit: Math.round(p.profit),
      }))
    }
    const pts = dailySeries(orders, expenses, range === '30d' ? 30 : 90)
    return pts.map((p) => ({
      label: fmtDateShort(p.date.toISOString()),
      revenue: Math.round(p.revenue),
      expenses: Math.round(p.expenses),
      profit: Math.round(p.profit),
    }))
  }, [orders, expenses, incomes, range])

  const openOrders = useMemo(
    () =>
      orders
        .filter((o) => OPEN_STATUSES.includes(o.status))
        .sort((a, b) => {
          if (a.shipBy && b.shipBy) return new Date(a.shipBy).getTime() - new Date(b.shipBy).getTime()
          if (a.shipBy) return -1
          if (b.shipBy) return 1
          return new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()
        }),
    [orders],
  )

  const lowStock = useMemo(() => {
    const prods = lowStockProducts(products).map((p) => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      reorderPoint: p.reorderPoint,
      unit: undefined as string | undefined,
      kind: 'Product',
    }))
    const mats = lowStockMaterials(materials).map((m) => ({
      id: m.id,
      name: m.name,
      stock: m.stock,
      reorderPoint: m.reorderPoint,
      unit: m.unit as string | undefined,
      kind: 'Material',
    }))
    return [...prods, ...mats]
  }, [products, materials])

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()).slice(0, 6),
    [orders],
  )

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const top5 = useMemo(() => bestSellers(orders, 30).slice(0, 5), [orders])

  const agenda = useMemo<AgendaItem[]>(() => {
    const from = dayKey(startOfDay(new Date()))
    const to = dayKey(addDays(startOfDay(new Date()), 6))
    const items: AgendaItem[] = []
    for (const e of events) {
      const k = dayKey(e.date)
      if (k >= from && k <= to) items.push({ id: e.id, title: e.title, date: e.date, kind: e.type })
    }
    for (const o of openOrders) {
      if (!o.shipBy) continue
      const k = dayKey(o.shipBy)
      if (k >= from && k <= to) items.push({ id: `ship-${o.id}`, title: `Ship ${o.number}`, date: o.shipBy, kind: 'ship-by' })
    }
    for (const t of tasks) {
      if (t.status === 'done' || !t.dueDate) continue
      const k = dayKey(t.dueDate)
      if (k >= from && k <= to) items.push({ id: `task-${t.id}`, title: t.title, date: t.dueDate, kind: 'task' })
    }
    return items.sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date))).slice(0, 7)
  }, [events, openOrders, tasks])

  const tasksUpNext = useMemo<TaskItem[]>(
    () =>
      tasks
        .filter((t) => t.status !== 'done')
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
          if (a.dueDate) return -1
          if (b.dueDate) return 1
          return a.order - b.order
        })
        .slice(0, 5),
    [tasks],
  )

  const expenseSlices = useMemo(() => {
    const monthStart = dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const byCat = new Map<string, number>()
    for (const e of expenses) {
      if (dayKey(e.date) < monthStart) continue
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
    }
    return foldSlices(
      [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
      5,
    )
  }, [expenses])

  const greeting = greetingParts()
  const firstName = settings.ownerName.split(' ')[0]
  const longToday = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const pulse =
    newOrdersToday > 0
      ? `${newOrdersToday} new order${newOrdersToday === 1 ? '' : 's'} today`
      : openOrders.length > 0
        ? `${openOrders.length} order${openOrders.length === 1 ? '' : 's'} in the queue`
        : 'All quiet on the order front'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header + quick actions */}
      <motion.div {...fadeUp} className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {greeting.text}, {firstName} {greeting.emoji}
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {longToday}
            <span className="mx-1.5 text-hairline" aria-hidden>
              ·
            </span>
            <span className="font-medium text-ink-2">{pulse}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" icon={<ShoppingCart />} onClick={() => navigate('/admin/orders?new=1')}>
            New order
          </Button>
          <Button variant="outline" size="sm" icon={<Box />} onClick={() => navigate('/admin/products?new=1')}>
            New product
          </Button>
          <Button variant="outline" size="sm" icon={<Receipt />} onClick={() => navigate('/admin/expenses?new=1')}>
            New expense
          </Button>
          <Button variant="outline" size="sm" icon={<ClipboardList />} onClick={() => navigate('/admin/tasks?new=1')}>
            New task
          </Button>
          <Button variant="outline" size="sm" icon={<BarChart3 />} onClick={() => navigate('/admin/analytics')}>
            View analytics
          </Button>
        </div>
      </motion.div>

      {/* Stat row */}
      {!loaded ? (
        <SkeletonStats />
      ) : (
        <motion.div {...fadeUp} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Today's revenue"
            value={money0(todayPoint?.revenue ?? 0)}
            delta={{ pct: pctDelta(todayPoint?.revenue ?? 0, yesterdayPoint?.revenue ?? 0), vs: 'yesterday' }}
            trend={daily12.map((p) => p.revenue)}
            clickHint="Open orders to see today's sales"
            onClick={() => navigate('/admin/orders')}
          />
          <Stat
            label="Revenue this month"
            value={moneyCompact(thisMonth?.revenue ?? 0)}
            delta={{ pct: pctDelta(thisMonth?.revenue ?? 0, lastMonth?.revenue ?? 0), vs: 'last month' }}
            trend={months12.map((p) => p.revenue)}
            clickHint="Open income for the full revenue picture"
            onClick={() => navigate('/admin/income')}
          />
          <Stat
            label="Net profit this month"
            value={moneyCompact(thisMonth?.net ?? 0)}
            delta={{ pct: pctDelta(thisMonth?.net ?? 0, lastMonth?.net ?? 0), vs: 'last month', upIsGood: true }}
            trend={months12.map((p) => p.net)}
            clickHint="Open accounting for the monthly P&L"
            onClick={() => navigate('/admin/accounting')}
          />
          <Stat
            label="Expenses this month"
            value={moneyCompact(thisMonth?.expenses ?? 0)}
            delta={{ pct: pctDelta(thisMonth?.expenses ?? 0, lastMonth?.expenses ?? 0), vs: 'last month', upIsGood: false }}
            trend={months12.map((p) => p.expenses)}
            clickHint="Open expenses to see where the money went"
            onClick={() => navigate('/admin/expenses')}
          />
        </motion.div>
      )}

      {/* Main grid: sales overview + fulfillment/low stock */}
      {!loaded ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonChart className="lg:col-span-2" />
          <SkeletonTable rows={4} />
        </div>
      ) : (
        <motion.div {...fadeUp} className="grid gap-4 lg:grid-cols-3">
          <ChartCard
            className="lg:col-span-2 lg:self-start"
            title="Sales overview"
            subtitle={range === '12m' ? 'Monthly revenue, expenses & profit' : `Daily revenue, expenses & profit — last ${range === '30d' ? 30 : 90} days`}
            actions={
              <Segmented<RangeKey>
                options={[
                  { value: '30d', label: '30d' },
                  { value: '90d', label: '90d' },
                  { value: '12m', label: '12m' },
                ]}
                value={range}
                onChange={setRange}
              />
            }
            table={{
              headers: ['Period', 'Revenue', 'Expenses', 'Profit'],
              rows: chart.map((p) => [p.label, money0(p.revenue), money0(p.expenses), money0(p.profit)]),
            }}
          >
            <TrendChart
              data={chart}
              xKey="label"
              series={[
                { key: 'revenue', name: 'Revenue', color: 0 },
                { key: 'expenses', name: 'Expenses', color: 5, area: false },
                { key: 'profit', name: 'Profit', color: 1, area: false },
              ]}
              height={340}
              valueFormatter={(v) => moneyCompact(v)}
            />
          </ChartCard>

          <div className="flex flex-col gap-4">
            {/* Awaiting fulfillment */}
            <Card>
              <CardHeader
                title="Awaiting fulfillment"
                subtitle={`${openOrders.length} open order${openOrders.length === 1 ? '' : 's'}`}
              />
              {openOrders.length === 0 ? (
                <HappyNote>All caught up — nothing waiting to ship</HappyNote>
              ) : (
                <ul className="divide-y divide-hairline">
                  {openOrders.slice(0, 5).map((o) => (
                    <FulfillmentRow key={o.id} order={o} />
                  ))}
                </ul>
              )}
              <ViewAllLink to="/admin/orders">View all orders</ViewAllLink>
            </Card>

            {/* Low stock */}
            <Card>
              <CardHeader title="Low stock" subtitle={lowStock.length ? `${lowStock.length} item${lowStock.length === 1 ? '' : 's'} at or below reorder point` : undefined} />
              {lowStock.length === 0 ? (
                <HappyNote>Everything is well stocked</HappyNote>
              ) : (
                <ul className="divide-y divide-hairline">
                  {lowStock.slice(0, 5).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-ink">{item.name}</div>
                        <div className="text-xs text-ink-3">{item.kind}</div>
                      </div>
                      <StockBadge stock={item.stock} reorderPoint={item.reorderPoint} unit={item.unit} />
                    </li>
                  ))}
                </ul>
              )}
              <ViewAllLink to="/admin/inventory">Go to inventory</ViewAllLink>
            </Card>
          </div>
        </motion.div>
      )}

      {/* Second grid: recent orders + best sellers */}
      {loaded && (
        <motion.div {...fadeUp} className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Recent orders" subtitle="The latest activity across every channel" />
            {recentOrders.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart />}
                title="No orders yet"
                description="When orders come in they'll show up here."
                action={
                  <Button size="sm" onClick={() => navigate('/admin/orders?new=1')}>
                    New order
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <button
                      onClick={() => navigate(`/admin/orders?q=${encodeURIComponent(o.number)}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 -mx-2 text-left transition-colors hover:bg-sunken/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13px] font-semibold text-ink tnum">{o.number}</span>
                          <span className="truncate text-[13px] text-ink-2">{o.customerName}</span>
                        </div>
                        <div className="text-xs text-ink-3">{timeAgo(o.placedAt)}</div>
                      </div>
                      <OrderStatusBadge status={o.status} />
                      <span className="w-20 shrink-0 text-right text-[13px] font-semibold text-ink tnum">
                        {money(orderRevenue(o))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Best sellers" subtitle="Top products by revenue — last 30 days" />
            {top5.length === 0 ? (
              <EmptyState
                icon={<PackageOpen />}
                title="No sales in the last 30 days"
                description="Best sellers will appear once orders come in."
              />
            ) : (
              <BarList
                items={top5.map((s, i) => {
                  const p = productById.get(s.productId) as Product | undefined
                  return {
                    label: s.name,
                    value: s.revenue,
                    sublabel: `${s.units} unit${s.units === 1 ? '' : 's'}`,
                    icon: <ProductIcon product={p} name={s.name} rank={i} />,
                  }
                })}
                valueFormatter={(v) => moneyCompact(v)}
                onItemClick={(item) => navigate(`/admin/products?q=${encodeURIComponent(item.label)}`)}
              />
            )}
          </Card>
        </motion.div>
      )}

      {/* Third grid: week agenda + tasks + expense mix */}
      {loaded && (
        <motion.div {...fadeUp} className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="This week" subtitle="The next 7 days at a glance" />
            {agenda.length === 0 ? (
              <HappyNote>A quiet week ahead — nothing scheduled</HappyNote>
            ) : (
              <ul className="divide-y divide-hairline">
                {agenda.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', AGENDA_DOT[item.kind])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{item.title}</div>
                      <div className="text-xs text-ink-3">{AGENDA_LABEL[item.kind]}</div>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-ink-2 tnum">{fmtDateShort(item.date)}</span>
                  </li>
                ))}
              </ul>
            )}
            <ViewAllLink to="/admin/calendar">Open calendar</ViewAllLink>
          </Card>

          <Card>
            <CardHeader title="Tasks up next" subtitle="Sorted by due date" />
            {tasksUpNext.length === 0 ? (
              <HappyNote>Task list is clear — nice work</HappyNote>
            ) : (
              <ul className="divide-y divide-hairline">
                {tasksUpNext.map((t) => {
                  const due = t.dueDate ? dueIn(t.dueDate) : undefined
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-ink">{t.title}</div>
                        <div className={cn('text-xs', due?.overdue ? 'font-medium text-critical' : 'text-ink-3')}>
                          {due ? (due.overdue ? due.label : `Due ${due.label}`) : 'No due date'}
                        </div>
                      </div>
                      <PriorityBadge priority={t.priority} />
                    </li>
                  )
                })}
              </ul>
            )}
            <ViewAllLink to="/admin/tasks">Go to tasks</ViewAllLink>
          </Card>

          <Card>
            <CardHeader title="Expenses this month" subtitle="Spending by category" />
            {expenseSlices.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="No expenses yet this month"
                description="Log purchases to see where the money goes."
                action={
                  <Button size="sm" variant="secondary" onClick={() => navigate('/admin/expenses?new=1')}>
                    New expense
                  </Button>
                }
              />
            ) : (
              <DonutChart
                data={expenseSlices}
                valueFormatter={(v) => moneyCompact(v)}
                centerLabel="this month"
                size={168}
                layout="stack"
              />
            )}
          </Card>
        </motion.div>
      )}

      {/* Footer flourish */}
      {loaded && (
        <motion.p {...fadeUp} className="flex items-center gap-1.5 pb-2 text-xs text-ink-3">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {settings.businessName} — {settings.tagline}
        </motion.p>
      )}
    </div>
  )
}

// ── Page-local pieces ────────────────────────────────────────────────────────

function FulfillmentRow({ order }: { order: Order }) {
  const due = order.shipBy ? dueIn(order.shipBy) : undefined
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-ink tnum">{order.number}</span>
          <span className="truncate text-[13px] text-ink-2">{order.customerName}</span>
        </div>
        {due ? (
          <div className={cn('text-xs', due.overdue ? 'font-medium text-critical' : 'text-ink-3')}>
            {due.overdue ? `Ship-by ${due.label}` : `Ship ${due.label}`}
          </div>
        ) : (
          <div className="text-xs text-ink-3">No ship-by date</div>
        )}
      </div>
      <OrderStatusBadge status={order.status} />
    </li>
  )
}

function ProductIcon({ product, name, rank = -1 }: { product: Product | undefined; name: string; rank?: number }) {
  const hue = product?.imageHue ?? [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return <RankedProductTile emoji={product?.image ?? '📦'} hue={hue} size="sm" rank={rank} />
}
