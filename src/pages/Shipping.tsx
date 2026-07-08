import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Copy, Download, ExternalLink, PackageCheck, Plus, Tag, Truck } from 'lucide-react'
import type { Carrier, Order, Shipment, ShipmentStatus } from '@/data/types'
import { OPEN_STATUSES } from '@/data/types'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import {
  Button,
  DataTable,
  Drawer,
  DetailRow,
  DetailLabel,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  FilterBar,
  SearchInput,
  Select,
  ShipmentStatusBadge,
  SkeletonStats,
  SkeletonTable,
  Stat,
  type Column,
} from '@/components/ui'
import { fmtDateShort, fmtDateTime, money, num, grams } from '@/lib/format'
import { cn, downloadFile, uid, useLoaded } from '@/lib/utils'

const CARRIERS: Carrier[] = ['Canada Post', 'USPS', 'UPS', 'FedEx', 'DHL']

const SHIPMENT_STATUSES: ShipmentStatus[] = ['Label created', 'In transit', 'Out for delivery', 'Delivered', 'Needs attention']

const SERVICES: Record<Carrier, string[]> = {
  'Canada Post': ['Regular Parcel', 'Expedited Parcel', 'Xpresspost'],
  USPS: ['Ground Advantage', 'Priority'],
  UPS: ['Ground'],
  FedEx: ['Home Delivery'],
  DHL: ['Express'],
}

function makeTrackingNumber(): string {
  const group = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
  return `9400 1000 0000 ${group(4)} ${group(4)} ${group(2)}`
}

function copyTracking(trackingNumber: string) {
  void navigator.clipboard.writeText(trackingNumber)
  toast('Tracking number copied', { tone: 'success' })
}

