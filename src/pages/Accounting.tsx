// Accounting — the money truth page. P&L, margins, sales tax, cash flow, and
// downloadable CSV reports. Everything is scoped by the period picker and
// derives live from the store via monthlySeries slices.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, Download, FileSpreadsheet, Receipt } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import {
  Button,
  Card,
  CardHeader,
  Menu,
  MenuItem,
  MenuLabel,
  Segmented,
  SkeletonChart,
  SkeletonStats,
  SkeletonTable,
  Stat,
  PageHeader,
} from '@/components/ui'
import { BarsChart, ChartCard, TrendChart } from '@/components/charts'
import { fmtDate, fmtMonth, money, money0, moneyCompact, num, pct } from '@/lib/format'
import { isRevenueOrder, monthlySeries, orderItemsTotal, type MonthPoint } from '@/lib/metrics'
import { monthKey } from '@/lib/dates'
import { cn, downloadFile, sum, toCsv, useLoaded } from '@/lib/utils'

// ── Periods ──────────────────────────────────────────────────────────────────

type PeriodKey = 'this-month' | 'last-month' | 'quarter' | 'year'

const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]

/** Slice indexes into a trailing-24-month series (last element = current month) */
function periodSlices(months: MonthPoint[], period: PeriodKey): { current: MonthPoint[]; previous: MonthPoint[]; vs: string } {
  const n = months.length // 24
  switch (period) {
    case 'this-month':
      return { current: months.slice(n - 1), previous: months.slice(n - 2, n - 1), vs: 'last month' }
    case 'last-month':
      return { current: months.slice(n - 2, n - 1), previous: months.slice(n - 3, n - 2), vs: 'prior month' }
    case 'quarter':
      return { current: months.slice(n - 3), previous: months.slice(n - 6, n - 3), vs: 'prior quarter' }
    case 'year':
      return { current: months.slice(n - 12), previous: months.slice(0, n - 12), vs: 'prior year' }
  }
}

interface Totals {
  revenue: number
  cost: number
  gross: number
  expenses: number
  otherIncome: number
  net: number
}

function totalsOf(points: MonthPoint[]): Totals {
  return {
    revenue: sum(points.map((p) => p.revenue)),
    cost: sum(points.map((p) => p.cost)),
    gross: sum(points.map((p) => p.profit)),
    expenses: sum(points.map((p) => p.expenses)),
    otherIncome: sum(points.map((p) => p.otherIncome)),
    net: sum(points.map((p) => p.net)),
  }
}

function pctDelta(current: number, previous: number): number {
  if (previous !== 0) return ((current - previous) / Math.abs(previous)) * 100
  return current > 0 ? 100 : 0
}

/** Smooth-scroll to a section of this page by id */
function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function marginPct(part: number, revenue: number): number {
  return revenue > 0 ? (part / revenue) * 100 : 0
}

function periodLabel(points: MonthPoint[]): string {
  if (points.length === 0) return '—'
  const first = fmtMonth(points[0].date.toISOString())
  const last = fmtMonth(points[points.length - 1].date.toISOString())
  return points.length === 1 ? first : `${first} – ${last}`
}

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
}

/** Stat-style tile with a small note line under the value; with `onClick` it renders as a button like Stat */
function NoteStat({
  label,
  value,
  note,
  onClick,
  clickHint,
}: {
  label: string
  value: string
  note: string
  onClick?: () => void
  clickHint?: string
}) {
  const inner = (
    <>
      <div className="text-[13px] font-medium text-ink-3">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      <div className="mt-2 text-xs text-ink-3">{note}</div>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={clickHint}
        aria-label={clickHint ?? label}
        className="card p-5 text-left transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lifted"
      >
        {inner}
      </button>
    )
  }
  return <div className="card p-5">{inner}</div>
}

