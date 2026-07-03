import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MoreHorizontal, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import type { IncomeCategory, IncomeEntry } from '@/data/types'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  SkeletonChart,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Textarea,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { ChartCard, DonutChart, TrendChart, foldSlices } from '@/components/charts'
import { fmtDate, fmtDateShort, fmtMonth, money, money0, moneyCompact } from '@/lib/format'
import { isRevenueOrder, monthTotals, monthlySeries, orderRevenue, rangeTotals } from '@/lib/metrics'
import { addDays, dayKey, startOfDay } from '@/lib/dates'
import { sum, uid, useDebounced, useLoaded } from '@/lib/utils'

const INCOME_CATEGORIES: IncomeCategory[] = ['Sales', 'Wholesale', 'Commissions', 'Workshops', 'Other']

const CATEGORY_TONE: Record<IncomeCategory, BadgeTone> = {
  Sales: 'green',
  Wholesale: 'blue',
  Commissions: 'orange',
  Workshops: 'violet',
  Other: 'neutral',
}

interface EntryForm {
  date: string
  source: string
  category: IncomeCategory | ''
  amount: string
  notes: string
}

function emptyForm(): EntryForm {
  return { date: dayKey(new Date()), source: '', category: '', amount: '', notes: '' }
}

/** Convert a YYYY-MM-DD input value to a local-noon ISO stamp */
function dateInputToIso(value: string): string {
  return new Date(`${value}T12:00:00`).toISOString()
}

