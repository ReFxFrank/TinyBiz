import { useMemo, useState } from 'react'
import { Download, Plus, UserMinus, UserPlus, Trash2, Upload } from 'lucide-react'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Menu,
  MenuItem,
  Modal,
  SearchInput,
  Select,
  Textarea,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Subscriber } from '@/data/types'
import { fmtDate } from '@/lib/format'
import { downloadFile, toCsv, uid, useDebounced } from '@/lib/utils'

export function SubscribersTab() {
  const subscribers = useStore((s) => s.subscribers)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const removeItem = useStore((s) => s.removeItem)

  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim().toLowerCase(), 200)
  const [status, setStatus] = useState('')
  const [tag, setTag] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [deleting, setDeleting] = useState<Subscriber | null>(null)

  const tags = useMemo(() => {
    const set = new Set<string>()
    subscribers.forEach((s) => s.tags.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [subscribers])

  const filtered = useMemo(
    () =>
      subscribers.filter((s) => {
        if (status && s.status !== status) return false
        if (tag && !s.tags.includes(tag)) return false
        if (q && !s.email.toLowerCase().includes(q) && !(s.name ?? '').toLowerCase().includes(q)) return false
        return true
      }),
    [subscribers, q, status, tag],
  )

  const setSubStatus = (s: Subscriber, next: Subscriber['status']) => {
    updateItem('subscribers', s.id, { status: next })
    toast(next === 'subscribed' ? 'Resubscribed' : 'Unsubscribed', { tone: 'success' })
  }

  const exportCsv = () => {
    const csv = toCsv(
      ['Email', 'Name', 'Status', 'Tags', 'Source', 'Joined'],
      filtered.map((s) => [s.email, s.name ?? '', s.status, s.tags.join(' '), s.source, s.createdAt.slice(0, 10)]),
    )
    downloadFile('subscribers.csv', csv, 'text/csv')
    toast('Subscribers exported', { tone: 'success' })
  }

  const columns: Array<Column<Subscriber>> = [
    {
      key: 'email',
      header: 'Subscriber',
      sortValue: (s) => s.email,
      render: (s) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{s.name || s.email}</div>
          {s.name && <div className="truncate text-xs text-ink-3">{s.email}</div>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (s) => s.status,
      render: (s) => (
        <Badge tone={s.status === 'subscribed' ? 'green' : 'neutral'} dot>
          {s.status === 'subscribed' ? 'Subscribed' : 'Unsubscribed'}
        </Badge>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      hideBelow: 'md',
      render: (s) =>
        s.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {s.tags.map((t) => (
              <Badge key={t} tone={t === 'vip' ? 'violet' : 'neutral'}>
                {t}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    { key: 'source', header: 'Source', hideBelow: 'lg', render: (s) => <span className="text-ink-2">{s.source}</span> },
    {
      key: 'createdAt',
      header: 'Joined',
      hideBelow: 'lg',
      sortValue: (s) => new Date(s.createdAt).getTime(),
      render: (s) => <span className="text-ink-2">{fmtDate(s.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 'w-12',
      render: (s) => (
        <Menu
          trigger={
            <button aria-label={`Actions for ${s.email}`} className="rounded-lg px-2 py-1 text-ink-3 hover:bg-sunken hover:text-ink">
              ⋯
            </button>
          }
        >
          {s.status === 'subscribed' ? (
            <MenuItem icon={<UserMinus />} onSelect={() => setSubStatus(s, 'unsubscribed')}>
              Unsubscribe
            </MenuItem>
          ) : (
            <MenuItem icon={<UserPlus />} onSelect={() => setSubStatus(s, 'subscribed')}>
              Resubscribe
            </MenuItem>
          )}
          <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(s)}>
            Delete
          </MenuItem>
        </Menu>
      ),
    },
  ]

  return (
    <div>
      <FilterBar>
        <SearchInput
          aria-label="Search subscribers"
          placeholder="Search email or name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          containerClassName="w-full sm:w-64"
        />
        <Select
          aria-label="Filter by status"
          placeholder="All statuses"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: 'subscribed', label: 'Subscribed' },
            { value: 'unsubscribed', label: 'Unsubscribed' },
          ]}
          className="w-40"
        />
        {tags.length > 0 && (
          <Select
            aria-label="Filter by tag"
            placeholder="All tags"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            options={tags}
            className="w-36"
          />
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" icon={<Upload />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button variant="outline" size="sm" icon={<Download />} onClick={exportCsv} disabled={filtered.length === 0}>
            Export
          </Button>
          <Button size="sm" icon={<Plus />} onClick={() => setAddOpen(true)}>
            Add
          </Button>
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(s) => s.id}
        initialSort={{ key: 'createdAt', dir: 'desc' }}
        emptyState={
          <EmptyState
            icon={<UserPlus />}
            title={subscribers.length === 0 ? 'No subscribers yet' : 'No subscribers match'}
            description={
              subscribers.length === 0
                ? 'Add subscribers or import a list to start building your audience.'
                : 'Try clearing the search or filters.'
            }
            action={
              <Button size="sm" icon={<Plus />} onClick={() => setAddOpen(true)}>
                Add subscriber
              </Button>
            }
          />
        }
      />

      <AddSubscriberModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} existing={subscribers} onAdd={addItem} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            removeItem('subscribers', deleting.id)
            toast('Subscriber removed', { tone: 'success' })
          }
        }}
        title="Remove subscriber?"
        description={deleting ? `${deleting.email} will be deleted from your list.` : undefined}
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}

function AddSubscriberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addItem = useStore((s) => s.addItem)
  const subscribers = useStore((s) => s.subscribers)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [tags, setTags] = useState('')

  const emailValid = /\S+@\S+\.\S+/.test(email)
  const dup = subscribers.some((s) => s.email.toLowerCase() === email.trim().toLowerCase())
  const valid = emailValid && !dup

  const submit = () => {
    if (!valid) return
    addItem('subscribers', {
      id: uid('sub'),
      email: email.trim(),
      name: name.trim() || undefined,
      status: 'subscribed',
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      source: 'Manual',
      createdAt: new Date().toISOString(),
    })
    toast('Subscriber added', { tone: 'success' })
    setEmail('')
    setName('')
    setTags('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add subscriber"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Add subscriber
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Email" required error={email && !emailValid ? 'Enter a valid email' : dup ? 'Already on your list' : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maker@example.com" autoFocus />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Tags" hint="Comma-separated, e.g. vip, wholesale">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip" />
        </Field>
      </div>
    </Modal>
  )
}

function ImportModal({
  open,
  onClose,
  existing,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  existing: Subscriber[]
  onAdd: (key: 'subscribers', item: Subscriber) => Subscriber
}) {
  const [text, setText] = useState('')

  // Parse "email" or "email, Name" per line
  const parsed = useMemo(() => {
    const seen = new Set(existing.map((s) => s.email.toLowerCase()))
    const out: Array<{ email: string; name?: string }> = []
    for (const line of text.split(/[\n,;]+|(?<=\S)\s{2,}/)) {
      const parts = line.split(/[,\t]/).map((p) => p.trim())
      const email = parts.find((p) => /\S+@\S+\.\S+/.test(p))
      if (!email) continue
      const key = email.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const name = parts.find((p) => p && p !== email && !/@/.test(p))
      out.push({ email, name })
    }
    return out
  }, [text, existing])

  const submit = () => {
    parsed.forEach((p) =>
      onAdd('subscribers', {
        id: uid('sub'),
        email: p.email,
        name: p.name,
        status: 'subscribed',
        tags: [],
        source: 'Import',
        createdAt: new Date().toISOString(),
      }),
    )
    toast(`Imported ${parsed.length} subscriber${parsed.length === 1 ? '' : 's'}`, { tone: 'success' })
    setText('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import subscribers"
      description="Paste emails — one per line, or “email, Name”. Duplicates are skipped."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={parsed.length === 0}>
            Import {parsed.length > 0 ? `${parsed.length}` : ''}
          </Button>
        </>
      }
    >
      <Textarea
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'aria@example.com, Aria Blythe\ntom@example.com\n…'}
        autoFocus
      />
      <p className="mt-2 text-xs text-ink-3">{parsed.length} new email{parsed.length === 1 ? '' : 's'} ready to import.</p>
    </Modal>
  )
}
