// Analytics — the beautiful charts page. One range filter on top scopes every
// stat, chart, and table below (customer growth is the labelled exception).

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Info, PackageOpen, PieChart, ShoppingCart } from 'lucide-react'
import {
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  PageHeader,
  ProductTile,
  RankedProductTile,
  Segmented,
  SkeletonChart,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Tip,
  type Column,
} from '@/components/ui'
import { BarList, BarsChart, ChartCard, DonutChart, TrendChart, foldSlices, type DonutSlice } from '@/components/charts'
import { useStore } from '@/store/useStore'
import { fmtDateShort, fmtMonth, money, money0, moneyCompact, num, pct } from '@/lib/format'
import {
  bestSellers,
  dailySeries,
  isRevenueOrder,
  monthlySeries,
  orderRevenue,
  rangeTotals,
  repeatCustomerRate,
  type SellerStat,
} from '@/lib/metrics'
import { addDays, addMonths, startOfDay, startOfMonth } from '@/lib/dates'
import { cn, sum, useLoaded } from '@/lib/utils'

type RangeKey = '30d' | '90d' | '6m' | '12m'

const RANGE_DEFS: Record<RangeKey, { unit: 'days' | 'months'; n: number; label: string }> = {
  '30d': { unit: 'days', n: 30, label: 'last 30 days' },
  '90d': { unit: 'days', n: 90, label: 'last 90 days' },
  '6m': { unit: 'months', n: 6, label: 'last 6 months' },
  '12m': { unit: 'months', n: 12, label: 'last 12 months' },
}

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '6m', label: '6m' },
  { value: '12m', label: '12m' },
]

type Bucket = {
  label: string
  revenue: number
  profit: number
  orders: number
}

/** Relative percent change, safe against a zero prior */
function deltaPct(cur: number, prev: number): number {
  if (prev === 0) return cur > 0 ? 100 : 0
  return ((cur - prev) / prev) * 100
}

/** Smooth-scroll to a section of this page by id */
function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
}

