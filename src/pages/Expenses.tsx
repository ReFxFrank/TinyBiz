// Expenses — track every dollar going out: monthly spend trend, category mix,
// recurring commitments, and a filterable ledger with full CRUD.

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, MoreHorizontal, Pencil, Plus, Receipt, RefreshCw, Trash2 } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Expense, ExpenseCategory } from '@/data/types'
import { EXPENSE_CATEGORIES } from '@/data/types'
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
} from '@/components/ui'
import type { BadgeTone, Column } from '@/components/ui'
import { BarsChart, ChartCard, DonutChart, foldSlices } from '@/components/charts'
import { fmtDate, fmtMonth, money, money0, moneyCompact } from '@/lib/format'
import { monthlySeries } from '@/lib/metrics'
import { addDays, dayKey, startOfDay } from '@/lib/dates'
import { downloadFile, sum, toCsv, uid, useLoaded } from '@/lib/utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_TONE: Partial<Record<ExpenseCategory, BadgeTone>> = {
  Software: 'violet',
  Marketing: 'blue',
  Shipping: 'orange',
  Taxes: 'red',
}

function pctDelta(current: number, previous: number): number {
  if (previous !== 0) return ((current - previous) / Math.abs(previous)) * 100
  return current > 0 ? 100 : 0
}

type RangeKey = '30d' | '90d' | 'ytd' | 'all'

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All' },
]

function rangeCutoff(range: RangeKey): number {
  const now = new Date()
  if (range === '30d') return addDays(startOfDay(now), -29).getTime()
  if (range === '90d') return addDays(startOfDay(now), -89).getTime()
  if (range === 'ytd') return new Date(now.getFullYear(), 0, 1).getTime()
  return 0
}

// ── Expense form modal ───────────────────────────────────────────────────────

interface ExpenseFormState {
  date: string
  vendor: string
  category: string
  amount: string
  recurring: '' | 'monthly' | 'yearly'
  notes: string
}

function emptyForm(): ExpenseFormState {
  return { date: dayKey(new Date()), vendor: '', category: '', amount: '', recurring: '', notes: '' }
}

function formFromExpense(e: Expense): ExpenseFormState {
  return {
    date: dayKey(e.date),
    vendor: e.vendor,
    category: e.category,
    amount: String(e.amount),
    recurring: e.recurring ?? '',
    notes: e.notes ?? '',
  }
}

