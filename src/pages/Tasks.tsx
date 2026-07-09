import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  FilterBar,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  Modal,
  PageHeader,
  PriorityBadge,
  SearchInput,
  Select,
  Skeleton,
  SkeletonStats,
  Stat,
  Textarea,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { TaskItem, TaskPriority, TaskStatus } from '@/data/types'
import { dueIn, fmtDateShort, num } from '@/lib/format'
import { cn, uid, useDebounced, useLoaded } from '@/lib/utils'

// ── Board configuration ──────────────────────────────────────────────────────

const COLUMNS: Array<{ status: TaskStatus; label: string; dot: string }> = [
  { status: 'todo', label: 'To Do', dot: 'bg-accent' },
  { status: 'in-progress', label: 'In Progress', dot: 'bg-pop' },
  { status: 'waiting', label: 'Waiting', dot: 'bg-warn' },
  { status: 'done', label: 'Done', dot: 'bg-good' },
]

const STATUS_OPTIONS = COLUMNS.map((c) => ({ value: c.status, label: c.label }))
const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/** Big index passed to moveTask so the task lands at the end of the column */
const APPEND_AT_END = 999

function columnLabel(status: TaskStatus): string {
  return COLUMNS.find((c) => c.status === status)?.label ?? status
}

// ── Task form modal ──────────────────────────────────────────────────────────

interface TaskFormState {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
  tags: string
}

function formFromTask(task?: TaskItem, presetStatus?: TaskStatus): TaskFormState {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? presetStatus ?? 'todo',
    priority: task?.priority ?? 'medium',
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
    tags: task?.tags.join(', ') ?? '',
  }
}

