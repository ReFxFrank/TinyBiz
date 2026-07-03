import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, Palmtree, Pencil, Plus, Sun, Trash2, X } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  type BadgeTone,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import { OPEN_STATUSES, type CalendarEvent, type EventType, type TimeOff, type TimeOffKind } from '@/data/types'
import { addDays, dayKey, isToday, monthGrid, WEEKDAYS } from '@/lib/dates'
import { fmtDate, fmtDateShort } from '@/lib/format'
import { cn, uid, useLoaded } from '@/lib/utils'

// ── Event model ───────────────────────────────────────────────────────────────

type EventSource = 'event' | 'order' | 'task' | 'batch'

interface MergedEvent {
  id: string
  title: string
  /** ISO date */
  date: string
  type: EventType
  notes?: string
  /** Only 'event' rows are editable/deletable */
  source: EventSource
}

const EVENT_TYPES: EventType[] = ['deadline', 'ship-by', 'purchase', 'delivery', 'production', 'market', 'other']

const TYPE_META: Record<EventType, { label: string; dot: string; tone: BadgeTone }> = {
  deadline: { label: 'Deadline', dot: 'bg-critical', tone: 'red' },
  'ship-by': { label: 'Ship by', dot: 'bg-accent', tone: 'blue' },
  purchase: { label: 'Purchase', dot: 'bg-warn', tone: 'yellow' },
  delivery: { label: 'Delivery', dot: 'bg-good', tone: 'green' },
  production: { label: 'Production', dot: 'bg-pop', tone: 'violet' },
  market: { label: 'Market', dot: 'bg-serious', tone: 'orange' },
  other: { label: 'Other', dot: 'bg-ink-3', tone: 'neutral' },
}

/** Cell tint + chip look for a marked day off (distinct from event tones) */
const TIME_OFF_STYLE: Record<TimeOffKind, { cell: string; chip: string; label: string }> = {
  'Day off': { cell: 'bg-warn-wash/60', chip: 'bg-warn-wash text-[#8a6100] dark:text-warn', label: 'Off' },
  Vacation: { cell: 'bg-pop-soft/70', chip: 'bg-pop-soft text-pop', label: 'Vacation' },
}

const SOURCE_LABEL: Record<EventSource, string> = {
  event: 'Calendar',
  order: 'From orders',
  task: 'From tasks',
  batch: 'From production',
}

function TypeDot({ type, className }: { type: EventType; className?: string }) {
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TYPE_META[type].dot, className)} aria-hidden />
}