function ExpenseModal({
  open,
  editing,
  onClose,
}: {
  open: boolean
  editing: Expense | null
  onClose: () => void
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const [form, setForm] = useState<ExpenseFormState>(emptyForm)

  useEffect(() => {
    if (open) setForm(editing ? formFromExpense(editing) : emptyForm())
  }, [open, editing])

  const set = (patch: Partial<ExpenseFormState>) => setForm((f) => ({ ...f, ...patch }))

  const amountNum = Number(form.amount)
  const valid =
    form.date.length > 0 &&
    form.vendor.trim().length > 0 &&
    form.category.length > 0 &&
    form.amount.trim().length > 0 &&
    Number.isFinite(amountNum) &&
    amountNum >= 0.01

  const submit = () => {
    if (!valid) return
    const payload = {
      date: new Date(`${form.date}T12:00:00`).toISOString(),
      vendor: form.vendor.trim(),
      category: form.category as ExpenseCategory,
      amount: Math.round(amountNum * 100) / 100,
      recurring: form.recurring === '' ? undefined : form.recurring,
      notes: form.notes.trim() || undefined,
    }
    if (editing) {
      updateItem('expenses', editing.id, payload)
      toast('Expense updated', { tone: 'success' })
    } else {
      addItem('expenses', { id: uid('exp'), ...payload })
      toast('Expense added', { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit expense' : 'New expense'}
      description={editing ? 'Update the details of this expense.' : 'Record money going out of the business.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Add expense'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Vendor" required>
            <Input
              value={form.vendor}
              onChange={(e) => set({ vendor: e.target.value })}
              placeholder="e.g. Prusa Research"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            <Select
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
              placeholder="Select a category…"
              options={[...EXPENSE_CATEGORIES]}
            />
          </Field>
          <Field label="Amount" required>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
              placeholder="0.00"
            />
          </Field>
        </div>
        <Field label="Recurring" hint="Recurring expenses show a repeat badge in the ledger.">
          <Select
            value={form.recurring}
            onChange={(e) => set({ recurring: e.target.value as ExpenseFormState['recurring'] })}
            options={[
              { value: '', label: 'One-time' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
        </Field>
        <Field label="Notes">
          <Textarea
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="What was this for?"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Expenses() {
  const loaded = useLoaded()
  const expenses = useStore((s) => s.expenses)
  const orders = useStore((s) => s.orders)
  const incomes = useStore((s) => s.incomes)
  const removeItem = useStore((s) => s.removeItem)

  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [category, setCategory] = useState('')
  const [range, setRange] = useState<RangeKey>('90d')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)

  // ?new=1 opens the create modal once, then clears the param
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(null)
      setModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const months = useMemo(() => monthlySeries(orders, expenses, incomes, 12), [orders, expenses, incomes])
  const thisMonth = months[months.length - 1]?.expenses ?? 0
  const lastMonth = months[months.length - 2]?.expenses ?? 0

  const recurringMonthly = useMemo(() => {
    // Approximate current commitments: latest monthly entry per unique vendor
    const latest = new Map<string, Expense>()
    for (const e of expenses) {
      if (e.recurring !== 'monthly') continue
      const prev = latest.get(e.vendor)
      if (!prev || new Date(e.date).getTime() > new Date(prev.date).getTime()) latest.set(e.vendor, e)
    }
    return sum([...latest.values()].map((e) => e.amount))
  }, [expenses])

  const largestCategory = useMemo(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
    const byCat = new Map<ExpenseCategory, number>()
    for (const e of expenses) {
      if (new Date(e.date).getTime() < monthStart) continue
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
    }
    const entries = [...byCat.entries()].sort((a, b) => b[1] - a[1])
    return entries.length ? { name: entries[0][0], amount: entries[0][1] } : null
  }, [expenses])

  const yearToDate = useMemo(() => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime()
    return sum(expenses.filter((e) => new Date(e.date).getTime() >= yearStart).map((e) => e.amount))
  }, [expenses])

  // ── Charts ─────────────────────────────────────────────────────────────────
  const monthlyChartData = useMemo(
    () => months.map((p) => ({ month: fmtMonth(p.date.toISOString()), expenses: Math.round(p.expenses * 100) / 100 })),
    [months],
  )

  const categorySlices = useMemo(() => {
    const cutoff = addDays(startOfDay(new Date()), -89).getTime()
    const byCat = new Map<string, number>()
    for (const e of expenses) {
      if (new Date(e.date).getTime() < cutoff) continue
      byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
    }
    return foldSlices(
      [...byCat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      5,
    )
  }, [expenses])

  // ── Table ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cutoff = rangeCutoff(range)
    return expenses.filter((e) => {
      if (cutoff && new Date(e.date).getTime() < cutoff) return false
      if (category && e.category !== category) return false
      if (q && !e.vendor.toLowerCase().includes(q) && !(e.notes ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [expenses, query, category, range])

  const exportCsv = () => {
    const csv = toCsv(
      ['Date', 'Vendor', 'Category', 'Amount', 'Recurring', 'Notes'],
      [...filtered]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((e) => [dayKey(e.date), e.vendor, e.category, e.amount.toFixed(2), e.recurring ?? '', e.notes ?? '']),
    )
    downloadFile(`expenses-${dayKey(new Date())}.csv`, csv, 'text/csv')
    toast('Exported filtered expenses to CSV', { tone: 'success' })
  }

  const columns: Array<Column<Expense>> = [
    {
      key: 'date',
      header: 'Date',
      render: (e) => <span className="whitespace-nowrap text-ink-2">{fmtDate(e.date)}</span>,
      sortValue: (e) => new Date(e.date).getTime(),
      width: 'w-32',
    },
    {
      key: 'vendor',
      header: 'Vendor',
      render: (e) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-ink">{e.vendor}</span>
          {e.recurring && (
            <Badge tone="neutral">
              <RefreshCw className="h-3 w-3" aria-hidden />
              {e.recurring}
            </Badge>
          )}
        </span>
      ),
      sortValue: (e) => e.vendor,
    },
    {
      key: 'category',
      header: 'Category',
      render: (e) => <Badge tone={CATEGORY_TONE[e.category] ?? 'neutral'}>{e.category}</Badge>,
      sortValue: (e) => e.category,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (e) => <span className="block max-w-[280px] truncate text-ink-3">{e.notes ?? '—'}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (e) => <span className="font-medium text-ink tnum">{money(e.amount)}</span>,
      sortValue: (e) => e.amount,
      align: 'right',
      width: 'w-28',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 'w-12',
      render: (e) => (
        <Menu
          trigger={
            <IconButton label={`Actions for ${e.vendor} expense`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem
            icon={<Pencil />}
            onSelect={() => {
              setEditing(e)
              setModalOpen(true)
            }}
          >
            Edit
          </MenuItem>
          <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(e)}>
            Delete
          </MenuItem>
        </Menu>
      ),
    },
  ]

  const hasFilters = query.trim() !== '' || category !== '' || range !== 'all'

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track spend, recurring commitments, and where the money goes."
        actions={
          <>
            <Button variant="outline" icon={<Download />} onClick={exportCsv} disabled={filtered.length === 0}>
              Export CSV
            </Button>
            <Button
              icon={<Plus />}
              onClick={() => {
                setEditing(null)
                setModalOpen(true)
              }}
            >
              New expense
            </Button>
          </>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkeletonChart />
            <SkeletonChart />
          </div>
          <SkeletonTable />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="This month"
              value={money0(thisMonth)}
              delta={{ pct: pctDelta(thisMonth, lastMonth), vs: 'last month', upIsGood: false }}
            />
            <Stat label="Recurring / month" value={money0(recurringMonthly)} icon={<RefreshCw />} />
            <Stat
              label="Largest category this month"
              value={
                largestCategory ? (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    {largestCategory.name}
                    <span className="text-sm font-medium text-ink-3 tnum">{money0(largestCategory.amount)}</span>
                  </span>
                ) : (
                  '—'
                )
              }
            />
            <Stat label="Year to date" value={money0(yearToDate)} trend={months.map((p) => p.expenses)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Monthly spend"
              subtitle="Total expenses per month, trailing 12 months"
              table={{
                headers: ['Month', 'Expenses'],
                rows: monthlyChartData.map((p) => [p.month, money(p.expenses)]),
              }}
            >
              <BarsChart
                data={monthlyChartData}
                xKey="month"
                series={[{ key: 'expenses', name: 'Expenses', color: 0 }]}
                valueFormatter={moneyCompact}
              />
            </ChartCard>
            <ChartCard
              title="By category"
              subtitle="Where the last 90 days of spend went"
              table={{
                headers: ['Category', 'Amount'],
                rows: categorySlices.map((s) => [s.name, money(s.value)]),
              }}
            >
              {categorySlices.length > 0 ? (
                <DonutChart data={categorySlices} valueFormatter={moneyCompact} centerLabel="last 90 days" />
              ) : (
                <EmptyState
                  icon={<Receipt />}
                  title="No spend recorded"
                  description="Expenses from the last 90 days will break down by category here."
                />
              )}
            </ChartCard>
          </div>

          <div>
            <FilterBar>
              <SearchInput
                aria-label="Search expenses by vendor"
                placeholder="Search vendors…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                containerClassName="w-full sm:w-64"
              />
              <Select
                aria-label="Filter by category"
                placeholder="All categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={[...EXPENSE_CATEGORIES]}
                className="w-44"
              />
              <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} className="ml-auto" />
            </FilterBar>

            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(e) => e.id}
              initialSort={{ key: 'date', dir: 'desc' }}
              emptyState={
                <EmptyState
                  icon={<Receipt />}
                  title={hasFilters ? 'No matching expenses' : 'No expenses yet'}
                  description={
                    hasFilters
                      ? 'Try widening the date range or clearing the search and category filters.'
                      : 'Record your first expense to start tracking spend.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setCategory('')
                          setRange('all')
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <Button
                        icon={<Plus />}
                        onClick={() => {
                          setEditing(null)
                          setModalOpen(true)
                        }}
                      >
                        New expense
                      </Button>
                    )
                  }
                />
              }
            />
          </div>
        </div>
      )}

      <ExpenseModal open={modalOpen} editing={editing} onClose={() => setModalOpen(false)} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            removeItem('expenses', deleting.id)
            toast('Expense deleted', { tone: 'success' })
          }
        }}
        title="Delete expense?"
        description={
          deleting
            ? `This removes the ${money(deleting.amount)} ${deleting.vendor} expense from ${fmtDate(deleting.date)}. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
