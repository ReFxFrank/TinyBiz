// Customers — directory of everyone who has bought from the shop, with a
// detail drawer (contact info, favorite products, order history) and CRUD.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Customer, Order } from '@/data/types'
import { customerLifetimeValue, isRevenueOrder, orderRevenue } from '@/lib/metrics'
import { fmtDate, fmtDateShort, money, moneyCompact, num, pct } from '@/lib/format'
import { startOfMonth } from '@/lib/dates'
import { uid, useLoaded } from '@/lib/utils'
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DetailLabel,
  DetailRow,
  Drawer,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Modal,
  OrderStatusBadge,
  PageHeader,
  ProductTile,
  SearchInput,
  Select,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Textarea,
  type BadgeTone,
  type Column,
} from '@/components/ui'

function tagTone(tag: string): BadgeTone {
  if (tag === 'vip') return 'violet'
  if (tag === 'wholesale') return 'blue'
  return 'neutral'
}

function TagBadges({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-ink-3">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t} tone={tagTone(t)}>
          {t}
        </Badge>
      ))}
    </span>
  )
}

// ── Create / edit modal ──────────────────────────────────────────────────────

interface FormState {
  name: string
  email: string
  phone: string
  line1: string
  city: string
  state: string
  zip: string
  tags: string
  notes: string
}

const emptyForm: FormState = {
  name: '',
  email: '',
  phone: '',
  line1: '',
  city: '',
  state: '',
  zip: '',
  tags: '',
  notes: '',
}

function formFromCustomer(c: Customer): FormState {
  return {
    name: c.name,
    email: c.email,
    phone: c.phone ?? '',
    line1: c.address?.line1 ?? '',
    city: c.address?.city ?? '',
    state: c.address?.state ?? '',
    zip: c.address?.zip ?? '',
    tags: c.tags.join(', '),
    notes: c.notes ?? '',
  }
}

function CustomerModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  /** When set, the modal edits this customer instead of creating one */
  editing?: Customer
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (open) setForm(editing ? formFromCustomer(editing) : emptyForm)
  }, [open, editing])

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const valid = form.name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(form.email.trim())

  const submit = () => {
    if (!valid) return
    const tags = form.tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    const address = form.line1.trim()
      ? {
          line1: form.line1.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip: form.zip.trim(),
          country: editing?.address?.country ?? 'USA',
        }
      : undefined
    const patch = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      address,
      tags,
      notes: form.notes.trim() || undefined,
    }
    if (editing) {
      updateItem('customers', editing.id, patch)
      toast('Customer updated', { description: patch.name, tone: 'success' })
    } else {
      addItem('customers', { id: uid('cus'), createdAt: new Date().toISOString(), ...patch })
      toast('Customer added', { description: patch.name, tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit customer' : 'New customer'}
      description={editing ? undefined : 'Add someone to your customer directory.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={set('name')} placeholder="Jordan Ellis" autoFocus />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="jordan@example.com" />
          </Field>
        </div>
        <Field label="Phone">
          <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 010-0000" />
        </Field>
        <div className="space-y-3">
          <DetailLabel>Address</DetailLabel>
          <Field label="Street">
            <Input value={form.line1} onChange={set('line1')} placeholder="123 Maker Lane" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City">
              <Input value={form.city} onChange={set('city')} placeholder="Portland" />
            </Field>
            <Field label="State">
              <Input value={form.state} onChange={set('state')} placeholder="OR" />
            </Field>
            <Field label="ZIP">
              <Input value={form.zip} onChange={set('zip')} placeholder="97201" />
            </Field>
          </div>
        </div>
        <Field label="Tags" hint="Comma-separated, e.g. vip, etsy">
          <Input value={form.tags} onChange={set('tags')} placeholder="vip, etsy" />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Anything worth remembering…" />
        </Field>
      </div>
    </Modal>
  )
}

// ── Detail drawer ────────────────────────────────────────────────────────────

function CustomerDrawer({
  customer,
  onClose,
  onEdit,
  onDelete,
}: {
  customer: Customer
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const orders = useStore((s) => s.orders)
  const products = useStore((s) => s.products)
  const updateItem = useStore((s) => s.updateItem)
  const navigate = useNavigate()

  const [notes, setNotes] = useState(customer.notes ?? '')
  useEffect(() => setNotes(customer.notes ?? ''), [customer.id, customer.notes])

  const theirOrders = useMemo(
    () =>
      orders
        .filter((o) => o.customerId === customer.id)
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()),
    [orders, customer.id],
  )
  const ltv = useMemo(() => customerLifetimeValue(orders, customer.id), [orders, customer.id])
  const revenueOrders = theirOrders.filter(isRevenueOrder)
  const avgOrder = revenueOrders.length ? ltv / revenueOrders.length : 0

  const favorites = useMemo(() => {
    const units = new Map<string, { name: string; units: number }>()
    for (const o of theirOrders) {
      if (!isRevenueOrder(o)) continue
      for (const item of o.items) {
        const cur = units.get(item.productId) ?? { name: item.name, units: 0 }
        cur.units += item.quantity
        units.set(item.productId, cur)
      }
    }
    return [...units.entries()]
      .map(([productId, v]) => ({ productId, ...v, product: products.find((p) => p.id === productId) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 3)
  }, [theirOrders, products])

  const saveNotes = () => {
    updateItem('customers', customer.id, { notes: notes.trim() || undefined })
    toast('Notes saved', { tone: 'success' })
  }

  return (
    <Drawer
      open
      wide
      onClose={onClose}
      title={customer.name}
      subtitle={`Customer since ${fmtDate(customer.createdAt)}`}
      footer={
        <>
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
          <Button variant="secondary" onClick={onEdit}>
            Edit
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-ink">{customer.name}</div>
            <div className="mt-1">
              <TagBadges tags={customer.tags} />
            </div>
          </div>
        </div>

        <div>
          <DetailLabel>Contact</DetailLabel>
          <div className="mt-1 divide-y divide-hairline">
            <DetailRow label="Email">{customer.email}</DetailRow>
            <DetailRow label="Phone">{customer.phone ?? '—'}</DetailRow>
            <DetailRow label="Address">
              {customer.address ? (
                <>
                  {customer.address.line1}
                  <br />
                  {customer.address.city}, {customer.address.state} {customer.address.zip}
                </>
              ) : (
                '—'
              )}
            </DetailRow>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-sunken px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-ink tnum">{num(theirOrders.length)}</div>
            <div className="text-[11px] font-medium text-ink-3">Orders</div>
          </div>
          <div className="rounded-xl bg-sunken px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-ink tnum">{moneyCompact(ltv)}</div>
            <div className="text-[11px] font-medium text-ink-3">Lifetime value</div>
          </div>
          <div className="rounded-xl bg-sunken px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-ink tnum">{money(avgOrder)}</div>
            <div className="text-[11px] font-medium text-ink-3">Avg order</div>
          </div>
        </div>

        <div>
          <DetailLabel>Favorite products</DetailLabel>
          {favorites.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">No purchases yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {favorites.map((f) => (
                <li key={f.productId} className="flex items-center gap-3">
                  <ProductTile emoji={f.product?.image ?? '📦'} hue={f.product?.imageHue ?? 210} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.name}</span>
                  <span className="text-sm text-ink-3 tnum">
                    {num(f.units)} {f.units === 1 ? 'unit' : 'units'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <DetailLabel>Order history</DetailLabel>
          {theirOrders.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">No orders yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-hairline">
              {theirOrders.map((o: Order) => (
                <li key={o.id}>
                  <button
                    onClick={() => navigate(`/admin/orders?q=${encodeURIComponent(o.number)}`)}
                    className="flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-sunken/60"
                  >
                    <span className="font-mono text-xs font-medium text-ink">{o.number}</span>
                    <span className="text-xs text-ink-3">{fmtDateShort(o.placedAt)}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <OrderStatusBadge status={o.status} />
                      <span className="w-20 text-right text-sm font-medium text-ink tnum">
                        {money(orderRevenue(o))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <DetailLabel>Notes</DetailLabel>
          <Textarea
            className="mt-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Private notes about this customer…"
            aria-label="Customer notes"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" onClick={saveNotes} disabled={notes === (customer.notes ?? '')}>
              Save notes
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Customers() {
  const customers = useStore((s) => s.customers)
  const orders = useStore((s) => s.orders)
  const removeItem = useStore((s) => s.removeItem)
  const loaded = useLoaded()
  const navigate = useNavigate()

  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const [tagFilter, setTagFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // ?new=1 auto-opens the create modal
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(undefined)
      setModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const orderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of orders) counts.set(o.customerId, (counts.get(o.customerId) ?? 0) + 1)
    return counts
  }, [orders])

  const ltvById = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of customers) map.set(c.id, customerLifetimeValue(orders, c.id))
    return map
  }, [customers, orders])

  // Stats
  const monthStart = startOfMonth(new Date()).getTime()
  const newThisMonth = customers.filter((c) => new Date(c.createdAt).getTime() >= monthStart).length
  const repeatRate = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of orders.filter(isRevenueOrder)) counts.set(o.customerId, (counts.get(o.customerId) ?? 0) + 1)
    if (!counts.size) return 0
    let repeat = 0
    counts.forEach((c) => {
      if (c >= 2) repeat++
    })
    return (repeat / counts.size) * 100
  }, [orders])
  const avgLtv = useMemo(() => {
    const withOrders = customers.filter((c) => (orderCounts.get(c.id) ?? 0) > 0)
    if (!withOrders.length) return 0
    return withOrders.reduce((acc, c) => acc + (ltvById.get(c.id) ?? 0), 0) / withOrders.length
  }, [customers, orderCounts, ltvById])

  const allTags = useMemo(() => [...new Set(customers.flatMap((c) => c.tags))].sort(), [customers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q)) return false
      if (tagFilter && !c.tags.includes(tagFilter)) return false
      return true
    })
  }, [customers, query, tagFilter])

  const selected = selectedId ? customers.find((c) => c.id === selectedId) : undefined

  /** Clicking a stat tile clears the filters so the table count matches the tile */
  const showAll = () => {
    setQuery('')
    setTagFilter('')
  }

  const columns: Array<Column<Customer>> = [
    {
      key: 'customer',
      header: 'Customer',
      sortValue: (c) => c.name.toLowerCase(),
      render: (c) => (
        <span className="flex items-center gap-3">
          <Avatar name={c.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{c.name}</span>
            <span className="block truncate text-xs text-ink-3">{c.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      hideBelow: 'lg',
      render: (c) => <span className="text-ink-2 tnum">{c.phone ?? '—'}</span>,
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      sortValue: (c) => orderCounts.get(c.id) ?? 0,
      render: (c) => <span className="tnum">{num(orderCounts.get(c.id) ?? 0)}</span>,
    },
    {
      key: 'ltv',
      header: 'Lifetime value',
      align: 'right',
      sortValue: (c) => ltvById.get(c.id) ?? 0,
      render: (c) => <span className="font-medium tnum">{money(ltvById.get(c.id) ?? 0)}</span>,
    },
    {
      key: 'tags',
      header: 'Tags',
      hideBelow: 'md',
      render: (c) => <TagBadges tags={c.tags} />,
    },
    {
      key: 'since',
      header: 'Since',
      hideBelow: 'lg',
      sortValue: (c) => c.createdAt,
      render: (c) => <span className="text-ink-2">{fmtDate(c.createdAt)}</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Everyone who has bought from Nova Prints & Co., with their history and value."
        actions={
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditing(undefined)
              setModalOpen(true)
            }}
          >
            New customer
          </Button>
        }
      />

      <div className="space-y-6">
        {!loaded ? (
          <>
            <SkeletonStats />
            <SkeletonTable />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat
                label="Total customers"
                value={num(customers.length)}
                clickHint="Show every customer"
                onClick={showAll}
              />
              <Stat
                label="New this month"
                value={num(newThisMonth)}
                clickHint="View all customers, newest joins visible via the Since column"
                onClick={showAll}
              />
              <Stat
                label="Repeat rate"
                value={pct(repeatRate)}
                clickHint="Open analytics for repeat purchase trends"
                onClick={() => navigate('/admin/analytics')}
              />
              <Stat
                label="Average lifetime value"
                value={moneyCompact(avgLtv)}
                clickHint="View all customers, sorted by lifetime value"
                onClick={showAll}
              />
            </div>

            <div>
              <FilterBar>
                <SearchInput
                  containerClassName="w-full sm:w-64"
                  placeholder="Search name or email…"
                  aria-label="Search customers"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Select
                  aria-label="Filter by tag"
                  className="w-40"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  placeholder="All tags"
                  options={allTags}
                />
              </FilterBar>

              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(c) => c.id}
                onRowClick={(c) => setSelectedId(c.id)}
                initialSort={{ key: 'ltv', dir: 'desc' }}
                emptyState={
                  <EmptyState
                    icon={<Users />}
                    title="No customers found"
                    description={
                      query || tagFilter
                        ? 'Try a different search or clear the tag filter.'
                        : 'Add your first customer to start tracking their orders and value.'
                    }
                    action={
                      query || tagFilter ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setQuery('')
                            setTagFilter('')
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : (
                        <Button
                          icon={<Plus />}
                          onClick={() => {
                            setEditing(undefined)
                            setModalOpen(true)
                          }}
                        >
                          New customer
                        </Button>
                      )
                    }
                  />
                }
              />
            </div>
          </>
        )}
      </div>

      {selected && (
        <CustomerDrawer
          customer={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => {
            setEditing(selected)
            setModalOpen(true)
          }}
          onDelete={() => setConfirmDelete(true)}
        />
      )}

      <CustomerModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        title="Delete customer?"
        description={
          selected
            ? `${selected.name} will be removed from your directory. Their past orders will remain on the Orders page.`
            : undefined
        }
        confirmLabel="Delete customer"
        onConfirm={() => {
          if (!selected) return
          removeItem('customers', selected.id)
          setSelectedId(null)
          toast('Customer deleted', { description: selected.name, tone: 'success' })
        }}
      />
    </div>
  )
}