export default function Shipping() {
  const loaded = useLoaded()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const shipments = useStore((s) => s.shipments)
  const orders = useStore((s) => s.orders)
  const products = useStore((s) => s.products)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const setOrderStatus = useStore((s) => s.setOrderStatus)

  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const [carrierFilter, setCarrierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // ?new=1 auto-opens the create-label modal
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const cutoff30 = Date.now() - 30 * 86_400_000
    const inTransit = shipments.filter((s) => s.status === 'In transit' || s.status === 'Out for delivery').length
    const delivered30 = shipments.filter(
      (s) => s.status === 'Delivered' && s.deliveredAt && new Date(s.deliveredAt).getTime() >= cutoff30,
    ).length
    const recent = shipments.filter((s) => new Date(s.shippedAt).getTime() >= cutoff30)
    const avgCost = recent.length ? recent.reduce((a, s) => a + s.cost, 0) / recent.length : 0
    const needsAttention = shipments.filter((s) => s.status === 'Needs attention').length
    return { inTransit, delivered30, avgCost, needsAttention }
  }, [shipments])

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return shipments.filter((s) => {
      if (carrierFilter && s.carrier !== carrierFilter) return false
      // '__moving' is the pseudo-filter behind the "In transit" stat tile
      if (statusFilter === '__moving') {
        if (s.status !== 'In transit' && s.status !== 'Out for delivery') return false
      } else if (statusFilter && s.status !== statusFilter) return false
      if (q) {
        const haystack = `${s.orderNumber} ${s.customerName} ${s.trackingNumber}`.toLowerCase()
        if (!haystack.includes(q) && !s.trackingNumber.replace(/\s/g, '').includes(q.replace(/\s/g, ''))) return false
      }
      return true
    })
  }, [shipments, query, carrierFilter, statusFilter])

  /** Clicking a stat tile resets other filters so the table count matches the tile */
  const showTileFilter = (status: string) => {
    setQuery('')
    setCarrierFilter('')
    setStatusFilter(status)
  }

  const hasFilters = Boolean(query || carrierFilter || statusFilter)

  const selected = selectedId ? shipments.find((s) => s.id === selectedId) ?? null : null

  const columns: Array<Column<Shipment>> = [
    {
      key: 'order',
      header: 'Order',
      sortValue: (s) => s.orderNumber,
      render: (s) => (
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-medium text-ink">{s.orderNumber}</div>
          <div className="truncate text-xs text-ink-3">{s.customerName}</div>
        </div>
      ),
    },
    {
      key: 'carrier',
      header: 'Carrier',
      hideBelow: 'md',
      sortValue: (s) => s.carrier,
      render: (s) => (
        <div>
          <div className="text-sm text-ink">{s.carrier}</div>
          <div className="text-xs text-ink-3">{s.service}</div>
        </div>
      ),
    },
    {
      key: 'tracking',
      header: 'Tracking',
      render: (s) => (
        <div className="flex items-center gap-1">
          <span className="max-w-[160px] truncate font-mono text-xs text-ink-2">{s.trackingNumber || '—'}</span>
          {s.trackingNumber && (
            <IconButton
              label={`Copy tracking number for ${s.orderNumber}`}
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                copyTracking(s.trackingNumber)
              }}
            >
              <Copy />
            </IconButton>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (s) => s.status,
      render: (s) => <ShipmentStatusBadge status={s.status} />,
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      sortValue: (s) => s.cost,
      render: (s) => <span className="tnum">{money(s.cost)}</span>,
    },
    {
      key: 'shipped',
      header: 'Shipped',
      hideBelow: 'lg',
      sortValue: (s) => s.shippedAt,
      render: (s) => <span className="text-ink-2">{fmtDateShort(s.shippedAt)}</span>,
    },
    {
      key: 'eta',
      header: 'ETA',
      hideBelow: 'lg',
      render: (s) =>
        s.deliveredAt ? (
          <span className="text-[#006300] dark:text-good">Delivered {fmtDateShort(s.deliveredAt)}</span>
        ) : s.estimatedDelivery ? (
          <span className="text-ink-2">{fmtDateShort(s.estimatedDelivery)}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipping"
        description="Labels, tracking, and delivery status for every outgoing package."
        actions={
          <Button icon={<Plus />} onClick={() => setCreateOpen(true)}>
            Create label
          </Button>
        }
      />

      {!loaded ? (
        <>
          <SkeletonStats />
          <SkeletonTable />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat
              label="In transit"
              value={num(stats.inTransit)}
              icon={<Truck />}
              clickHint="Filter the table to shipments on the move"
              onClick={() => showTileFilter('__moving')}
            />
            <Stat
              label="Delivered (30d)"
              value={num(stats.delivered30)}
              icon={<PackageCheck />}
              clickHint="Show delivered shipments"
              onClick={() => showTileFilter('Delivered')}
            />
            <Stat
              label="Avg label cost (30d)"
              value={money(stats.avgCost)}
              icon={<Tag />}
              clickHint="View all shipments"
              onClick={() => showTileFilter('')}
            />
            <Stat
              label="Needs attention"
              value={
                <span className={cn(stats.needsAttention > 0 && 'text-critical')}>{num(stats.needsAttention)}</span>
              }
              icon={<AlertTriangle />}
              clickHint="Filter the table to shipments needing attention"
              onClick={() => showTileFilter('Needs attention')}
            />
          </div>

          <div>
            <FilterBar>
              <SearchInput
                aria-label="Search shipments"
                placeholder="Search order, customer, or tracking…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                containerClassName="w-full sm:w-72"
              />
              <Select
                aria-label="Filter by carrier"
                placeholder="All carriers"
                value={carrierFilter}
                onChange={(e) => setCarrierFilter(e.target.value)}
                options={CARRIERS}
                className="w-36"
              />
              <Select
                aria-label="Filter by status"
                placeholder="All statuses"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: '__moving', label: 'In transit (any)' },
                  ...SHIPMENT_STATUSES.map((s) => ({ value: s, label: s })),
                ]}
                className="w-44"
              />
            </FilterBar>

            <DataTable
              columns={columns}
              rows={filtered}
              rowKey={(s) => s.id}
              onRowClick={(s) => setSelectedId(s.id)}
              initialSort={{ key: 'shipped', dir: 'desc' }}
              emptyState={
                <EmptyState
                  icon={<Truck />}
                  title={hasFilters ? 'No shipments match' : 'No shipments yet'}
                  description={
                    hasFilters
                      ? 'Try a different search or clear the carrier and status filters.'
                      : 'Create a shipping label for an open order to start tracking packages here.'
                  }
                  action={
                    hasFilters ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setCarrierFilter('')
                          setStatusFilter('')
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <Button icon={<Plus />} onClick={() => setCreateOpen(true)}>
                        Create label
                      </Button>
                    )
                  }
                />
              }
            />
          </div>
        </>
      )}

      <ShipmentDrawer
        shipment={selected}
        onClose={() => setSelectedId(null)}
        onViewOrder={(orderNumber) => {
          setSelectedId(null)
          navigate(`/admin/orders?q=${encodeURIComponent(orderNumber)}`)
        }}
        onMarkDelivered={(s) => {
          const now = new Date().toISOString()
          updateItem('shipments', s.id, { status: 'Delivered', deliveredAt: now })
          setOrderStatus(s.orderId, 'Delivered')
          toast(`${s.orderNumber} marked delivered`, { tone: 'success' })
        }}
      />

      <CreateLabelModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        orders={orders}
        shipments={shipments}
        weightForOrder={(order) => {
          // Skip items whose product was deleted — prefill with what we can compute
          let total = 0
          for (const item of order.items) {
            const product = products.find((p) => p.id === item.productId)
            if (product) total += product.weightGrams * item.quantity
          }
          return total > 0 ? total : undefined
        }}
        onCreate={({ order, carrier, service, weightGrams, cost }) => {
          const now = new Date().toISOString()
          const trackingNumber = makeTrackingNumber()
          addItem('shipments', {
            id: uid('shp'),
            orderId: order.id,
            orderNumber: order.number,
            customerName: order.customerName,
            carrier,
            service,
            trackingNumber,
            cost,
            status: 'Label created',
            shippedAt: now,
            estimatedDelivery: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            weightGrams,
          })
          setOrderStatus(order.id, 'Shipped')
          updateItem('orders', order.id, { trackingNumber, carrier })
          toast('Label created', { tone: 'success', description: `${order.number} · ${carrier} ${service}` })
        }}
      />
    </div>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────────