export default function Analytics() {
  const loaded = useLoaded()
  const orders = useStore((s) => s.orders)
  const expenses = useStore((s) => s.expenses)
  const incomes = useStore((s) => s.incomes)
  const customers = useStore((s) => s.customers)
  const products = useStore((s) => s.products)

  const [range, setRange] = useState<RangeKey>('30d')

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const view = useMemo(() => {
    const def = RANGE_DEFS[range]
    const now = new Date()
    let buckets: Bucket[]
    let bucketName: string
    let from: Date
    let to: Date
    let prevFrom: Date

    if (def.unit === 'days') {
      to = addDays(startOfDay(now), 1)
      from = addDays(to, -def.n)
      prevFrom = addDays(from, -def.n)
      bucketName = 'Day'
      buckets = dailySeries(orders, expenses, def.n).map((p) => ({
        label: fmtDateShort(p.date.toISOString()),
        revenue: p.revenue,
        profit: p.profit,
        orders: p.orders,
      }))
    } else {
      const m0 = startOfMonth(now)
      from = addMonths(m0, -(def.n - 1))
      to = addMonths(m0, 1)
      prevFrom = addMonths(from, -def.n)
      bucketName = 'Month'
      buckets = monthlySeries(orders, expenses, incomes, def.n).map((p) => ({
        label: fmtMonth(p.date.toISOString()),
        revenue: p.revenue,
        profit: p.profit,
        orders: p.orders,
      }))
    }

    const totals = rangeTotals(orders, expenses, incomes, from, to)
    const prevTotals = rangeTotals(orders, expenses, incomes, prevFrom, from)

    const between = (iso: string, a: Date, b: Date) => {
      const t = new Date(iso).getTime()
      return t >= a.getTime() && t < b.getTime()
    }
    const ordersInRange = orders.filter((o) => isRevenueOrder(o) && between(o.placedAt, from, to))
    const prevOrders = orders.filter((o) => isRevenueOrder(o) && between(o.placedAt, prevFrom, from))

    const aov = totals.orders ? totals.revenue / totals.orders : 0
    const prevAov = prevTotals.orders ? prevTotals.revenue / prevTotals.orders : 0
    const repeatRate = repeatCustomerRate(ordersInRange)
    const prevRepeatRate = repeatCustomerRate(prevOrders)

    // Sales by category — resolve each line item's product to its category
    const byCategory = new Map<string, number>()
    for (const o of ordersInRange) {
      for (const item of o.items) {
        const cat = productById.get(item.productId)?.category ?? 'Other'
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + item.unitPrice * item.quantity)
      }
    }
    const categorySlices = foldSlices(
      [...byCategory.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      5,
    )

    // Sales by channel — full order revenue grouped by channel
    const byChannel = new Map<string, number>()
    for (const o of ordersInRange) {
      byChannel.set(o.channel, (byChannel.get(o.channel) ?? 0) + orderRevenue(o))
    }
    const channelSlices: DonutSlice[] = [...byChannel.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    // Best sellers over the scoped orders (no extra date cutoff needed)
    const sellers = bestSellers(ordersInRange)

    // Repeat vs first-time — did the customer's first-ever order predate the range?
    const firstOrderAt = new Map<string, number>()
    for (const o of orders) {
      if (!isRevenueOrder(o)) continue
      const t = new Date(o.placedAt).getTime()
      const cur = firstOrderAt.get(o.customerId)
      if (cur === undefined || t < cur) firstOrderAt.set(o.customerId, t)
    }
    let repeatOrders = 0
    for (const o of ordersInRange) {
      const first = firstOrderAt.get(o.customerId)
      if (first !== undefined && first < from.getTime()) repeatOrders++
    }
    const firstTimeOrders = ordersInRange.length - repeatOrders

    return {
      def,
      buckets,
      bucketName,
      totals,
      prevTotals,
      aov,
      prevAov,
      repeatRate,
      prevRepeatRate,
      categorySlices,
      channelSlices,
      sellers,
      repeatOrders,
      firstTimeOrders,
      hasSales: ordersInRange.length > 0,
    }
  }, [range, orders, expenses, incomes, productById])

  // Customer growth — cumulative count by month, trailing 12 months, all time
  const growth = useMemo(() => {
    const m0 = startOfMonth(new Date())
    return Array.from({ length: 12 }, (_, i) => {
      const monthStart = addMonths(m0, -(11 - i))
      const monthEnd = addMonths(monthStart, 1)
      return {
        label: fmtMonth(monthStart.toISOString()),
        customers: customers.filter((c) => new Date(c.createdAt).getTime() < monthEnd.getTime()).length,
      }
    })
  }, [customers])

  // Rank by revenue (0 = top seller) so the crown/medals are stable regardless of table sort
  const rankByProduct = useMemo(() => {
    const m = new Map<string, number>()
    view.sellers.forEach((s, i) => m.set(s.productId, i))
    return m
  }, [view.sellers])

  const sellerColumns = useMemo<Array<Column<SellerStat>>>(
    () => [
      {
        key: 'product',
        header: 'Product',
        render: (s) => {
          const p = productById.get(s.productId)
          return (
            <span className="flex items-center gap-3">
              <RankedProductTile emoji={p?.image ?? '📦'} hue={p?.imageHue ?? 220} size="sm" rank={rankByProduct.get(s.productId) ?? -1} />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{s.name}</span>
                {p && <span className="block text-xs text-ink-3">{p.category}</span>}
              </span>
            </span>
          )
        },
      },
      {
        key: 'units',
        header: 'Units',
        align: 'right',
        sortValue: (s) => s.units,
        render: (s) => <span className="tnum">{num(s.units)}</span>,
      },
      {
        key: 'revenue',
        header: 'Revenue',
        align: 'right',
        sortValue: (s) => s.revenue,
        render: (s) => <span className="tnum font-medium text-ink">{money(s.revenue)}</span>,
      },
      {
        key: 'profit',
        header: 'Profit',
        align: 'right',
        sortValue: (s) => s.profit,
        render: (s) => (
          <span className={cn('tnum font-medium', s.profit >= 0 ? 'text-[#006300] dark:text-good' : 'text-critical')}>
            {money(s.profit)}
          </span>
        ),
      },
      {
        key: 'turnover',
        header: (
          <span className="inline-flex items-center gap-1">
            Turnover
            <Tip content="Inventory turnover: units sold in the selected range ÷ current stock on hand">
              <button type="button" aria-label="What is inventory turnover?" className="text-ink-3 hover:text-ink">
                <Info className="h-3.5 w-3.5" />
              </button>
            </Tip>
          </span>
        ),
        align: 'right',
        hideBelow: 'md',
        render: (s) => {
          const stock = productById.get(s.productId)?.stock ?? 0
          return <span className="tnum text-ink-2">{(s.units / Math.max(1, stock)).toFixed(1)}×</span>
        },
      },
    ],
    [productById, rankByProduct],
  )

  if (!loaded) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" description="How the shop is really doing" />
        <SkeletonStats />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonChart key={i} />
          ))}
        </div>
        <SkeletonTable />
      </div>
    )
  }

  const { def, buckets, bucketName, totals, prevTotals, sellers } = view
  const vs = 'prior period'

  const repeatSlices: DonutSlice[] = [
    { name: 'Repeat', value: view.repeatOrders, color: 0 },
    { name: 'First-time', value: view.firstTimeOrders, color: 2 },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="How the shop is really doing" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} size="md" />
        <span className="text-[13px] text-ink-3">
          Everything below covers the {def.label}, compared with the {def.unit === 'days' ? `${def.n} days` : `${def.n} months`} before it.
        </span>
      </div>

      <motion.div {...fadeIn} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Revenue"
          value={money0(totals.revenue)}
          delta={{ pct: deltaPct(totals.revenue, prevTotals.revenue), vs }}
          trend={buckets.map((b) => b.revenue)}
          clickHint="Jump to the revenue chart"
          onClick={() => jumpTo('revenue-chart')}
        />
        <Stat
          label="Orders"
          value={num(totals.orders)}
          delta={{ pct: deltaPct(totals.orders, prevTotals.orders), vs }}
          trend={buckets.map((b) => b.orders)}
          clickHint="Jump to the orders chart"
          onClick={() => jumpTo('orders-chart')}
        />
        <Stat
          label="Average order value"
          value={money(view.aov)}
          delta={{ pct: deltaPct(view.aov, view.prevAov), vs }}
          clickHint="Jump to the product performance table"
          onClick={() => jumpTo('product-performance')}
        />
        <Stat
          label="Repeat customer rate"
          value={pct(view.repeatRate)}
          delta={{ pct: view.repeatRate - view.prevRepeatRate, vs }}
          clickHint="Jump to the repeat vs new breakdown"
          onClick={() => jumpTo('repeat-vs-new')}
        />
      </motion.div>

      <motion.div {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.05 }} className="grid gap-4 lg:grid-cols-2">
        <div id="revenue-chart">
          <ChartCard
            className="h-full"
            title="Revenue"
            subtitle={`Sales revenue, ${def.label}`}
            table={{ headers: [bucketName, 'Revenue'], rows: buckets.map((b) => [b.label, money(b.revenue)]) }}
          >
            <TrendChart
              data={buckets}
              xKey="label"
              series={[{ key: 'revenue', name: 'Revenue', color: 0 }]}
              valueFormatter={moneyCompact}
            />
          </ChartCard>
        </div>

        <div id="orders-chart">
          <ChartCard
            className="h-full"
            title="Orders"
            subtitle={`Orders placed, ${def.label}`}
            table={{ headers: [bucketName, 'Orders'], rows: buckets.map((b) => [b.label, num(b.orders)]) }}
          >
            <BarsChart
              data={buckets}
              xKey="label"
              series={[{ key: 'orders', name: 'Orders', color: 0 }]}
              valueFormatter={num}
            />
          </ChartCard>
        </div>

        <ChartCard
          title="Profit"
          subtitle={`Order profit after item costs and shipping, ${def.label}`}
          table={{ headers: [bucketName, 'Profit'], rows: buckets.map((b) => [b.label, money(b.profit)]) }}
        >
          <TrendChart
            data={buckets}
            xKey="label"
            series={[{ key: 'profit', name: 'Profit', color: 1 }]}
            valueFormatter={moneyCompact}
          />
        </ChartCard>

        <ChartCard
          title="Sales by category"
          subtitle={`Item revenue by product category, ${def.label}`}
          table={{
            headers: ['Category', 'Revenue'],
            rows: view.categorySlices.map((s) => [s.name, money(s.value)]),
          }}
        >
          {view.categorySlices.length ? (
            <DonutChart data={view.categorySlices} valueFormatter={moneyCompact} centerLabel="total" size={190} />
          ) : (
            <EmptyState
              icon={<PieChart />}
              title="No sales in this range"
              description="Category breakdown appears once orders land in the selected period."
            />
          )}
        </ChartCard>

        <ChartCard
          title="Sales by channel"
          subtitle={`Order revenue by sales channel, ${def.label}`}
          table={{
            headers: ['Channel', 'Revenue'],
            rows: view.channelSlices.map((s) => [s.name, money(s.value)]),
          }}
        >
          {view.channelSlices.length ? (
            <DonutChart data={view.channelSlices} valueFormatter={moneyCompact} centerLabel="total" size={190} />
          ) : (
            <EmptyState
              icon={<PieChart />}
              title="No sales in this range"
              description="Channel breakdown appears once orders land in the selected period."
            />
          )}
        </ChartCard>

        <ChartCard
          title="Customer growth"
          subtitle="Cumulative customers by month, all time"
          table={{ headers: ['Month', 'Customers'], rows: growth.map((g) => [g.label, num(g.customers)]) }}
        >
          <TrendChart
            data={growth}
            xKey="label"
            series={[{ key: 'customers', name: 'Customers', color: 4 }]}
            valueFormatter={num}
          />
        </ChartCard>
      </motion.div>

      <motion.div {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.1 }} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Best sellers" subtitle={`Top products by revenue, ${def.label}`} />
          {sellers.length ? (
            <BarList
              items={sellers.slice(0, 8).map((s, i) => {
                const p = productById.get(s.productId)
                return {
                  label: s.name,
                  value: s.revenue,
                  icon: <RankedProductTile emoji={p?.image ?? '📦'} hue={p?.imageHue ?? 220} size="sm" rank={i} />,
                  sublabel: `${num(s.units)} units · ${money(s.profit)} profit`,
                }
              })}
              valueFormatter={moneyCompact}
            />
          ) : (
            <EmptyState
              icon={<PackageOpen />}
              title="Nothing sold yet"
              description="Best sellers show up once orders land in the selected period."
            />
          )}
        </Card>

        <div id="repeat-vs-new">
          <ChartCard
            className="h-full"
            title="Repeat vs new"
            subtitle={`Orders from returning customers, ${def.label}`}
            table={{
              headers: ['Segment', 'Orders'],
              rows: repeatSlices.map((s) => [s.name, num(s.value)]),
            }}
          >
            {view.hasSales ? (
              <DonutChart data={repeatSlices} valueFormatter={num} centerLabel="orders" size={190} />
            ) : (
              <EmptyState
                icon={<ShoppingCart />}
                title="No orders in this range"
                description="Repeat vs first-time split appears once orders land in the selected period."
              />
            )}
          </ChartCard>
        </div>
      </motion.div>

      <motion.div id="product-performance" {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.15 }} className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink">
          Product performance
          <span className="ml-2 text-[13px] font-normal text-ink-3">
            {num(sellers.length)} products · {num(sum(sellers.map((s) => s.units)))} units, {def.label}
          </span>
        </h2>
        <DataTable
          columns={sellerColumns}
          rows={sellers}
          rowKey={(s) => s.productId}
          pageSize={10}
          initialSort={{ key: 'revenue', dir: 'desc' }}
          emptyState={
            <EmptyState
              icon={<PackageOpen />}
              title="No sales in this range"
              description="Pick a longer range, or check back after the next order comes in."
            />
          }
        />
      </motion.div>
    </div>
  )
}