/** Right-aligned money cell for the P&L table; negatives go critical */
function MoneyCell({ v }: { v: number }) {
  return <td className={cn('whitespace-nowrap px-4 py-2.5 text-right tnum', v < 0 ? 'text-critical' : 'text-ink')}>{money(v)}</td>
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Accounting() {
  const navigate = useNavigate()
  const loaded = useLoaded()
  const orders = useStore((s) => s.orders)
  const expenses = useStore((s) => s.expenses)
  const incomes = useStore((s) => s.incomes)
  const settings = useStore((s) => s.settings)
  const [period, setPeriod] = useState<PeriodKey>('this-month')

  // Trailing 24 months so every period has a comparable prior window.
  const months24 = useMemo(() => monthlySeries(orders, expenses, incomes, 24), [orders, expenses, incomes])
  const months12 = useMemo(() => months24.slice(12), [months24])

  const { current, previous, vs } = useMemo(() => periodSlices(months24, period), [months24, period])
  const t = useMemo(() => totalsOf(current), [current])
  const prev = useMemo(() => totalsOf(previous), [previous])

  // Sales tax collected, bucketed by month (tax is a liability, not revenue).
  // Taxable base = item totals only — shipping isn't taxed at order creation.
  const { taxByMonth, taxableByMonth } = useMemo(() => {
    const tax = new Map<string, number>()
    const taxable = new Map<string, number>()
    for (const o of orders) {
      if (!isRevenueOrder(o)) continue
      const k = monthKey(o.placedAt)
      tax.set(k, (tax.get(k) ?? 0) + o.taxCollected)
      taxable.set(k, (taxable.get(k) ?? 0) + orderItemsTotal(o))
    }
    return { taxByMonth: tax, taxableByMonth: taxable }
  }, [orders])

  const taxCollected = useMemo(() => sum(current.map((p) => taxByMonth.get(p.key) ?? 0)), [current, taxByMonth])
  const incomeTaxSetAside = 0.25 * Math.max(0, t.net)

  const grossMargin = marginPct(t.gross, t.revenue)
  const netMargin = marginPct(t.net, t.revenue)

  // Chart data — trailing 12 months regardless of the period picker.
  const cashFlowData = useMemo(
    () => months12.map((p) => ({ month: fmtMonth(p.date.toISOString()), net: Math.round(p.net * 100) / 100 })),
    [months12],
  )
  const marginData = useMemo(
    () =>
      months12.map((p) => ({
        month: fmtMonth(p.date.toISOString()),
        gross: Math.round(marginPct(p.profit, p.revenue) * 10) / 10,
        net: Math.round(marginPct(p.net, p.revenue) * 10) / 10,
      })),
    [months12],
  )

  const pnlRows = useMemo(() => [...months12.slice(-6)].reverse(), [months12])

  // ── Downloads ──────────────────────────────────────────────────────────────

  function downloadPnl() {
    const label = periodLabel(current)
    const meta = toCsv(
      [settings.businessName, ''],
      [
        ['Report', 'Profit & loss'],
        ['Period', label],
        ['Currency', settings.currency],
        ['Generated', fmtDate(new Date().toISOString())],
      ],
    )
    const headers = ['Month', 'Revenue', 'COGS', 'Gross profit', 'Expenses', 'Other income', 'Net']
    const rows: unknown[][] = current.map((p) => [
      fmtMonth(p.date.toISOString()),
      p.revenue.toFixed(2),
      p.cost.toFixed(2),
      p.profit.toFixed(2),
      p.expenses.toFixed(2),
      p.otherIncome.toFixed(2),
      p.net.toFixed(2),
    ])
    rows.push([
      'Total',
      t.revenue.toFixed(2),
      t.cost.toFixed(2),
      t.gross.toFixed(2),
      t.expenses.toFixed(2),
      t.otherIncome.toFixed(2),
      t.net.toFixed(2),
    ])
    downloadFile(`tinymagic-report-${period}.csv`, `${meta}\n\n${toCsv(headers, rows)}`, 'text/csv')
    toast('P&L report downloaded', { description: `Profit & loss for ${label}.`, tone: 'success' })
  }

  function downloadTaxSummary() {
    const label = periodLabel(current)
    const meta = toCsv(
      [settings.businessName, ''],
      [
        ['Report', 'Sales tax summary'],
        ['Period', label],
        ['Sales tax rate', pct(settings.taxRate, 2)],
        ['Generated', fmtDate(new Date().toISOString())],
      ],
    )
    const headers = ['Month', 'Taxable revenue', 'Tax collected']
    const rows: unknown[][] = current.map((p) => [
      fmtMonth(p.date.toISOString()),
      (taxableByMonth.get(p.key) ?? 0).toFixed(2),
      (taxByMonth.get(p.key) ?? 0).toFixed(2),
    ])
    rows.push([
      'Total',
      sum(current.map((p) => taxableByMonth.get(p.key) ?? 0)).toFixed(2),
      taxCollected.toFixed(2),
    ])
    downloadFile(`tinymagic-sales-tax-${period}.csv`, `${meta}\n\n${toCsv(headers, rows)}`, 'text/csv')
    toast('Sales tax summary downloaded', { description: `Tax collected for ${label}.`, tone: 'success' })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="space-y-6">
        <PageHeader title="Accounting" description="Profit & loss, margins, and tax estimates" />
        <SkeletonStats />
        <SkeletonStats count={3} />
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
        <SkeletonTable rows={6} />
      </div>
    )
  }

  return (
    <motion.div {...fadeUp} className="space-y-6">
      <PageHeader
        title="Accounting"
        description="Profit & loss, margins, and tax estimates"
        actions={
          <Menu
            trigger={
              <Button icon={<Download />}>
                Download report
                <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
              </Button>
            }
          >
            <MenuLabel>Export · {periodLabel(current)}</MenuLabel>
            <MenuItem icon={<FileSpreadsheet />} onSelect={downloadPnl}>
              P&amp;L report (CSV)
            </MenuItem>
            <MenuItem icon={<Receipt />} onSelect={downloadTaxSummary}>
              Sales tax summary (CSV)
            </MenuItem>
          </Menu>
        }
      />

      {/* Period picker scopes every figure below */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented options={PERIOD_OPTIONS} value={period} onChange={setPeriod} size="md" />
        <span className="text-[13px] text-ink-3">{periodLabel(current)}</span>
      </div>

      {/* Stat row 1 — the P&L headline */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Revenue"
          value={money0(t.revenue)}
          delta={{ pct: pctDelta(t.revenue, prev.revenue), vs }}
          clickHint="Open income to see every revenue entry"
          onClick={() => navigate('/admin/income')}
        />
        <Stat
          label={`Gross profit · ${pct(grossMargin, 0)} margin`}
          value={money0(t.gross)}
          delta={{ pct: pctDelta(t.gross, prev.gross), vs }}
          clickHint="Jump to the margins chart"
          onClick={() => jumpTo('margins-chart')}
        />
        <Stat
          label={`Net profit · ${pct(netMargin, 0)} margin`}
          value={money0(t.net)}
          delta={{ pct: pctDelta(t.net, prev.net), vs }}
          clickHint="Jump to the cash flow chart"
          onClick={() => jumpTo('cash-flow-chart')}
        />
        <Stat
          label="Net cash flow"
          value={money0(t.net)}
          trend={months12.map((p) => p.net)}
          clickHint="Jump to the cash flow chart"
          onClick={() => jumpTo('cash-flow-chart')}
        />
      </div>

      {/* Stat row 2 — taxes & spend */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NoteStat
          label="Sales tax collected"
          value={money(taxCollected)}
          note={`Sales tax rate: ${pct(settings.taxRate, 2)}`}
          clickHint="Download the sales tax summary CSV"
          onClick={downloadTaxSummary}
        />
        <NoteStat
          label="Estimated income tax"
          value={money0(incomeTaxSetAside)}
          note="25% set-aside of net profit for the period"
          clickHint="Jump to the monthly P&L"
          onClick={() => jumpTo('monthly-pnl')}
        />
        <NoteStat
          label="Expenses"
          value={money0(t.expenses)}
          note={`${pct(marginPct(t.expenses, t.revenue), 0)} of revenue this period`}
          clickHint="Open expenses to see where the money went"
          onClick={() => navigate('/admin/expenses')}
        />
      </div>

      {/* Charts — trailing 12 months */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div id="cash-flow-chart">
          <ChartCard
            className="h-full"
            title="Cash flow"
            subtitle="Revenue − COGS − expenses + other income"
            table={{
              headers: ['Month', 'Net cash flow'],
              rows: months12.map((p) => [fmtMonth(p.date.toISOString()), money(p.net)]),
            }}
          >
            <BarsChart
              data={cashFlowData}
              xKey="month"
              series={[{ key: 'net', name: 'Net cash flow', color: 0 }]}
              valueFormatter={(v) => moneyCompact(v)}
              height={240}
            />
          </ChartCard>
        </div>

        <div id="margins-chart">
          <ChartCard
            className="h-full"
            title="Margins"
            subtitle="Gross and net margin, trailing 12 months"
            table={{
              headers: ['Month', 'Gross margin', 'Net margin'],
              rows: marginData.map((d) => [d.month, pct(d.gross, 1), pct(d.net, 1)]),
            }}
          >
            <TrendChart
              data={marginData}
              xKey="month"
              series={[
                { key: 'gross', name: 'Gross margin', color: 0 },
                { key: 'net', name: 'Net margin', color: 1 },
              ]}
              valueFormatter={(v) => `${v.toFixed(0)}%`}
              height={240}
            />
          </ChartCard>
        </div>
      </div>

      {/* Monthly P&L */}
      <Card id="monthly-pnl" padding="none" className="overflow-hidden">
        <div className="p-5 pb-0">
          <CardHeader
            title="Monthly P&L"
            subtitle="Last 6 months, most recent first"
            actions={<span className="text-xs text-ink-3">{num(pnlRows.length)} months</span>}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-edge bg-sunken/50">
                <th scope="col" className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Month
                </th>
                {['Revenue', 'COGS', 'Gross', 'Expenses', 'Other', 'Net'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pnlRows.map((p) => (
                <tr key={p.key} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-ink-2">{fmtMonth(p.date.toISOString())}</td>
                  <MoneyCell v={p.revenue} />
                  <MoneyCell v={p.cost} />
                  <MoneyCell v={p.profit} />
                  <MoneyCell v={p.expenses} />
                  <MoneyCell v={p.otherIncome} />
                  <td className={cn('whitespace-nowrap px-4 py-2.5 text-right font-semibold tnum', p.net < 0 ? 'text-critical' : 'text-ink')}>
                    {money(p.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  )
}