function TaskModal({
  open,
  task,
  presetStatus,
  onClose,
}: {
  open: boolean
  /** When set, edit mode; otherwise create */
  task?: TaskItem
  presetStatus?: TaskStatus
  onClose: () => void
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)
  const [form, setForm] = useState<TaskFormState>(() => formFromTask(task, presetStatus))
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Re-seed the form each time the modal opens for a (possibly different) task
  useEffect(() => {
    if (open) {
      setForm(formFromTask(task, presetStatus))
      setConfirmDelete(false)
    }
  }, [open, task, presetStatus])

  const valid = form.title.trim().length > 0
  const patch = (p: Partial<TaskFormState>) => setForm((f) => ({ ...f, ...p }))

  function submit() {
    if (!valid) return
    const shared = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`).toISOString() : undefined,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }
    if (task) {
      updateItem('tasks', task.id, shared)
      toast('Task updated', { tone: 'success' })
    } else {
      addItem('tasks', {
        id: uid('tsk'),
        ...shared,
        createdAt: new Date().toISOString(),
        order: APPEND_AT_END,
      })
      toast('Task created', { description: shared.title, tone: 'success' })
    }
    onClose()
  }

  function destroy() {
    if (!task) return
    removeItem('tasks', task.id)
    toast('Task deleted', { tone: 'success' })
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={task ? 'Edit task' : 'New task'}
        description={task ? undefined : 'Add something to the board.'}
        footer={
          <>
            {task && (
              <Button
                variant="ghost"
                icon={<Trash2 />}
                className="mr-auto text-critical hover:bg-critical-wash hover:text-critical"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!valid}>
              {task ? 'Save changes' : 'Create task'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" required>
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="e.g. Restock Matte Black PLA"
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Optional details…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Select
                options={STATUS_OPTIONS}
                value={form.status}
                onChange={(e) => patch({ status: e.target.value as TaskStatus })}
              />
            </Field>
            <Field label="Priority">
              <Select
                options={PRIORITY_OPTIONS}
                value={form.priority}
                onChange={(e) => patch({ priority: e.target.value as TaskPriority })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Due date" hint="Optional">
              <Input type="date" value={form.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} />
            </Field>
            <Field label="Tags" hint="Comma separated">
              <Input
                value={form.tags}
                onChange={(e) => patch({ tags: e.target.value })}
                placeholder="inventory, sales"
              />
            </Field>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={destroy}
        danger
        title="Delete task?"
        description={task ? `“${task.title}” will be removed from the board. This cannot be undone.` : undefined}
        confirmLabel="Delete"
      />
    </>
  )
}

// ── Kanban card ──────────────────────────────────────────────────────────────

function TaskCard({
  task,
  dragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onMove,
  onDelete,
}: {
  task: TaskItem
  dragging: boolean
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onEdit: () => void
  onMove: (status: TaskStatus) => void
  onDelete: () => void
}) {
  const done = task.status === 'done'
  const due = task.dueDate && !done ? dueIn(task.dueDate) : null
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-label={`Edit task: ${task.title}`}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          onEdit()
        }
      }}
      className={cn('cursor-grab active:cursor-grabbing transition-opacity duration-150', dragging && 'opacity-50')}
    >
      <Card padding="sm" className="space-y-1.5 transition-shadow duration-200 hover:shadow-lifted">
        <div className="flex items-start justify-between gap-1">
          <p className={cn('min-w-0 text-sm font-medium leading-snug', done ? 'line-through text-ink-3' : 'text-ink')}>
            {task.title}
          </p>
          {/* The menu portals its content, but React still bubbles its clicks
              through this tree — contain them so they don't open the editor */}
          <span className="-mr-1 -mt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Menu
            trigger={
              <IconButton label="Task actions" size="sm">
                <MoreHorizontal />
              </IconButton>
            }
          >
            <MenuItem icon={<Pencil />} onSelect={onEdit}>
              Edit task
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Move to</MenuLabel>
            {COLUMNS.filter((c) => c.status !== task.status).map((c) => (
              <MenuItem key={c.status} icon={<ArrowRight />} onSelect={() => onMove(c.status)}>
                {c.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} danger onSelect={onDelete}>
              Delete task
            </MenuItem>
          </Menu>
          </span>
        </div>
        {task.description && <p className="line-clamp-2 text-xs leading-relaxed text-ink-3">{task.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <PriorityBadge priority={task.priority} />
          {task.dueDate &&
            (done ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                <CalendarClock className="h-3 w-3" aria-hidden />
                {fmtDateShort(task.dueDate)}
              </span>
            ) : (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px]',
                  due?.overdue ? 'font-medium text-critical' : 'text-ink-3',
                )}
              >
                <CalendarClock className="h-3 w-3" aria-hidden />
                {due?.label}
              </span>
            ))}
          {task.tags.slice(0, 2).map((t) => (
            <span key={t} className="rounded-full bg-sunken px-2 py-0.5 text-[10px] font-medium text-ink-3">
              {t}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Board column ─────────────────────────────────────────────────────────────

function BoardColumn({
  id,
  label,
  dot,
  tasks,
  draggingId,
  isOver,
  onAdd,
  onEdit,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  extraHeaderAction,
}: {
  /** Anchor for the clickable stat tiles, e.g. "column-in-progress" */
  id?: string
  label: string
  dot: string
  tasks: TaskItem[]
  draggingId: string | null
  isOver: boolean
  onAdd: () => void
  onEdit: (task: TaskItem) => void
  onMove: (task: TaskItem, status: TaskStatus) => void
  onDelete: (task: TaskItem) => void
  onDragStart: (e: DragEvent<HTMLDivElement>, task: TaskItem) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  extraHeaderAction?: ReactNode
}) {
  return (
    <section id={id} aria-label={`${label} column`} className="flex min-w-0 scroll-mt-20 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />
        <h2 className="truncate text-sm font-semibold text-ink">{label}</h2>
        <Badge className="tnum">{num(tasks.length)}</Badge>
        <div className="ml-auto flex items-center gap-1">
          {extraHeaderAction}
          <IconButton label={`Add task to ${label}`} size="sm" onClick={onAdd}>
            <Plus />
          </IconButton>
        </div>
      </div>
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'flex-1 min-h-[200px] space-y-2 rounded-xl bg-sunken/50 p-2 transition-shadow duration-150',
          isOver && 'ring-2 ring-accent/40',
        )}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            dragging={draggingId === task.id}
            onDragStart={(e) => onDragStart(e, task)}
            onDragEnd={onDragEnd}
            onEdit={() => onEdit(task)}
            onMove={(s) => onMove(task, s)}
            onDelete={() => onDelete(task)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex h-[172px] items-center justify-center rounded-lg border border-dashed border-edge text-[13px] text-ink-3">
            Drop tasks here
          </div>
        )}
      </div>
    </section>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Tasks() {
  const loaded = useLoaded()
  const tasks = useStore((s) => s.tasks)
  const moveTask = useStore((s) => s.moveTask)
  const removeItem = useStore((s) => s.removeItem)

  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const debouncedQuery = useDebounced(query)
  const [priority, setPriority] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)

  // Modal state: create (with a preset column) or edit an existing task
  const [modal, setModal] = useState<{ open: boolean; task?: TaskItem; presetStatus?: TaskStatus }>({ open: false })
  const [confirmClearDone, setConfirmClearDone] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<TaskItem | null>(null)

  // Drag state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null)

  // "?new=1" auto-opens the create modal, then clears the param
  useEffect(() => {
    if (searchParams.get('new')) {
      setModal({ open: true, presetStatus: 'todo' })
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return tasks.filter((t) => {
      if (overdueOnly && (t.status === 'done' || !t.dueDate || !dueIn(t.dueDate).overdue)) return false
      if (priority && t.priority !== priority) return false
      if (!q) return true
      return t.title.toLowerCase().includes(q) || t.tags.some((tag) => tag.toLowerCase().includes(q))
    })
  }, [tasks, debouncedQuery, priority, overdueOnly])

  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, TaskItem[]>()
    for (const col of COLUMNS) {
      map.set(
        col.status,
        filtered
          .filter((t) => t.status === col.status)
          .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
      )
    }
    return map
  }, [filtered])

  // Stats over the full task list (not the filtered view)
  const open = tasks.filter((t) => t.status !== 'done')
  const overdue = open.filter((t) => t.dueDate && dueIn(t.dueDate).overdue)
  const inProgress = tasks.filter((t) => t.status === 'in-progress')
  const doneTasks = tasks.filter((t) => t.status === 'done')

  /** Clicking a stat tile resets the filters so the board matches the tile, optionally jumping to a column */
  function showTileView(opts: { overdue?: boolean; scrollTo?: TaskStatus } = {}) {
    setQuery('')
    setPriority('')
    setOverdueOnly(opts.overdue ?? false)
    if (opts.scrollTo) {
      document.getElementById(`column-${opts.scrollTo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, task: TaskItem) {
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(task.id)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverCol(null)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, status: TaskStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCol !== status) setDragOverCol(status)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, status: TaskStatus) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (id) moveTask(id, status, APPEND_AT_END)
    handleDragEnd()
  }

  function handleMenuMove(task: TaskItem, status: TaskStatus) {
    moveTask(task.id, status, APPEND_AT_END)
    toast(`Moved to ${columnLabel(status)}`, { description: task.title, tone: 'success' })
  }

  function clearDone() {
    for (const t of doneTasks) removeItem('tasks', t.id)
    toast(`Cleared ${num(doneTasks.length)} done task${doneTasks.length === 1 ? '' : 's'}`, { tone: 'success' })
  }

  if (!loaded) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tasks" description="Everything on the shop's plate, from print queue to paperwork." />
        <SkeletonStats />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => (
            <div key={c.status} className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <div className="space-y-2 rounded-xl bg-sunken/50 p-2">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Everything on the shop's plate, from print queue to paperwork."
        actions={
          <Button icon={<Plus />} onClick={() => setModal({ open: true, presetStatus: 'todo' })}>
            New task
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Open tasks"
          value={num(open.length)}
          icon={<ClipboardList />}
          clickHint="Show every open task"
          onClick={() => showTileView()}
        />
        <Stat
          label="In progress"
          value={num(inProgress.length)}
          icon={<Loader />}
          clickHint="Clear filters and jump to the In Progress column"
          onClick={() => showTileView({ scrollTo: 'in-progress' })}
        />
        <Stat
          label="Overdue"
          value={num(overdue.length)}
          icon={<AlertTriangle />}
          clickHint="Filter the board to overdue tasks"
          onClick={() => showTileView({ overdue: true })}
        />
        <Stat
          label="Done"
          value={num(doneTasks.length)}
          icon={<CheckCircle2 />}
          clickHint="Clear filters and jump to the Done column"
          onClick={() => showTileView({ scrollTo: 'done' })}
        />
      </div>

      <div>
        <FilterBar>
          <SearchInput
            containerClassName="w-full sm:w-64"
            placeholder="Search title or tags…"
            aria-label="Search tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            aria-label="Filter by priority"
            className="w-40"
            placeholder="All priorities"
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
          <Button
            variant="outline"
            icon={<AlertTriangle />}
            aria-pressed={overdueOnly}
            onClick={() => setOverdueOnly((v) => !v)}
            className={cn(
              overdueOnly && 'border-critical/40 bg-critical-wash text-critical hover:bg-critical-wash',
            )}
          >
            Overdue only
          </Button>
        </FilterBar>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col.status}
              id={`column-${col.status}`}
              label={col.label}
              dot={col.dot}
              tasks={byColumn.get(col.status) ?? []}
              draggingId={draggingId}
              isOver={dragOverCol === col.status}
              onAdd={() => setModal({ open: true, presetStatus: col.status })}
              onEdit={(task) => setModal({ open: true, task })}
              onMove={handleMenuMove}
              onDelete={setPendingDelete}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDrop={(e) => handleDrop(e, col.status)}
              extraHeaderAction={
                col.status === 'done' && doneTasks.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmClearDone(true)}>
                    Clear done
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      </div>

      <TaskModal
        open={modal.open}
        task={modal.task}
        presetStatus={modal.presetStatus}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return
          removeItem('tasks', pendingDelete.id)
          toast('Task deleted', { description: `“${pendingDelete.title}” removed from the board.`, tone: 'success' })
          setPendingDelete(null)
        }}
        danger
        title="Delete task?"
        description={pendingDelete ? `“${pendingDelete.title}” will be removed from the board. This cannot be undone.` : undefined}
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={confirmClearDone}
        onClose={() => setConfirmClearDone(false)}
        onConfirm={clearDone}
        danger
        title="Clear done tasks?"
        description={`This removes ${num(doneTasks.length)} completed task${doneTasks.length === 1 ? '' : 's'} from the board. This cannot be undone.`}
        confirmLabel="Clear done"
      />
    </div>
  )
}
