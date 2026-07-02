import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Clock,
  Factory,
  Globe,
  Mail,
  Package,
  Phone,
  Plus,
  ShoppingCart,
  Star,
  Truck,
  User,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DetailLabel,
  DetailRow,
  Drawer,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  SkeletonStats,
  SkeletonTable,
  Stat,
  StockBadge,
  Textarea,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Material, Supplier, TaskItem } from '@/data/types'
import { money, num } from '@/lib/format'
import { addDays } from '@/lib/dates'
import { cn, uid, useDebounced, useLoaded } from '@/lib/utils'

// ── Small pieces ─────────────────────────────────────────────────────────────

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${rating} of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn('h-3.5 w-3.5', i <= rating ? 'fill-current text-warn' : 'text-hairline')}
        />
      ))}
    </span>
  )
}

function ContactLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
      <span className="shrink-0 text-ink-3 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  )
}

function ensureHttps(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

// ── Supplier card ────────────────────────────────────────────────────────────

function SupplierCard({
  supplier,
  materials,
  onOpen,
}: {
  supplier: Supplier
  materials: Material[]
  onOpen: () => void
}) {
  const linked = materials.filter((m) => m.supplierId === supplier.id)
  const low = linked.filter((m) => m.stock <= m.reorderPoint)
  return (
    <button
      onClick={onOpen}
      className="card flex flex-col gap-3 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lifted"
    >
      <div className="flex items-start gap-3">
        <SupplierAvatar name={supplier.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-ink">{supplier.name}</span>
            <Badge>{supplier.category}</Badge>
          </div>
          <Stars rating={supplier.rating} className="mt-1" />
        </div>
      </div>
      <div className="space-y-1.5">
        {supplier.contactName && <ContactLine icon={<User />}>{supplier.contactName}</ContactLine>}
        {supplier.email && <ContactLine icon={<Mail />}>{supplier.email}</ContactLine>}
        {supplier.phone && <ContactLine icon={<Phone />}>{supplier.phone}</ContactLine>}
        {supplier.website && <ContactLine icon={<Globe />}>{supplier.website}</ContactLine>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-hairline pt-3">
        <Badge tone="blue">{supplier.leadTimeDays}d lead</Badge>
        <Badge>
          {linked.length} material{linked.length === 1 ? '' : 's'}
        </Badge>
        {low.length > 0 && (
          <Badge tone="orange" dot>
            {low.length} low
          </Badge>
        )}
      </div>
    </button>
  )
}

// Initials tile on a soft hue gradient, square-cornered to suit the card grid
function SupplierAvatar({ name }: { name: string }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      aria-hidden
      className="inline-flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl text-[13px] font-semibold"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${(hue + 40) % 360} 60% 82%))`,
        color: `hsl(${hue} 55% 30%)`,
      }}
    >
      {initials}
    </span>
  )
}

// ── Modal form ───────────────────────────────────────────────────────────────

interface SupplierForm {
  name: string
  category: string
  contactName: string
  email: string
  phone: string
  website: string
  leadTimeDays: string
  rating: string
  notes: string
}

const emptyForm: SupplierForm = {
  name: '',
  category: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  leadTimeDays: '5',
  rating: '4',
  notes: '',
}

function formFromSupplier(s: Supplier): SupplierForm {
  return {
    name: s.name,
    category: s.category,
    contactName: s.contactName ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    website: s.website ?? '',
    leadTimeDays: String(s.leadTimeDays),
    rating: String(s.rating),
    notes: s.notes ?? '',
  }
}

function SupplierModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Supplier | null
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const [form, setForm] = useState<SupplierForm>(emptyForm)

  useEffect(() => {
    if (open) setForm(editing ? formFromSupplier(editing) : emptyForm)
  }, [open, editing])

  const set = (patch: Partial<SupplierForm>) => setForm((f) => ({ ...f, ...patch }))
  const valid = form.name.trim().length > 0 && form.category.trim().length > 0

  const submit = () => {
    if (!valid) return
    const patch = {
      name: form.name.trim(),
      category: form.category.trim(),
      contactName: form.contactName.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      website: form.website.trim() || undefined,
      leadTimeDays: Math.max(0, Number(form.leadTimeDays) || 0),
      rating: Math.min(5, Math.max(1, Number(form.rating) || 4)),
      notes: form.notes.trim() || undefined,
    }
    if (editing) {
      updateItem('suppliers', editing.id, patch)
      toast('Supplier updated', { tone: 'success' })
    } else {
      addItem('suppliers', { id: uid('sup'), createdAt: new Date().toISOString(), ...patch })
      toast('Supplier added', { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit supplier' : 'New supplier'}
      description={editing ? undefined : 'Add a vendor you order materials from.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Add supplier'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Polymaker Direct"
            autoFocus
          />
        </Field>
        <Field label="Category" required>
          <Input
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
            placeholder="e.g. Filament"
          />
        </Field>
        <Field label="Contact name">
          <Input
            value={form.contactName}
            onChange={(e) => set({ contactName: e.target.value })}
            placeholder="Optional"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="orders@vendor.com"
          />
        </Field>
        <Field label="Phone">
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="(555) 555-0100"
          />
        </Field>
        <Field label="Website">
          <Input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="vendor.com" />
        </Field>
        <Field label="Lead time (days)">
          <Input
            type="number"
            min={0}
            value={form.leadTimeDays}
            onChange={(e) => set({ leadTimeDays: e.target.value })}
          />
        </Field>
        <Field label="Rating">
          <Select
            value={form.rating}
            onChange={(e) => set({ rating: e.target.value })}
            options={[
              { value: '5', label: '★★★★★ — Excellent' },
              { value: '4', label: '★★★★ — Good' },
              { value: '3', label: '★★★ — OK' },
              { value: '2', label: '★★ — Poor' },
              { value: '1', label: '★ — Avoid' },
            ]}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Discounts, minimums, shipping quirks…"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Suppliers() {
  const suppliers = useStore((s) => s.suppliers)
  const materials = useStore((s) => s.materials)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)

  const loaded = useLoaded()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const debouncedQuery = useDebounced(query)
  const [category, setCategory] = useState('')
  const [topRatedOnly, setTopRatedOnly] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

  const categories = useMemo(
    () => [...new Set(suppliers.map((s) => s.category))].sort((a, b) => a.localeCompare(b)),
    [suppliers],
  )

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return suppliers
      .filter((s) => !category || s.category === category)
      .filter((s) => !topRatedOnly || s.rating === 5)
      .filter(
        (s) =>
          !q ||
          [s.name, s.category, s.contactName ?? '', s.email ?? '', s.website ?? '']
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [suppliers, debouncedQuery, category, topRatedOnly])

  const avgLead = suppliers.length
    ? suppliers.reduce((a, s) => a + s.leadTimeDays, 0) / suppliers.length
    : 0
  const sourced = materials.filter((m) => m.supplierId).length
  const topRated = suppliers.filter((s) => s.rating === 5).length

  const selected = openId ? (suppliers.find((s) => s.id === openId) ?? null) : null
  const selectedMaterials = selected ? materials.filter((m) => m.supplierId === selected.id) : []

  const draftPO = (supplier: Supplier) => {
    const task: TaskItem = {
      id: uid('tsk'),
      title: `Order from ${supplier.name}`,
      description: `Draft purchase order — typical lead time ${supplier.leadTimeDays}d.`,
      status: 'todo',
      priority: 'medium',
      dueDate: addDays(new Date(), 3).toISOString(),
      tags: ['inventory'],
      createdAt: new Date().toISOString(),
      order: 0,
    }
    addItem('tasks', task)
    toast('PO task added', { tone: 'success', description: `“${task.title}” is on your board.` })
  }

  const deleteSelected = () => {
    if (!selected) return
    // Unlink materials sourced from this supplier so no dangling supplierId remains
    for (const m of materials.filter((x) => x.supplierId === selected.id)) {
      updateItem('materials', m.id, { supplierId: undefined })
    }
    removeItem('suppliers', selected.id)
    setOpenId(null)
    toast('Supplier deleted', { tone: 'success' })
  }

  /** Clicking a stat tile resets other filters so the card grid matches the tile */
  const showTileFilter = (topRated: boolean) => {
    setQuery('')
    setCategory('')
    setTopRatedOnly(topRated)
  }

  const hasFilters = Boolean(debouncedQuery.trim() || category || topRatedOnly)

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="The vendors behind your materials — contacts, lead times, and reorder shortcuts."
        actions={
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditing(null)
              setModalOpen(true)
            }}
          >
            New supplier
          </Button>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <SkeletonStats />
          <SkeletonTable rows={5} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="Suppliers"
              value={num(suppliers.length)}
              icon={<Factory />}
              clickHint="Show all suppliers — clear filters"
              onClick={() => showTileFilter(false)}
            />
            <Stat
              label="Avg lead time"
              value={`${avgLead.toFixed(1)}d`}
              icon={<Clock />}
              clickHint="View all suppliers"
              onClick={() => showTileFilter(false)}
            />
            <Stat
              label="Materials sourced"
              value={num(sourced)}
              icon={<Package />}
              clickHint="Open the materials inventory"
              onClick={() => navigate('/inventory?tab=materials')}
            />
            <Stat
              label="Top rated"
              value={num(topRated)}
              icon={<Star />}
              clickHint="Filter to 5-star suppliers"
              onClick={() => showTileFilter(true)}
            />
          </div>

          <section>
            <FilterBar>
              <SearchInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search suppliers…"
                aria-label="Search suppliers"
                containerClassName="w-full sm:w-72"
              />
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={categories}
                placeholder="All categories"
                aria-label="Filter by category"
                className="w-44"
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Star />}
                aria-pressed={topRatedOnly}
                onClick={() => setTopRatedOnly((v) => !v)}
                className={cn(topRatedOnly && 'border-warn/40 bg-warn-wash text-ink')}
              >
                Top rated only
              </Button>
            </FilterBar>

            {filtered.length === 0 ? (
              <Card padding="none">
                <EmptyState
                  icon={<Truck />}
                  title={hasFilters ? 'No suppliers match' : 'No suppliers yet'}
                  description={
                    hasFilters
                      ? 'Try a different search or clear the category and rating filters.'
                      : 'Add the vendors you buy filament, packaging, and components from.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setCategory('')
                          setTopRatedOnly(false)
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
                        New supplier
                      </Button>
                    )
                  }
                />
              </Card>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
              >
                {filtered.map((s) => (
                  <SupplierCard key={s.id} supplier={s} materials={materials} onOpen={() => setOpenId(s.id)} />
                ))}
              </motion.div>
            )}
          </section>
        </div>
      )}

      {/* ── Detail drawer ── */}
      <Drawer
        open={Boolean(selected)}
        onClose={() => setOpenId(null)}
        title={selected?.name ?? ''}
        subtitle={
          selected && (
            <span className="flex items-center gap-2">
              <Badge>{selected.category}</Badge>
              <Stars rating={selected.rating} />
            </span>
          )
        }
        footer={
          selected && (
            <>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(selected)
                  setModalOpen(true)
                }}
              >
                Edit
              </Button>
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-6">
            <div>
              <DetailLabel>Contact</DetailLabel>
              <div className="mt-1 divide-y divide-hairline">
                <DetailRow label="Contact name">{selected.contactName ?? '—'}</DetailRow>
                <DetailRow label="Email">
                  {selected.email ? (
                    <a className="text-accent hover:underline" href={`mailto:${selected.email}`}>
                      {selected.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow label="Phone">{selected.phone ?? '—'}</DetailRow>
                <DetailRow label="Website">
                  {selected.website ? (
                    <a
                      className="text-accent hover:underline"
                      href={ensureHttps(selected.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {selected.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow label="Lead time">{selected.leadTimeDays} days</DetailRow>
              </div>
            </div>

            {selected.notes && (
              <div>
                <DetailLabel>Notes</DetailLabel>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{selected.notes}</p>
              </div>
            )}

            <div>
              <DetailLabel>Materials from this supplier</DetailLabel>
              {selectedMaterials.length === 0 ? (
                <p className="mt-1.5 text-sm text-ink-3">No materials linked to this supplier yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {selectedMaterials.map((m) => {
                    const low = m.stock <= m.reorderPoint
                    return (
                      <li
                        key={m.id}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5',
                          low ? 'border-serious/40 bg-serious-wash' : 'border-hairline bg-sunken/50',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                            {low && <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0 text-serious" />}
                            <span className="truncate">{m.name}</span>
                          </div>
                          <div className="tnum mt-0.5 text-xs text-ink-3">
                            {money(m.costPerUnit)} / {m.unit}
                          </div>
                        </div>
                        <StockBadge stock={m.stock} reorderPoint={m.reorderPoint} unit={m.unit} />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <Button variant="secondary" icon={<ShoppingCart />} className="w-full" onClick={() => draftPO(selected)}>
              Draft purchase order
            </Button>
          </div>
        )}
      </Drawer>

      <SupplierModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteSelected}
        title="Delete supplier?"
        description={
          selected
            ? `“${selected.name}” will be removed. Materials keep their records but lose the supplier link.`
            : undefined
        }
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
