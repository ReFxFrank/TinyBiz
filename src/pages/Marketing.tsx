import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, Copy, Megaphone, MoreHorizontal, Pause, Pencil, Play, Plus, TicketPercent, Trash2 } from 'lucide-react'
import type { Campaign, CampaignChannel, CampaignStatus, PromoCode } from '@/data/types'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import { uid, sum, useLoaded, useDebounced, cn } from '@/lib/utils'
import { fmtDate, fmtDateShort, money, money0, num } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  PageHeader,
  Progress,
  SearchInput,
  Select,
  Skeleton,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Toggle,
} from '@/components/ui'
import type { BadgeTone, Column } from '@/components/ui'

// ── Badge tone maps ──────────────────────────────────────────────────────────

const CHANNEL_TONE: Record<CampaignChannel, BadgeTone> = {
  Email: 'neutral',
  Instagram: 'violet',
  TikTok: 'blue',
  Pinterest: 'red',
  'Etsy Ads': 'orange',
  'Google Ads': 'green',
}

const STATUS_TONE: Record<CampaignStatus, BadgeTone> = {
  Active: 'green',
  Paused: 'yellow',
  Draft: 'neutral',
  Completed: 'blue',
}

const CHANNELS: CampaignChannel[] = ['Email', 'Instagram', 'TikTok', 'Pinterest', 'Etsy Ads', 'Google Ads']
const STATUSES: CampaignStatus[] = ['Draft', 'Active', 'Paused', 'Completed']

// ── Campaign modal ───────────────────────────────────────────────────────────

interface CampaignForm {
  name: string
  channel: string
  status: CampaignStatus
  budget: string
  spent: string
  clicks: string
  conversions: string
  revenue: string
  startDate: string
  endDate: string
}

function emptyCampaignForm(): CampaignForm {
  return {
    name: '',
    channel: '',
    status: 'Draft',
    budget: '',
    spent: '',
    clicks: '',
    conversions: '',
    revenue: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
  }
}

function formFromCampaign(c: Campaign): CampaignForm {
  return {
    name: c.name,
    channel: c.channel,
    status: c.status,
    budget: String(c.budget),
    spent: String(c.spent),
    clicks: String(c.clicks),
    conversions: String(c.conversions),
    revenue: String(c.revenue),
    startDate: c.startDate.slice(0, 10),
    endDate: c.endDate ? c.endDate.slice(0, 10) : '',
  }
}

function CampaignModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Campaign | null }) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const [form, setForm] = useState<CampaignForm>(emptyCampaignForm)

  useEffect(() => {
    if (open) setForm(editing ? formFromCampaign(editing) : emptyCampaignForm())
  }, [open, editing])

  const set = (patch: Partial<CampaignForm>) => setForm((f) => ({ ...f, ...patch }))
  const valid = form.name.trim().length > 0 && form.channel !== '' && form.startDate !== ''

  const submit = () => {
    if (!valid) return
    const payload = {
      name: form.name.trim(),
      channel: form.channel as CampaignChannel,
      status: form.status,
      budget: Math.max(0, Number(form.budget) || 0),
      spent: Math.max(0, Number(form.spent) || 0),
      clicks: Math.max(0, Number(form.clicks) || 0),
      conversions: Math.max(0, Number(form.conversions) || 0),
      revenue: Math.max(0, Number(form.revenue) || 0),
      // Anchor date-only inputs to local noon so they don't shift a day via UTC parsing
      startDate: new Date(`${form.startDate}T12:00:00`).toISOString(),
      endDate: form.endDate ? new Date(`${form.endDate}T12:00:00`).toISOString() : undefined,
    }
    if (editing) {
      updateItem('campaigns', editing.id, payload)
      toast('Campaign updated', { tone: 'success' })
    } else {
      addItem('campaigns', { id: uid('cmp'), ...payload })
      toast('Campaign created', { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit campaign' : 'New campaign'}
      description={editing ? undefined : 'Track spend and attributed results for a promotion.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Create campaign'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Spring dragon drop"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Channel" required>
            <Select
              value={form.channel}
              onChange={(e) => set({ channel: e.target.value })}
              options={CHANNELS}
              placeholder="Pick a channel"
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => set({ status: e.target.value as CampaignStatus })} options={STATUSES} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Budget">
            <Input type="number" min={0} step="1" value={form.budget} onChange={(e) => set({ budget: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Spent">
            <Input type="number" min={0} step="1" value={form.spent} onChange={(e) => set({ spent: e.target.value })} placeholder="0" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Clicks">
            <Input type="number" min={0} step="1" value={form.clicks} onChange={(e) => set({ clicks: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Conversions">
            <Input type="number" min={0} step="1" value={form.conversions} onChange={(e) => set({ conversions: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Revenue">
            <Input type="number" min={0} step="1" value={form.revenue} onChange={(e) => set({ revenue: e.target.value })} placeholder="0" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" required>
            <Input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="End date" hint="Leave empty for ongoing">
            <Input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Promo code modal ─────────────────────────────────────────────────────────

function PromoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addItem = useStore((s) => s.addItem)
  const [code, setCode] = useState('')
  const [discount, setDiscount] = useState('10')
  const [maxUses, setMaxUses] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  useEffect(() => {
    if (open) {
      setCode('')
      setDiscount('10')
      setMaxUses('')
      setExpiresAt('')
    }
  }, [open])

  const discountNum = Number(discount)
  const valid = code.trim().length > 0 && Number.isFinite(discountNum) && discountNum >= 1 && discountNum <= 100

  const submit = () => {
    if (!valid) return
    const promo: PromoCode = {
      id: uid('promo'),
      code: code.trim().toUpperCase(),
      discountPct: Math.round(discountNum),
      uses: 0,
      maxUses: maxUses ? Math.max(1, Number(maxUses) || 1) : undefined,
      active: true,
      // A code that "expires Jul 2" stays valid through the end of Jul 2 locally
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
    }
    addItem('promoCodes', promo)
    toast(`Promo code ${promo.code} created`, { tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New promo code"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Create code
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Code" required>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SPRING15"
            className="font-mono uppercase"
            autoFocus
          />
        </Field>
        <Field label="Discount %" required hint="Between 1 and 100">
          <Input type="number" min={1} max={100} step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max uses" hint="Optional">
            <Input type="number" min={1} step="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" />
          </Field>
          <Field label="Expires" hint="Optional">
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ── Campaign card ────────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  index,
  onEdit,
  onDelete,
}: {
  campaign: Campaign
  index: number
  onEdit: (c: Campaign) => void
  onDelete: (c: Campaign) => void
}) {
  const updateItem = useStore((s) => s.updateItem)
  const c = campaign
  const budgetUsed = c.budget > 0 ? (c.spent / c.budget) * 100 : 0
  const roas = c.spent > 0 ? c.revenue / c.spent : null
  const roasGood = roas !== null && roas >= 2

  const togglePause = () => {
    const next: CampaignStatus = c.status === 'Active' ? 'Paused' : 'Active'
    updateItem('campaigns', c.id, { status: next })
    toast(next === 'Active' ? `${c.name} activated` : `${c.name} paused`, { tone: 'success' })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
    >
      <Card className="flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink">{c.name}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={CHANNEL_TONE[c.channel]}>{c.channel}</Badge>
              <Badge tone={STATUS_TONE[c.status]} dot>
                {c.status}
              </Badge>
            </div>
          </div>
          <Menu
            trigger={
              <IconButton label={`Actions for ${c.name}`} size="sm">
                <MoreHorizontal />
              </IconButton>
            }
          >
            <MenuItem icon={<Pencil />} onSelect={() => onEdit(c)}>
              Edit
            </MenuItem>
            {c.status !== 'Completed' && (
              <MenuItem icon={c.status === 'Active' ? <Pause /> : <Play />} onSelect={togglePause}>
                {c.status === 'Active' ? 'Pause' : 'Activate'}
              </MenuItem>
            )}
            {c.status !== 'Completed' && (
              <MenuItem
                icon={<CheckCircle2 />}
                onSelect={() => {
                  updateItem('campaigns', c.id, { status: 'Completed' })
                  toast(`${c.name} marked completed`, { tone: 'success' })
                }}
              >
                Mark completed
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} danger onSelect={() => onDelete(c)}>
              Delete
            </MenuItem>
          </Menu>
        </div>

        <div>
          <Progress value={budgetUsed} tone={budgetUsed > 85 ? 'warn' : 'accent'} label={`Budget used for ${c.name}`} />
          <p className="mt-1.5 text-xs text-ink-3">
            <span className="tnum font-medium text-ink-2">{money0(c.spent)}</span> of {money0(c.budget)} budget
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 rounded-xl bg-sunken/60 p-3">
          <div>
            <div className="text-[11px] font-medium text-ink-3">Clicks</div>
            <div className="tnum mt-0.5 text-[13px] font-semibold text-ink">{num(c.clicks)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Conv.</div>
            <div className="tnum mt-0.5 text-[13px] font-semibold text-ink">{num(c.conversions)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">Revenue</div>
            <div className="tnum mt-0.5 text-[13px] font-semibold text-ink">{money0(c.revenue)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-ink-3">ROAS</div>
            <div
              className={cn(
                'tnum mt-0.5 text-[13px] font-semibold',
                roasGood ? 'text-[#006300] dark:text-good' : 'text-ink',
              )}
            >
              {roas !== null ? `${roas.toFixed(1)}×` : '—'}
            </div>
          </div>
        </div>

        <p className="mt-auto text-xs text-ink-3">
          {fmtDateShort(c.startDate)} – {c.endDate ? fmtDateShort(c.endDate) : 'ongoing'}
        </p>
      </Card>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Marketing() {
  const loaded = useLoaded()
  const campaigns = useStore((s) => s.campaigns)
  const promoCodes = useStore((s) => s.promoCodes)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)

  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const debouncedQuery = useDebounced(query)

  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null)
  const [promoModalOpen, setPromoModalOpen] = useState(false)
  const [deletingPromo, setDeletingPromo] = useState<PromoCode | null>(null)

  // ?new=1 opens the create modal once, then clears the param
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditingCampaign(null)
      setCampaignModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const stats = useMemo(() => {
    const nonDraft = campaigns.filter((c) => c.status !== 'Draft')
    const spent = sum(nonDraft.map((c) => c.spent))
    const revenue = sum(nonDraft.map((c) => c.revenue))
    return {
      active: campaigns.filter((c) => c.status === 'Active').length,
      spent,
      revenue,
      roas: spent > 0 ? `${(revenue / spent).toFixed(1)}×` : '—',
    }
  }, [campaigns])

  const filteredCampaigns = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (!q) return campaigns
    return campaigns.filter((c) => c.name.toLowerCase().includes(q) || c.channel.toLowerCase().includes(q))
  }, [campaigns, debouncedQuery])

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code)
    toast(`Copied ${code}`, { tone: 'success' })
  }

  const promoColumns: Array<Column<PromoCode>> = [
    {
      key: 'code',
      header: 'Code',
      sortValue: (p) => p.code,
      render: (p) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[13px] font-semibold uppercase text-ink">{p.code}</span>
          <IconButton label={`Copy code ${p.code}`} size="sm" onClick={() => copyCode(p.code)}>
            <Copy />
          </IconButton>
        </span>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      align: 'right',
      sortValue: (p) => p.discountPct,
      render: (p) => <span className="tnum">{p.discountPct}%</span>,
    },
    {
      key: 'usage',
      header: 'Usage',
      sortValue: (p) => p.uses,
      render: (p) =>
        p.maxUses ? (
          <div className="min-w-[120px] max-w-[160px]">
            <div className="tnum text-[13px] text-ink-2">
              {num(p.uses)} / {num(p.maxUses)}
            </div>
            <Progress value={(p.uses / p.maxUses) * 100} className="mt-1 h-1" label={`${p.code} usage`} />
          </div>
        ) : (
          <span className="tnum text-ink-2">{num(p.uses)} uses</span>
        ),
    },
    {
      key: 'expires',
      header: 'Expires',
      hideBelow: 'sm',
      sortValue: (p) => p.expiresAt ?? '',
      render: (p) => {
        if (!p.expiresAt) return <span className="text-ink-3">—</span>
        const expired = new Date(p.expiresAt).getTime() < Date.now()
        return <span className={expired ? 'text-critical' : 'text-ink-2'}>{expired ? 'Expired' : fmtDate(p.expiresAt)}</span>
      },
    },
    {
      key: 'active',
      header: 'Active',
      render: (p) => (
        <label className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
          <span className="sr-only">Toggle {p.code}</span>
          <Toggle
            checked={p.active}
            onChange={(checked) => {
              updateItem('promoCodes', p.id, { active: checked })
              toast(checked ? `${p.code} activated` : `${p.code} deactivated`, { tone: 'success' })
            }}
          />
        </label>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      width: 'w-12',
      render: (p) => (
        <Menu
          trigger={
            <IconButton label={`Actions for ${p.code}`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<Trash2 />} danger onSelect={() => setDeletingPromo(p)}>
            Delete
          </MenuItem>
        </Menu>
      ),
    },
  ]

  if (!loaded) {
    return (
      <div className="space-y-6">
        <PageHeader title="Marketing" description="Campaigns, ad spend and promo codes." />
        <SkeletonStats />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-2.5 h-5 w-40" />
              <Skeleton className="mt-5 h-2 w-full rounded-full" />
              <Skeleton className="mt-4 h-14 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <SkeletonTable rows={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Campaigns, ad spend and promo codes for Nova Prints & Co."
        actions={
          <Button
            icon={<Plus />}
            onClick={() => {
              setEditingCampaign(null)
              setCampaignModalOpen(true)
            }}
          >
            New campaign
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active campaigns" value={num(stats.active)} icon={<Megaphone />} />
        <Stat label="Ad spend" value={money(stats.spent)} />
        <Stat label="Attributed revenue" value={money0(stats.revenue)} />
        <Stat label="Blended ROAS" value={stats.roas} />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Campaigns</h2>
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns…"
            aria-label="Search campaigns"
            containerClassName="w-full sm:w-64"
          />
        </div>

        {filteredCampaigns.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<Megaphone />}
              title={campaigns.length === 0 ? 'No campaigns yet' : 'No campaigns match your search'}
              description={
                campaigns.length === 0
                  ? 'Create your first campaign to start tracking spend and attributed revenue.'
                  : 'Try a different name or channel.'
              }
              action={
                campaigns.length === 0 ? (
                  <Button
                    icon={<Plus />}
                    onClick={() => {
                      setEditingCampaign(null)
                      setCampaignModalOpen(true)
                    }}
                  >
                    New campaign
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCampaigns.map((c, i) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                index={i}
                onEdit={(campaign) => {
                  setEditingCampaign(campaign)
                  setCampaignModalOpen(true)
                }}
                onDelete={setDeletingCampaign}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <Card padding="none" className="overflow-hidden">
          <CardHeader
            title="Promo codes"
            subtitle="Discount codes customers can redeem at checkout"
            className="mb-0 px-5 pt-5 pb-4"
            actions={
              <Button variant="outline" size="sm" icon={<Plus />} onClick={() => setPromoModalOpen(true)}>
                New code
              </Button>
            }
          />
          <DataTable
            columns={promoColumns}
            rows={promoCodes}
            rowKey={(p) => p.id}
            className="rounded-none border-0 shadow-none"
            emptyState={
              <EmptyState
                icon={<TicketPercent />}
                title="No promo codes"
                description="Create a discount code to reward loyal customers or boost a launch."
                action={
                  <Button variant="outline" icon={<Plus />} onClick={() => setPromoModalOpen(true)}>
                    New code
                  </Button>
                }
              />
            }
          />
        </Card>
      </section>

      <CampaignModal
        open={campaignModalOpen}
        onClose={() => {
          setCampaignModalOpen(false)
          setEditingCampaign(null)
        }}
        editing={editingCampaign}
      />
      <PromoModal open={promoModalOpen} onClose={() => setPromoModalOpen(false)} />

      <ConfirmDialog
        open={deletingCampaign !== null}
        onClose={() => setDeletingCampaign(null)}
        onConfirm={() => {
          if (deletingCampaign) {
            removeItem('campaigns', deletingCampaign.id)
            toast('Campaign deleted', { tone: 'success' })
          }
        }}
        title="Delete campaign?"
        description={
          deletingCampaign
            ? `"${deletingCampaign.name}" and its tracked results will be removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
      />
      <ConfirmDialog
        open={deletingPromo !== null}
        onClose={() => setDeletingPromo(null)}
        onConfirm={() => {
          if (deletingPromo) {
            removeItem('promoCodes', deletingPromo.id)
            toast(`Promo code ${deletingPromo.code} deleted`, { tone: 'success' })
          }
        }}
        title="Delete promo code?"
        description={
          deletingPromo
            ? `Customers will no longer be able to redeem ${deletingPromo.code}. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
