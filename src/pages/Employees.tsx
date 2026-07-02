import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, Mail, MoreHorizontal, Pencil, Phone, Plus, Trash2, UserCheck, UserX, Users } from 'lucide-react'
import type { Employee } from '@/data/types'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  SkeletonStats,
  Stat,
} from '@/components/ui'
import { fmtDate, money } from '@/lib/format'
import { uid, useLoaded } from '@/lib/utils'

// ── helpers ──────────────────────────────────────────────────────────────────

function monthlyPay(e: Employee): number {
  if (!e.payRate) return 0
  return e.payType === 'hourly' ? e.payRate * 160 : e.payRate / 12
}

function tenureMonths(startDate: string): number {
  const start = new Date(startDate).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24 * 30.44)))
}

function tenureLabel(startDate: string): string {
  const m = tenureMonths(startDate)
  if (m < 1) return 'new'
  if (m < 12) return `${m} mo`
  const y = Math.floor(m / 12)
  const rem = m % 12
  return rem ? `${y} yr ${rem} mo` : `${y} yr`
}

function payLabel(e: Employee): string {
  if (!e.payRate) return '—'
  return e.payType === 'hourly'
    ? `${money(e.payRate)}/hr`
    : `${money(e.payRate / 1000).replace(/\.\d+/, '')}k/yr`
}

// ── form modal ───────────────────────────────────────────────────────────────

interface FormState {
  name: string
  role: string
  email: string
  phone: string
  payType: 'hourly' | 'salary'
  payRate: string
  startDate: string
  avatarHue: number
}

const emptyForm: FormState = {
  name: '',
  role: '',
  email: '',
  phone: '',
  payType: 'hourly',
  payRate: '',
  startDate: new Date().toISOString().slice(0, 10),
  avatarHue: 200,
}

function EmployeeModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Employee | null
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (!open) return
    setForm(
      editing
        ? {
            name: editing.name,
            role: editing.role,
            email: editing.email,
            phone: editing.phone ?? '',
            payType: editing.payType,
            payRate: editing.payRate ? String(editing.payRate) : '',
            startDate: editing.startDate.slice(0, 10),
            avatarHue: editing.avatarHue,
          }
        : { ...emptyForm, avatarHue: Math.floor(Math.random() * 360) },
    )
  }, [open, editing])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const valid = form.name.trim() !== '' && form.role.trim() !== '' && form.email.trim() !== ''

  const submit = () => {
    if (!valid) return
    const payload = {
      name: form.name.trim(),
      role: form.role.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      payType: form.payType,
      payRate: Math.max(0, Number(form.payRate) || 0),
      startDate: form.startDate || new Date().toISOString().slice(0, 10),
      avatarHue: form.avatarHue,
    }
    if (editing) {
      updateItem('employees', editing.id, payload)
      toast(`${payload.name} updated`, { tone: 'success' })
    } else {
      addItem('employees', { id: uid('emp'), status: 'Active', ...payload })
      toast(`${payload.name} added to the team`, { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit teammate' : 'Add teammate'}
      description={editing ? undefined : 'Bring a new person into Nova Prints & Co.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Add teammate'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Jordan Reyes" />
          </Field>
          <Field label="Role" required>
            <Input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Print technician" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="name@novaprints.co"
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="(555) 010-2233"
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Pay type">
            <Select
              value={form.payType}
              onChange={(e) => set('payType', e.target.value as 'hourly' | 'salary')}
              options={[
                { value: 'hourly', label: 'Hourly' },
                { value: 'salary', label: 'Salary' },
              ]}
            />
          </Field>
          <Field label={form.payType === 'hourly' ? 'Rate / hour' : 'Salary / year'}>
            <Input
              type="number"
              min={0}
              step={form.payType === 'hourly' ? 0.5 : 500}
              value={form.payRate}
              onChange={(e) => set('payRate', e.target.value)}
              placeholder={form.payType === 'hourly' ? '17.50' : '52000'}
            />
          </Field>
          <Field label="Start date">
            <Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Avatar color" hint="Slide to pick a hue for the initials tile">
          <div className="flex items-center gap-4">
            <Avatar name={form.name || 'New Teammate'} hue={form.avatarHue} size="lg" />
            <input
              type="range"
              min={0}
              max={360}
              value={form.avatarHue}
              onChange={(e) => set('avatarHue', Number(e.target.value))}
              className="w-full accent-accent"
              aria-label="Avatar hue"
            />
          </div>
        </Field>
      </div>
    </Modal>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function Employees() {
  const loaded = useLoaded()
  const employees = useStore((s) => s.employees)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const [searchParams, setSearchParams] = useSearchParams()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [removing, setRemoving] = useState<Employee | null>(null)

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(null)
      setModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const active = useMemo(() => employees.filter((e) => e.status === 'Active'), [employees])
  const inactiveCount = employees.length - active.length
  const payroll = useMemo(() => active.reduce((acc, e) => acc + monthlyPay(e), 0), [active])
  const avgTenure = useMemo(
    () => (active.length ? Math.round(active.reduce((acc, e) => acc + tenureMonths(e.startDate), 0) / active.length) : 0),
    [active],
  )

  const sorted = useMemo(
    () =>
      [...employees].sort((a, b) =>
        a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'Active' ? -1 : 1,
      ),
    [employees],
  )

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="The people who keep the printers humming."
        actions={
          <Button icon={<Plus />} onClick={openCreate}>
            Add teammate
          </Button>
        }
      />

      {!loaded ? (
        <>
          <SkeletonStats />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Active teammates" value={String(active.length)} icon={<Users />} />
            <Stat label="Monthly payroll (est.)" value={money(payroll)} />
            <Stat label="Avg tenure" value={`${avgTenure} mo`} />
            <Stat label="Inactive" value={String(inactiveCount)} />
          </div>

          {sorted.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users />}
                title="No teammates yet"
                description="Add your first teammate to start tracking roles, pay and tenure."
                action={
                  <Button icon={<Plus />} onClick={openCreate}>
                    Add teammate
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sorted.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.25) }}
                >
                  <Card className={e.status === 'Inactive' ? 'opacity-70' : undefined}>
                    <div className="flex items-start gap-3">
                      <Avatar name={e.name} hue={e.avatarHue} size="lg" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-ink">{e.name}</div>
                        <div className="truncate text-[13px] text-ink-3">{e.role}</div>
                        <div className="mt-1.5">
                          <Badge tone={e.status === 'Active' ? 'green' : 'neutral'} dot>
                            {e.status}
                          </Badge>
                        </div>
                      </div>
                      <Menu
                        trigger={
                          <IconButton label={`Actions for ${e.name}`} size="sm">
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
                        <MenuItem
                          icon={e.status === 'Active' ? <UserX /> : <UserCheck />}
                          onSelect={() => {
                            const next = e.status === 'Active' ? 'Inactive' : 'Active'
                            updateItem('employees', e.id, { status: next })
                            toast(`${e.name} marked ${next.toLowerCase()}`, { tone: 'success' })
                          }}
                        >
                          {e.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<Trash2 />} danger onSelect={() => setRemoving(e)}>
                          Remove
                        </MenuItem>
                      </Menu>
                    </div>

                    <div className="mt-4 space-y-2 border-t border-hairline pt-3 text-[13px]">
                      <div className="flex items-center gap-2 text-ink-2">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                        <span className="truncate">{e.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-ink-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                        <span>{e.phone || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-ink-2">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                          {fmtDate(e.startDate)}
                          <span className="text-ink-3">· {tenureLabel(e.startDate)}</span>
                        </span>
                        <span className="tnum font-medium text-ink">{payLabel(e)}</span>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      <EmployeeModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        danger
        title="Remove teammate"
        description={removing ? `Remove ${removing.name} from the team? This cannot be undone.` : undefined}
        confirmLabel="Remove"
        onConfirm={() => {
          if (!removing) return
          removeItem('employees', removing.id)
          toast(`${removing.name} removed`, { tone: 'success' })
        }}
      />
    </div>
  )
}
