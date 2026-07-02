import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Download, PackageSearch, Plus, Receipt, ShoppingCart, Truck, Wallet } from 'lucide-react'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  OrderStatusBadge,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  SkeletonStats,
  SkeletonTable,
  Stat,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { ORDER_STATUSES, OPEN_STATUSES, type Order, type SalesChannel } from '@/data/types'
import { averageOrderValue, monthTotals, orderProfit, orderRevenue, orderCost } from '@/lib/metrics'
import { fmtDateShort, money, moneyCompact, num, timeAgo } from '@/lib/format'
import { addDays, dayKey, startOfDay } from '@/lib/dates'
import { cn, downloadFile, toCsv, useDebounced, useLoaded } from '@/lib/utils'
import OrderDrawer from './orders/OrderDrawer'
import NewOrderModal from './orders/NewOrderModal'

const CHANNELS: SalesChannel[] = ['Etsy', 'Shopify', 'Website', 'Market', 'Amazon']
type Range = '7d' | '30d' | '90d' | 'all'
const RANGE_DAYS: Record<Range, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null }

/** Cancelled/Returned rows read as muted */
function dim(o: Order): string | false {
  return (o.status === 'Cancelled' || o.status === 'Returned') && 'opacity-60'
}

function itemsSummary(o: Order): string {
  if (o.items.length === 0) return '—'
  const first = o.items[0]
  const rest = o.items.length - 1
  return `${first.quantity}× ${first.name}${rest > 0 ? ` +${rest} more` : ''}`
}