/** Smooth-scroll a stat tile's detail section into view (offset for the sticky topbar via scroll-mt) */
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function Income() {
  const loaded = useLoaded()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const orders = useStore((s) => s.orders)
  const expenses = useStore((s) => s.expenses)
  const incomes = useStore((s) => s.incomes)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)

  // ── Filters ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const debouncedQuery = useDebounced(query, 200)
  const [category, setCategory] = useState('')
  const [range, setRange] = useState<'1m' | '6m' | '12m'>('12m')

  // ── Modal state ────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<IncomeEntry | null>(null)
  const [form, setForm] = useState<EntryForm>(emptyForm)
  const [deleting, setDeleting] = useState<IncomeEntry | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (entry: IncomeEntry) => {
    setEditing(entry)
    setForm({
      date: dayKey(entry.date),
      source: entry.source,
      category: entry.category,
      amount: String(entry.amount),
      notes: entry.notes ?? '',
    })
    setModalOpen(true)
  }

  // ?new=1 auto-opens the create modal
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreate()
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Derived metrics ────────────────────────────────────────────────────────
  const month = useMemo(() => monthTotals(orders, expenses, incomes), [orders, expenses, incomes])

  const ytd = useMemo(() => {
    const from = new Date(new Date().getFullYear(), 0, 1)
    const to = addDays(startOfDay(new Date()), 1)
    return rangeTotals(orders, expenses, incomes, from, to)
  }, [orders, expenses, incomes])

  const trendMonths = range === '6m' ? 6 : 12
  const rangeLabel = range === '1m' ? '30 days' : `${trendMonths} months`
  const trendData = useMemo(() => {
    // 1m shows daily points; monthlySeries doesn't bucket manual income, so
    // for the daily view we bucket both sales and other income by day here.
    if (range === '1m') {
      const start = startOfDay(addDays(new Date(), -29))
      const days = new Map<string, { date: Date; sales: number; other: number }>()
      for (let i = 0; i < 30; i++) {
        const date = addDays(start, i)
        days.set(dayKey(date), { date, sales: 0, other: 0 })
      }
      for (const o of orders) {
        if (!isRevenueOrder(o)) continue
        const d = days.get(dayKey(o.placedAt))
        if (d) d.sales += orderRevenue(o)
      }
      for (const inc of incomes) {
        const d = days.get(dayKey(inc.date))
        if (d) d.other += inc.amount
      }
      return [...days.values()].map((d) => ({
        label: fmtDateShort(d.date.toISOString()),
        sales: Math.round(d.sales * 100) / 100,
        other: Math.round(d.other * 100) / 100,
      }))
    }
    return monthlySeries(orders, expenses, incomes, trendMonths).map((p) => ({
      label: fmtMonth(p.date.toISOString()),
      sales: Math.round(p.revenue * 100) / 100,
      other: Math.round(p.otherIncome * 100) / 100,
    }))
  }, [orders, expenses, incomes, range, trendMonths])

  const channelSlices = useMemo(() => {
    const cutoff = addDays(startOfDay(new Date()), -89).getTime()
    const totals = new Map<string, number>()
    for (const o of orders) {
      if (!isRevenueOrder(o)) continue
      if (new Date(o.placedAt).getTime() < cutoff) continue
      totals.set(o.channel, (totals.get(o.channel) ?? 0) + orderRevenue(o))
    }
    return foldSlices(
      [...totals.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    )
  }, [orders])

  // ── Manual entries table ───────────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return incomes.filter((e) => {
      if (category && e.category !== category) return false
      if (!q) return true
      return e.source.toLowerCase().includes(q) || (e.notes ?? '').toLowerCase().includes(q)
    })
  }, [incomes, debouncedQuery, category])

  const columns: Array<Column<IncomeEntry>> = [
    {
      key: 'date',
      header: 'Date',
      render: (e) => <span className="whitespace-nowrap text-ink-2">{fmtDate(e.date)}</span>,
      sortValue: (e) => new Date(e.date).getTime(),
      width: 'w-32',
    },
    {
      key: 'source',
      header: 'Source',
      render: (e) => <span className="font-medium text-ink">{e.source}</span>,
      sortValue: (e) => e.source,
    },
    {
      key: 'category',
      header: 'Category',
      render: (e) => <Badge tone={CATEGORY_TONE[e.category]}>{e.category}</Badge>,
      sortValue: (e) => e.category,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (e) => <span className="block max-w-[280px] truncate text-ink-3">{e.notes ?? '—'}</span>,
      hideBelow: 'md',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (e) => <span className="tnum font-medium text-ink">{money(e.amount)}</span>,
      sortValue: (e) => e.amount,
      align: 'right',
      width: 'w-32',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      render: (e) => (
        <Menu
          trigger={
            <IconButton label={`Actions for ${e.source}`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<Pencil />} onSelect={() => openEdit(e)}>
            Edit
          </MenuItem>
          <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(e)}>
            Delete
          </MenuItem>
        </Menu>
      ),
      align: 'right',
      width: 'w-14',
    },
  ]

  // ── Form handling ──────────────────────────────────────────────────────────
  const amountNum = Number(form.amount)
  const formValid =
    form.date.length > 0 &&
    form.source.trim().length > 0 &&
    form.category !== '' &&
    form.amount.trim() !== '' &&
    Number.isFinite(amountNum) &&
    amountNum > 0

  const submitForm = () => {
    if (!formValid || form.category === '') return
    if (editing) {
      updateItem('incomes', editing.id, {
        date: dateInputToIso(form.date),
        source: form.source.trim(),
        category: form.category,
        amount: amountNum,
        notes: form.notes.trim() || undefined,
      })
      toast('Income entry updated', { tone: 'success' })
    } else {
      addItem('incomes', {
        id: uid('inc'),
        date: dateInputToIso(form.date),
        source: form.source.trim(),
        category: form.category,
        amount: amountNum,
        notes: form.notes.trim() || undefined,
      })
      toast('Income recorded', { tone: 'success', description: `${form.source.trim()} — ${money(amountNum)}` })
    }
    setModalOpen(false)
  }

  const confirmDelete = () => {
    if (!deleting) return
    removeItem('incomes', deleting.id)
    toast('Income entry deleted', { tone: 'success' })
    setDeleting(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasAnyEntries = incomes.length > 0
  const hasFilters = debouncedQuery.trim() !== '' || category !== ''

  return (
    <div>
      <PageHeader
        title="Income"
        description="Sales revenue from orders plus everything you record by hand — fairs, wholesale, workshops."
        actions={
          <Button icon={<Plus />} onClick={openCreate}>
            Record income
          </Button>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <div className="grid gap-4 lg:grid-cols-5">
            <SkeletonChart className="lg:col-span-3" />
            <SkeletonChart className="lg:col-span-2" />
          </div>
          <SkeletonTable />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Total income this month"
              value={money0(month.revenue + month.otherIncome)}
              clickHint="Jump to the income-over-time chart"
              onClick={() => scrollToSection('income-trend')}
            />
            <Stat
              label="Sales revenue this month"
              value={money0(month.revenue)}
              clickHint="Open orders — the source of sales revenue"
              onClick={() => navigate('/orders')}
            />
            <Stat
              label="Other income this month"
              value={money0(month.otherIncome)}
              clickHint="Jump to the manual income entries"
              onClick={() => scrollToSection('manual-entries')}
            />
            <Stat
              label="Year to date"
              value={money0(ytd.revenue + ytd.otherIncome)}
              clickHint="Show the last 12 months on the income chart"
              onClick={() => {
                setRange('12m')
                scrollToSection('income-trend')
              }}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Anchor div: ChartCard has no id prop, and the stat tiles scroll here */}
            <div id="income-trend" className="scroll-mt-20 lg:col-span-3">
              <ChartCard
                title="Income over time"
                subtitle={`Sales vs. other income, last ${rangeLabel}`}
                className="h-full"
                actions={
                  <Segmented
                    options={[
                      { value: '1m', label: '1M' },
                      { value: '6m', label: '6m' },
                      { value: '12m', label: '12m' },
                    ]}
                    value={range}
                    onChange={setRange}
                  />
                }
                table={{
                  headers: [range === '1m' ? 'Day' : 'Month', 'Sales', 'Other income'],
                  rows: trendData.map((p) => [p.label, money(p.sales), money(p.other)]),
                }}
              >
                <TrendChart
                  data={trendData}
                  xKey="label"
                  series={[
                    { key: 'sales', name: 'Sales', color: 0 },
                    { key: 'other', name: 'Other income', color: 1 },
                  ]}
                  valueFormatter={moneyCompact}
                />
              </ChartCard>
            </div>

            <ChartCard
              title="By channel"
              subtitle="Order revenue, last 90 days"
              className="lg:col-span-2"
              table={{
                headers: ['Channel', 'Revenue'],
                rows: channelSlices.map((s) => [s.name, money(s.value)]),
              }}
            >
              {channelSlices.length === 0 ? (
                <EmptyState
                  icon={<Wallet />}
                  title="No sales yet"
                  description="Order revenue from the last 90 days will break down by channel here."
                />
              ) : (
                <DonutChart data={channelSlices} valueFormatter={moneyCompact} centerLabel="90-day revenue" size={180} />
              )}
            </ChartCard>
          </div>

          <section id="manual-entries" className="scroll-mt-20 space-y-0">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Manual entries</h2>
            <FilterBar>
              <SearchInput
                aria-label="Search income entries"
                placeholder="Search by source or notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                containerClassName="w-full sm:w-64"
              />
              <Select
                aria-label="Filter by category"
                placeholder="All categories"
                options={INCOME_CATEGORIES}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-44"
              />
              <span className="ml-auto text-xs text-ink-3 tnum">
                {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'} ·{' '}
                {money(sum(filteredEntries.map((e) => e.amount)))}
              </span>
            </FilterBar>
            <DataTable
              columns={columns}
              rows={filteredEntries}
              rowKey={(e) => e.id}
              initialSort={{ key: 'date', dir: 'desc' }}
              emptyState={
                hasAnyEntries && hasFilters ? (
                  <EmptyState
                    icon={<Wallet />}
                    title="No entries match"
                    description="Try a different search or clear the category filter."
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setCategory('')
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<Wallet />}
                    title="No income recorded yet"
                    description="Log craft fairs, wholesale orders, workshops and other income outside of your shop orders."
                    action={
                      <Button icon={<Plus />} onClick={openCreate}>
                        Record income
                      </Button>
                    }
                  />
                )
              }
            />
          </section>
        </motion.div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit income entry' : 'Record income'}
        description={editing ? undefined : 'Log income that came in outside of your shop orders.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!formValid} onClick={submitForm}>
              {editing ? 'Save changes' : 'Record income'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </Field>
          <Field label="Source" required className="sm:col-span-2">
            <Input
              placeholder="e.g. Makers Market booth, wholesale order…"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            />
          </Field>
          <Field label="Category" required className="sm:col-span-2">
            <Select
              placeholder="Choose a category"
              options={INCOME_CATEGORIES}
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as IncomeCategory | '' }))}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              placeholder="Anything worth remembering (optional)"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        danger
        title="Delete income entry?"
        description={
          deleting ? `"${deleting.source}" (${money(deleting.amount)}) will be removed permanently.` : undefined
        }
        confirmLabel="Delete"
      />
    </div>
  )
}