const TIMELINE_STEPS: ShipmentStatus[] = ['Label created', 'In transit', 'Out for delivery', 'Delivered']

function ShipmentDrawer({
  shipment,
  onClose,
  onViewOrder,
  onMarkDelivered,
}: {
  shipment: Shipment | null
  onClose: () => void
  onViewOrder: (orderNumber: string) => void
  onMarkDelivered: (s: Shipment) => void
}) {
  const s = shipment
  return (
    <Drawer
      open={Boolean(s)}
      onClose={onClose}
      title={s ? <span className="font-mono">{s.orderNumber}</span> : ''}
      subtitle={s ? `${s.customerName} · shipped ${fmtDateTime(s.shippedAt)}` : undefined}
      footer={
        s ? (
          <>
            <Button
              variant="outline"
              icon={<Download />}
              onClick={() => {
                downloadFile(
                  `label-${s.orderNumber}.txt`,
                  [
                    `SHIPPING LABEL — ${s.orderNumber}`,
                    `Carrier: ${s.carrier} ${s.service}`,
                    `Tracking: ${s.trackingNumber}`,
                    `To: ${s.customerName}`,
                    `Weight: ${grams(s.weightGrams)}`,
                  ].join('\n'),
                )
                toast('Label downloaded', { tone: 'success' })
              }}
            >
              Download label
            </Button>
            {s.status !== 'Delivered' && (
              <Button icon={<Check />} onClick={() => onMarkDelivered(s)}>
                Mark delivered
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {s && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <ShipmentStatusBadge status={s.status} />
            <Button variant="secondary" size="sm" icon={<ExternalLink />} onClick={() => onViewOrder(s.orderNumber)}>
              View order
            </Button>
          </div>

          {s.status === 'Needs attention' ? (
            <div className="flex items-start gap-3 rounded-xl bg-critical-wash p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
              <div>
                <div className="font-semibold text-critical">Needs attention</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
                  The carrier reported a problem with this package. Check {s.carrier} tracking for details or contact
                  the customer.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <DetailLabel>Tracking timeline</DetailLabel>
              <ol className="mt-3">
                {TIMELINE_STEPS.map((step, i) => {
                  const currentIndex = TIMELINE_STEPS.indexOf(s.status)
                  const reached = i <= currentIndex
                  const isLast = i === TIMELINE_STEPS.length - 1
                  return (
                    <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
                      {!isLast && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute left-[5px] top-4 h-full w-0.5 rounded-full',
                            i < currentIndex ? 'bg-accent' : 'bg-hairline',
                          )}
                        />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          'relative mt-1 h-3 w-3 shrink-0 rounded-full border-2',
                          reached ? 'border-accent bg-accent' : 'border-hairline bg-surface',
                        )}
                      />
                      <div className="min-w-0">
                        <div className={cn('text-sm font-medium', reached ? 'text-ink' : 'text-ink-3')}>{step}</div>
                        {step === 'Label created' && (
                          <div className="text-xs text-ink-3">{fmtDateTime(s.shippedAt)}</div>
                        )}
                        {step === 'Delivered' && s.deliveredAt && (
                          <div className="text-xs text-ink-3">{fmtDateTime(s.deliveredAt)}</div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          <div>
            <DetailLabel>Details</DetailLabel>
            <div className="mt-1 divide-y divide-hairline">
              <DetailRow label="Carrier">
                {s.carrier} · {s.service}
              </DetailRow>
              <DetailRow label="Tracking">
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-[13px]">{s.trackingNumber || '—'}</span>
                  {s.trackingNumber && (
                    <IconButton label="Copy tracking number" size="sm" onClick={() => copyTracking(s.trackingNumber)}>
                      <Copy />
                    </IconButton>
                  )}
                </span>
              </DetailRow>
              <DetailRow label="Weight">{grams(s.weightGrams)}</DetailRow>
              <DetailRow label="Label cost">
                <span className="tnum">{money(s.cost)}</span>
              </DetailRow>
              <DetailRow label="Shipped">{fmtDateShort(s.shippedAt)}</DetailRow>
              {s.deliveredAt ? (
                <DetailRow label="Delivered">{fmtDateShort(s.deliveredAt)}</DetailRow>
              ) : (
                <DetailRow label="ETA">{s.estimatedDelivery ? fmtDateShort(s.estimatedDelivery) : '—'}</DetailRow>
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}

// ── Create label modal ────────────────────────────────────────────────────────

function CreateLabelModal({
  open,
  onClose,
  orders,
  shipments,
  weightForOrder,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  orders: Order[]
  shipments: Shipment[]
  weightForOrder: (order: Order) => number | undefined
  onCreate: (v: { order: Order; carrier: Carrier; service: string; weightGrams: number; cost: number }) => void
}) {
  const [orderId, setOrderId] = useState('')
  const [carrier, setCarrier] = useState<Carrier>('USPS')
  const [service, setService] = useState(SERVICES.USPS[0])
  const [weight, setWeight] = useState('')
  const [cost, setCost] = useState('6.50')

  const eligible = useMemo(
    () =>
      orders.filter(
        (o) => OPEN_STATUSES.includes(o.status) && !shipments.some((s) => s.orderId === o.id),
      ),
    [orders, shipments],
  )

  // Reset the form each time the modal opens
  useEffect(() => {
    if (open) {
      setOrderId('')
      setCarrier('USPS')
      setService(SERVICES.USPS[0])
      setWeight('')
      setCost('6.50')
    }
  }, [open])

  const order = eligible.find((o) => o.id === orderId)

  const handleOrderChange = (id: string) => {
    setOrderId(id)
    const o = eligible.find((x) => x.id === id)
    if (o) {
      const w = weightForOrder(o)
      setWeight(w !== undefined ? String(w) : '')
    }
  }

  const weightNum = Number(weight)
  const costNum = Number(cost)
  const valid = Boolean(order) && weight !== '' && weightNum > 0 && cost !== '' && costNum >= 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create shipping label"
      description="Buy a label for an open order and mark it shipped."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              if (!order) return
              onCreate({ order, carrier, service, weightGrams: weightNum, cost: costNum })
              onClose()
            }}
          >
            Create label
          </Button>
        </>
      }
    >
      {eligible.length === 0 ? (
        <EmptyState
          icon={<PackageCheck />}
          title="Nothing to ship"
          description="Every open order already has a label. New orders will show up here when they're ready."
        />
      ) : (
        <div className="space-y-4">
          <Field label="Order" required>
            <Select
              value={orderId}
              onChange={(e) => handleOrderChange(e.target.value)}
              placeholder="Choose an open order…"
              options={eligible.map((o) => ({ value: o.id, label: `${o.number} — ${o.customerName}` }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Carrier" required>
              <Select
                value={carrier}
                onChange={(e) => {
                  const c = e.target.value as Carrier
                  setCarrier(c)
                  setService(SERVICES[c][0])
                }}
                options={CARRIERS}
              />
            </Field>
            <Field label="Service" required>
              <Select value={service} onChange={(e) => setService(e.target.value)} options={SERVICES[carrier]} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Weight (g)" required hint={order ? 'Prefilled from order items' : undefined}>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="250"
              />
            </Field>
            <Field label="Label cost" required>
              <Input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="6.50"
              />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  )
}