export default function Orders() {
  const loaded = useLoaded()
  const orders = useStore((s) => s.orders)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [range, setRange] = useState<Range>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // ?new=1 auto-opens the create modal
  useEffect(() => {
    if (searchParams.get('new')) {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const q = useDebounced(query.trim().toLowerCase(), 200)

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range]
    const cutoff = days ? startOfDay(addDays(new Date(), -(days - 1))).getTime() : 0
    const endOfToday = addDays(startOfDay(new Date()), 1).getTime()
    return orders.filter((o) => {
      if (cutoff && new Date(o.placedAt).getTime() < cutoff) return false
      // '__open' / '__due' are the pseudo-filters behind the clickable stat tiles
      if (status === '__open') {
        if (!OPEN_STATUSES.includes(o.status)) return false
      } else if (status === '__due') {
        if (!OPEN_STATUSES.includes(o.status)) return false
        if (!o.shipBy || new Date(o.shipBy).getTime() >= endOfToday) return false
      } else if (status && o.status !== status) return false
      if (channel && o.channel !== channel) return false
      if (q) {
        const hay = `${o.number} ${o.customerName} ${o.email}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, q, status, channel, range])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const open = orders.filter((o) => OPEN_STATUSES.includes(o.status))
    const endOfToday = addDays(startOfDay(new Date()), 1).getTime()
    const dueToShip = open.filter((o) => o.shipBy && new Date(o.shipBy).getTime() < endOfToday)
    const overdue = dueToShip.filter((o) => o.shipBy && new Date(o.shipBy).getTime() < startOfDay(new Date()).getTime())
    return {
      open: open.length,
      due: dueToShip.length,
      overdue: overdue.length,
      monthRevenue: monthTotals(orders, [], []).revenue,
      aov: averageOrderValue(orders),
    }
  }, [orders])

  const exportCsv = () => {
    const csv = toCsv(
      ['Number', 'Placed', 'Customer', 'Email', 'Status', 'Channel', 'Items', 'Revenue', 'Cost', 'Profit'],
      filtered.map((o) => [
        o.number,
        dayKey(o.placedAt),
        o.customerName,
        o.email,
        o.status,
        o.channel,
        itemsSummary(o),
        orderRevenue(o).toFixed(2),
        orderCost(o).toFixed(2),
        orderProfit(o).toFixed(2),
      ]),
    )
    downloadFile(`orders-${dayKey(new Date())}.csv`, csv, 'text/csv')
  }

  /** Clicking a stat tile resets other filters so the table count matches the tile */
  const showTileFilter = (pseudoStatus: '__open' | '__due') => {
    setQuery('')
    setChannel('')
    setRange('all')
    setStatus(pseudoStatus)
  }

  const hasFilters = Boolean(q || status || channel || range !== 'all')

  const columns: Array<Column<Order>> = [
    {
      key: 'number',
      header: 'Order',
      render: (o) => <span className={cn('font-mono text-[13px] font-medium text-ink', dim(o))}>{o.number}</span>,
      sortValue: (o) => o.number,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (o) => (
        <div className={cn('min-w-0', dim(o))}>
          <div className="font-medium text-ink">{o.customerName}</div>
          <div className="hidden truncate text-xs text-ink-3 md:block">{o.email}</div>
        </div>
      ),
      sortValue: (o) => o.customerName,
    },
    {
      key: 'placedAt',
      header: 'Date',
      render: (o) => (
        <div className={cn(dim(o))}>
          <div className="whitespace-nowrap text-ink-2">{fmtDateShort(o.placedAt)}</div>
          <div className="text-xs text-ink-3">{timeAgo(o.placedAt)}</div>
        </div>
      ),
      sortValue: (o) => new Date(o.placedAt).getTime(),
    },
    {
      key: 'items',
      header: 'Items',
      hideBelow: 'md',
      render: (o) => <span className={cn('text-ink-2', dim(o))}>{itemsSummary(o)}</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      hideBelow: 'lg',
      render: (o) => (
        <span className={cn('inline-flex', dim(o))}>
          <Badge>{o.channel}</Badge>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <span className={cn('inline-flex', dim(o))}>
          <OrderStatusBadge status={o.status} />
        </span>
      ),
      sortValue: (o) => ORDER_STATUSES.indexOf(o.status),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (o) => <span className={cn('tnum font-medium text-ink', dim(o))}>{money(orderRevenue(o))}</span>,
      sortValue: orderRevenue,
    },
    {
      key: 'profit',
      header: 'Profit',
      align: 'right',
      hideBelow: 'lg',
      render: (o) => {
        const p = orderProfit(o)
        return (
          <span className={cn('tnum font-medium', p >= 0 ? 'text-[#006300] dark:text-good' : 'text-critical', dim(o))}>
            {money(p)}
          </span>
        )
      },
      sortValue: orderProfit,
    },
  ]

  const selected = selectedId ? (orders.find((o) => o.id === selectedId) ?? null) : null

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every sale across channels — track, fulfil, and keep customers smiling."
        actions={
          <>
            <Button variant="outline" icon={<Download />} onClick={exportCsv} disabled={filtered.length === 0}>
              Export CSV
            </Button>
            <Button icon={<Plus />} onClick={() => setCreateOpen(true)}>
              New order
            </Button>
          </>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonTable rows={8} />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Open orders"
              value={num(stats.open)}
              icon={<ShoppingCart />}
              clickHint="Filter the table to open orders"
              onClick={() => showTileFilter('__open')}
            />
            <Stat
              label="Due to ship"
              value={
                <span className="flex items-baseline gap-2">
                  {num(stats.due)}
                  {stats.overdue > 0 && (
                    <span className="text-[13px] font-semibold text-critical">{stats.overdue} overdue</span>
                  )}
                </span>
              }
              icon={<Truck />}
              clickHint="Filter the table to orders due to ship"
              onClick={() => showTileFilter('__due')}
            />
            <Stat
              label="Revenue this month"
              value={moneyCompact(stats.monthRevenue)}
              icon={<Wallet />}
              clickHint="Open accounting for the monthly P&L"
              onClick={() => navigate('/accounting')}
            />
            <Stat
              label="Average order value"
              value={money(stats.aov)}
              icon={<Receipt />}
              clickHint="Open analytics for order trends"
              onClick={() => navigate('/analytics')}
            />
          </div>

          <div>
            <FilterBar>
              <SearchInput
                aria-label="Search orders"
                placeholder="Search number, customer, email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                containerClassName="w-full sm:w-64"
              />
              <Select
                aria-label="Filter by status"
                placeholder="All statuses"
                options={[
                  { value: '__open', label: 'Open (any active)' },
                  { value: '__due', label: 'Due to ship' },
                  ...ORDER_STATUSES.map((s) => ({ value: s, label: s })),
                ]}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-44"
              />
              <Select
                aria-label="Filter by channel"
                placeholder="All channels"
                options={CHANNELS}
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-36"
              />
              <Segmented<Range>
                options={[
                  { value: '7d', label: '7d' },
                  { value: '30d', label: '30d' },
                  { value: '90d', label: '90d' },
                  { value: 'all', label: 'All' },
                ]}
                value={range}
                onChange={setRange}
                className="ml-auto"
              />
            </FilterBar>

            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(o) => o.id}
              onRowClick={(o) => setSelectedId(o.id)}
              initialSort={{ key: 'placedAt', dir: 'desc' }}
              emptyState={
                <EmptyState
                  icon={<PackageSearch />}
                  title={hasFilters ? 'No orders match your filters' : 'No orders yet'}
                  description={
                    hasFilters
                      ? 'Try widening the date range or clearing the search and filters.'
                      : 'Create your first order and it will show up here.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setStatus('')
                          setChannel('')
                          setRange('all')
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <Button icon={<Plus />} onClick={() => setCreateOpen(true)}>
                        New order
                      </Button>
                    )
                  }
                />
              }
            />
          </div>
        </motion.div>
      )}

      <OrderDrawer order={selected} onClose={() => setSelectedId(null)} onOpenOrder={(id) => setSelectedId(id)} />
      <NewOrderModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