/** Parse a YYYY-MM-DD input value into a local-noon ISO string (day-precision safe) */
function dateInputToIso(value: string): string {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d, 12).toISOString()
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const loaded = useLoaded()
  const events = useStore((s) => s.events)
  const orders = useStore((s) => s.orders)
  const tasks = useStore((s) => s.tasks)
  const batches = useStore((s) => s.batches)
  const daysOff = useStore((s) => s.daysOff)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const [searchParams, setSearchParams] = useSearchParams()

  const now = new Date()
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [prefillDate, setPrefillDate] = useState<string | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<MergedEvent | null>(null)
  const [timeOffOpen, setTimeOffOpen] = useState(false)

  // ?new=1 auto-opens the create modal
  useEffect(() => {
    if (searchParams.get('new')) {
      setEditing(null)
      setPrefillDate(undefined)
      setModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Merge real calendar events with read-only derived ones
  const merged = useMemo<MergedEvent[]>(() => {
    const out: MergedEvent[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      type: e.type,
      notes: e.notes,
      source: 'event',
    }))
    for (const o of orders) {
      if (o.shipBy && OPEN_STATUSES.includes(o.status)) {
        out.push({
          id: `ord-${o.id}`,
          title: `Ship ${o.number}`,
          date: o.shipBy,
          type: 'ship-by',
          notes: `${o.customerName} · ${o.channel}`,
          source: 'order',
        })
      }
    }
    for (const t of tasks) {
      if (t.dueDate && t.status !== 'done') {
        out.push({ id: `tsk-${t.id}`, title: t.title, date: t.dueDate, type: 'deadline', notes: t.description, source: 'task' })
      }
    }
    for (const b of batches) {
      if (b.status === 'Queued' || b.status === 'In Progress') {
        out.push({
          id: `bat-${b.id}`,
          title: `Batch: ${b.productName}`,
          date: b.startedAt,
          type: 'production',
          notes: `${b.quantity} planned on ${b.machineName}`,
          source: 'batch',
        })
      }
    }
    return out
  }, [events, orders, tasks, batches])

  // O(1) per-cell lookup, each day's list pre-sorted
  const byDay = useMemo(() => {
    const map = new Map<string, MergedEvent[]>()
    for (const e of merged) {
      const key = dayKey(e.date)
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    for (const list of map.values()) {
      list.sort((a, b) => EVENT_TYPES.indexOf(a.type) - EVENT_TYPES.indexOf(b.type) || a.title.localeCompare(b.title))
    }
    return map
  }, [merged])

  // Day-off lookup by YYYY-MM-DD key for O(1) cell tinting
  const daysOffByKey = useMemo(() => new Map(daysOff.map((d) => [d.date, d])), [daysOff])

  const markDayOff = (dateKey: string, kind: TimeOffKind) => {
    const existing = daysOffByKey.get(dateKey)
    if (existing) updateItem('daysOff', existing.id, { kind })
    else addItem('daysOff', { id: uid('off'), date: dateKey, kind })
    toast(`${fmtDateShort(dateInputToIso(dateKey))} marked as ${kind.toLowerCase()}`, { tone: 'success' })
  }

  const clearDayOff = (dateKey: string) => {
    const existing = daysOffByKey.get(dateKey)
    if (existing) {
      removeItem('daysOff', existing.id)
      toast('Day off cleared', { tone: 'success' })
    }
  }

  // Next 14 days for the side panel
  const upNext = useMemo(() => {
    const today = new Date()
    const groups: Array<{ key: string; date: Date; events: MergedEvent[] }> = []
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i)
      const list = byDay.get(dayKey(d))
      if (list && list.length > 0) groups.push({ key: dayKey(d), date: d, events: list })
    }
    return groups
  }, [byDay])

  const cells = useMemo(() => monthGrid(month.y, month.m), [month])
  const monthTitle = new Date(month.y, month.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const goMonth = (delta: number) => {
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const openCreate = (date?: string) => {
    if (date && daysOffByKey.has(date)) {
      toast('That day is marked off', { description: 'Clear the time off first to schedule something.', tone: 'error' })
      return
    }
    setEditing(null)
    setPrefillDate(date)
    setSelectedDay(null)
    setModalOpen(true)
  }

  const openEdit = (id: string) => {
    const event = events.find((e) => e.id === id)
    if (!event) return
    setEditing(event)
    setPrefillDate(undefined)
    setSelectedDay(null)
    setModalOpen(true)
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    removeItem('events', pendingDelete.id)
    toast('Event deleted', { tone: 'success' })
  }

  const selectedDayEvents = selectedDay ? (byDay.get(selectedDay) ?? []) : []
  const selectedDayOff = selectedDay ? daysOffByKey.get(selectedDay) : undefined

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Ship-by dates, deadlines, deliveries and market days — all in one view."
        actions={
          <>
            <Button variant="outline" icon={<Palmtree />} onClick={() => setTimeOffOpen(true)}>
              Time off
            </Button>
            <Button icon={<Plus />} onClick={() => openCreate()}>
              New event
            </Button>
          </>
        }
      />

      {!loaded ? (
        <div className="space-y-6">
          <div className="card flex items-center justify-between gap-4 p-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="hidden h-4 w-72 sm:block" />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="card p-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-4 h-[480px] w-full rounded-xl" />
            </div>
            <div className="card p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-1.5 h-3 w-32" />
              <Skeleton className="mt-5 h-[340px] w-full rounded-xl" />
            </div>
          </div>
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {/* Toolbar */}
          <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3 px-4">
            <div className="flex items-center gap-2">
              <h2 className="min-w-[140px] text-[15px] font-semibold text-ink">{monthTitle}</h2>
              <IconButton label="Previous month" size="sm" onClick={() => goMonth(-1)}>
                <ChevronLeft />
              </IconButton>
              <IconButton label="Next month" size="sm" onClick={() => goMonth(1)}>
                <ChevronRight />
              </IconButton>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMonth({ y: new Date().getFullYear(), m: new Date().getMonth() })}
              >
                Today
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5" aria-label="Event type legend">
              {EVENT_TYPES.map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-xs text-ink-3">
                  <TypeDot type={t} />
                  {TYPE_META[t].label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-ink-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-pop-soft" aria-hidden />
                Time off
              </span>
            </div>
          </Card>

          <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
            {/* Month grid */}
            <Card padding="none" className="overflow-hidden">
              <div className="grid grid-cols-7 border-b border-edge bg-sunken/50">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="px-2 py-2 text-center text-xs font-semibold text-ink-3">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                  const key = dayKey(d)
                  const dayEvents = byDay.get(key) ?? []
                  const off = daysOffByKey.get(key)
                  const inMonth = d.getMonth() === month.m
                  const today = isToday(d)
                  const shown = dayEvents.slice(0, off ? 2 : 3)
                  const overflow = dayEvents.length - shown.length
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDay(key)}
                      aria-label={`${fmtDate(d.toISOString())}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}${off ? `, ${off.kind}` : ''}`}
                      className={cn(
                        'group relative flex min-h-[64px] flex-col items-stretch gap-1 border-b border-r border-hairline p-1.5 text-left transition-colors sm:min-h-[96px] sm:p-2',
                        'hover:bg-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60',
                        i % 7 === 6 && 'border-r-0',
                        i >= 35 && 'border-b-0',
                        // Off days: gray the whole box; a faint corner ribbon marks the kind
                        off && 'bg-sunken',
                        !inMonth && 'opacity-50',
                      )}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                            today ? 'bg-accent font-semibold text-white' : off ? 'text-ink-3 line-through' : 'text-ink-2',
                          )}
                        >
                          {d.getDate()}
                        </span>
                        {off && (
                          <span
                            className={cn(
                              'hidden items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:inline-flex',
                              TIME_OFF_STYLE[off.kind].chip,
                            )}
                          >
                            {off.kind === 'Vacation' ? '🌴' : '☕'} {TIME_OFF_STYLE[off.kind].label}
                          </span>
                        )}
                      </span>
                      {off ? (
                        // Marked off — content is muted; nothing can be scheduled here
                        <span className="hidden min-w-0 flex-1 flex-col justify-end gap-1 sm:flex">
                          {dayEvents.length > 0 && (
                            <span className="text-[11px] text-ink-3 line-through">
                              {dayEvents.length} item{dayEvents.length === 1 ? '' : 's'}
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-ink-3">No work scheduled</span>
                        </span>
                      ) : (
                        <span className="hidden min-w-0 flex-col gap-1 sm:flex">
                          {shown.map((e) => (
                            <span key={e.id} className="flex min-w-0 items-center gap-1.5">
                              <TypeDot type={e.type} />
                              <span className="truncate text-xs text-ink-2">{e.title}</span>
                            </span>
                          ))}
                          {overflow > 0 && <span className="text-[11px] font-medium text-ink-3">+{overflow} more</span>}
                        </span>
                      )}
                      {/* Mobile: dots only (off days show a muted dot) */}
                      {dayEvents.length > 0 && (
                        <span className="flex flex-wrap items-center gap-1 sm:hidden">
                          {off ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-ink-3 opacity-50" aria-hidden />
                          ) : (
                            <>
                              {dayEvents.slice(0, 4).map((e) => (
                                <TypeDot key={e.id} type={e.type} />
                              ))}
                              {dayEvents.length > 4 && (
                                <span className="text-[10px] text-ink-3">+{dayEvents.length - 4}</span>
                              )}
                            </>
                          )}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* Up next */}
            <Card padding="none" className="lg:sticky lg:top-4">
              <div className="border-b border-edge px-5 py-4">
                <h3 className="text-[15px] font-semibold leading-tight text-ink">Up next</h3>
                <p className="mt-0.5 text-[13px] text-ink-3">The next 14 days at a glance</p>
              </div>
              {upNext.length === 0 ? (
                <EmptyState
                  icon={<CalendarDays />}
                  title="Nothing scheduled"
                  description="No events, ship-by dates or deadlines in the next two weeks."
                  action={
                    <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => openCreate()}>
                      Add an event
                    </Button>
                  }
                />
              ) : (
                <div className="max-h-[560px] overflow-y-auto pb-2">
                  {upNext.map((g) => (
                    <div key={g.key}>
                      <div className="sticky top-0 z-10 border-b border-hairline bg-surface/95 px-5 py-1.5 backdrop-blur">
                        <span className="text-xs font-semibold text-ink-2">{fmtDateShort(g.date.toISOString())}</span>
                        <span className="ml-1.5 text-xs text-ink-3">
                          {isToday(g.date) ? 'Today' : g.date.toLocaleDateString('en-US', { weekday: 'long' })}
                        </span>
                      </div>
                      <ul>
                        {g.events.map((e) => (
                          <li key={e.id} className="flex items-center gap-2.5 px-5 py-2">
                            <TypeDot type={e.type} className="h-2 w-2" />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={e.title}>
                              {e.title}
                            </span>
                            <span className="shrink-0 text-xs text-ink-3">{TYPE_META[e.type].label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </motion.div>
      )}

      {/* Day drawer */}
      <Drawer
        open={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? fmtDate(dateInputToIso(selectedDay)) : ''}
        subtitle={
          selectedDay
            ? selectedDayOff
              ? `Marked as ${selectedDayOff.kind.toLowerCase()} — no work scheduled`
              : `${selectedDayEvents.length} event${selectedDayEvents.length === 1 ? '' : 's'} scheduled`
            : undefined
        }
        footer={
          selectedDay && !selectedDayOff ? (
            <Button
              icon={<Plus />}
              onClick={() => {
                openCreate(selectedDay)
              }}
            >
              Add event on {fmtDateShort(dateInputToIso(selectedDay))}
            </Button>
          ) : undefined
        }
      >
        {/* Time off controls */}
        {selectedDay &&
          (() => {
            const off = daysOffByKey.get(selectedDay)
            if (off) {
              return (
                <div
                  className={cn(
                    'mb-4 flex items-center justify-between gap-3 rounded-xl p-3.5',
                    TIME_OFF_STYLE[off.kind].cell,
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {off.kind === 'Vacation' ? (
                      <Palmtree className="h-4 w-4 text-pop" />
                    ) : (
                      <Sun className="h-4 w-4 text-[#8a6100] dark:text-warn" />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-ink">Marked as {off.kind.toLowerCase()}</div>
                      {off.note && <div className="text-xs text-ink-2">{off.note}</div>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" icon={<X />} onClick={() => clearDayOff(selectedDay)}>
                    Clear
                  </Button>
                </div>
              )
            }
            return (
              <div className="mb-4 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Sun />}
                  className="flex-1"
                  onClick={() => markDayOff(selectedDay, 'Day off')}
                >
                  Mark day off
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Palmtree />}
                  className="flex-1"
                  onClick={() => markDayOff(selectedDay, 'Vacation')}
                >
                  Mark vacation
                </Button>
              </div>
            )
          })()}

        {selectedDayEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title="Nothing on this day"
            description="Add an event to keep track of markets, deliveries and deadlines."
          />
        ) : (
          <div className="space-y-3">
            {selectedDayEvents.map((e) => (
              <div key={e.id} className="rounded-xl border border-edge bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <TypeDot type={e.type} className="h-2 w-2" />
                      <span className="truncate text-sm font-medium text-ink">{e.title}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={TYPE_META[e.type].tone}>{TYPE_META[e.type].label}</Badge>
                      <span className="text-xs text-ink-3">{SOURCE_LABEL[e.source]}</span>
                    </div>
                    {e.notes && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{e.notes}</p>}
                  </div>
                  {e.source === 'event' && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <IconButton label={`Edit ${e.title}`} size="sm" onClick={() => openEdit(e.id)}>
                        <Pencil />
                      </IconButton>
                      <IconButton
                        label={`Delete ${e.title}`}
                        size="sm"
                        className="hover:bg-critical-wash hover:text-critical"
                        onClick={() => setPendingDelete(e)}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <EventModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        defaultDate={prefillDate}
        isDayOff={(key) => daysOffByKey.has(key)}
      />

      <TimeOffModal open={timeOffOpen} onClose={() => setTimeOffOpen(false)} existing={daysOffByKey} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete event?"
        description={pendingDelete ? `“${pendingDelete.title}” will be removed from your calendar.` : undefined}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

// ── New / edit event modal ────────────────────────────────────────────────────

function EventModal({
  open,
  onClose,
  editing,
  defaultDate,
  isDayOff,
}: {
  open: boolean
  onClose: () => void
  /** When set, the modal edits this real calendar event */
  editing: CalendarEvent | null
  /** YYYY-MM-DD pre-fill for the date input */
  defaultDate?: string
  /** True when a given YYYY-MM-DD is marked off — events can't be scheduled there */
  isDayOff: (key: string) => boolean
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [type, setType] = useState<EventType>('other')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '')
      setDate(editing ? dayKey(editing.date) : (defaultDate ?? dayKey(new Date())))
      setType(editing?.type ?? 'other')
      setNotes(editing?.notes ?? '')
    }
  }, [open, editing, defaultDate])

  const dayBlocked = date.length > 0 && isDayOff(date)
  const valid = title.trim().length > 0 && date.length > 0 && !dayBlocked

  const submit = () => {
    if (!valid) return
    const payload = {
      title: title.trim(),
      date: dateInputToIso(date),
      type,
      notes: notes.trim() || undefined,
    }
    if (editing) {
      updateItem('events', editing.id, payload)
      toast('Event updated', { tone: 'success' })
    } else {
      addItem('events', { id: uid('evt'), ...payload })
      toast('Event added', { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit event' : 'New event'}
      description={editing ? undefined : 'Markets, deliveries, deadlines — anything with a date.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Add event'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Riverfront Makers Market"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required error={dayBlocked ? 'This day is marked off' : undefined}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Type">
            <Select
              options={EVENT_TYPES.map((t) => ({ value: t, label: TYPE_META[t].label }))}
              value={type}
              onChange={(e) => setType(e.target.value as EventType)}
            />
          </Field>
        </div>
        <Field label="Notes" hint="Optional — booth number, supplier, reminders…">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember?" />
        </Field>
      </form>
    </Modal>
  )
}

// ── Time off modal (marks a date range as non-working) ──────────────────────────

function TimeOffModal({
  open,
  onClose,
  existing,
}: {
  open: boolean
  onClose: () => void
  /** Current days off keyed by YYYY-MM-DD, so we don't double-mark a day */
  existing: Map<string, TimeOff>
}) {
  const addItem = useStore((s) => s.addItem)

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [kind, setKind] = useState<TimeOffKind>('Vacation')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      const today = dayKey(new Date())
      setStart(today)
      setEnd(today)
      setKind('Vacation')
      setNote('')
    }
  }, [open])

  // Keep end on/after start
  const endValid = end >= start
  const valid = start.length > 0 && end.length > 0 && endValid

  const dayCount = useMemo(() => {
    if (!valid) return 0
    const s = new Date(dateInputToIso(start))
    const e = new Date(dateInputToIso(end))
    return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
  }, [start, end, valid])

  const submit = () => {
    if (!valid) return
    let created = 0
    let cursor = new Date(dateInputToIso(start))
    const last = dateInputToIso(end)
    while (cursor.toISOString() <= last) {
      const key = dayKey(cursor)
      if (!existing.has(key)) {
        addItem('daysOff', { id: uid('off'), date: key, kind, note: note.trim() || undefined })
        created++
      }
      cursor = addDays(cursor, 1)
    }
    toast(
      created > 0 ? `Marked ${created} day${created === 1 ? '' : 's'} as ${kind.toLowerCase()}` : 'Those days were already marked',
      { tone: created > 0 ? 'success' : 'default' },
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add time off"
      description="Mark a day or range when the shop is closed — it won't count as a working day."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {dayCount > 1 ? `Mark ${dayCount} days off` : 'Mark day off'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Type">
          <Select
            options={[
              { value: 'Vacation', label: 'Vacation' },
              { value: 'Day off', label: 'Day off' },
            ]}
            value={kind}
            onChange={(e) => setKind(e.target.value as TimeOffKind)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" required>
            <Input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value)
                if (end < e.target.value) setEnd(e.target.value)
              }}
            />
          </Field>
          <Field label="To" required error={endValid ? undefined : 'End must be on or after start'}>
            <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Note" hint="Optional — reason or reminder.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Family trip" />
        </Field>
      </div>
    </Modal>
  )
}
