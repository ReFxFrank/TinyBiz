import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileText, FolderOpen, HardDrive, MoreHorizontal, Receipt, Upload, Download, Pencil, Trash2, UploadCloud } from 'lucide-react'
import {
  Badge,
  Button,
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
  FilterBar,
  SearchInput,
  Select,
  SkeletonStats,
  SkeletonTable,
  Stat,
  Textarea,
  type BadgeTone,
  type Column,
} from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { DocCategory, DocFileType, DocumentItem } from '@/data/types'
import { fmtDate, timeAgo, num } from '@/lib/format'
import { cn, downloadFile, uid, useLoaded } from '@/lib/utils'

const CATEGORIES: DocCategory[] = ['Invoice', 'Receipt', 'Manual', 'Warranty', 'Supplier', 'Tax']
const FILE_TYPES: DocFileType[] = ['pdf', 'png', 'jpg', 'docx', 'xlsx', 'csv']

const CATEGORY_TONE: Record<DocCategory, BadgeTone> = {
  Invoice: 'blue',
  Receipt: 'green',
  Manual: 'neutral',
  Warranty: 'violet',
  Supplier: 'orange',
  Tax: 'yellow',
}

const TYPE_TILE: Record<DocFileType, string> = {
  pdf: 'bg-critical-wash text-critical',
  xlsx: 'bg-good-wash text-[#006300] dark:text-good',
  docx: 'bg-accent-wash text-accent-strong dark:text-accent',
  png: 'bg-pop-soft text-pop',
  jpg: 'bg-pop-soft text-pop',
  csv: 'bg-warn-wash text-[#8a6100] dark:text-warn',
}

function prettySize(sizeKB: number): string {
  if (sizeKB >= 1024) return `${(sizeKB / 1024).toFixed(1)} MB`
  return `${Math.round(sizeKB)} KB`
}

function FileTile({ type }: { type: DocFileType }) {
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold uppercase',
        TYPE_TILE[type],
      )}
      aria-hidden
    >
      {type}
    </div>
  )
}

// ── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addItem = useStore((s) => s.addItem)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('')
  const [fileType, setFileType] = useState<string>('')
  const [tags, setTags] = useState('')
  const [notes, setNotes] = useState('')
  const [attached, setAttached] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setCategory('')
      setFileType('')
      setTags('')
      setNotes('')
      setAttached(false)
    }
  }, [open])

  const valid = name.trim().length > 0 && category !== '' && fileType !== ''

  const submit = () => {
    if (!valid) return
    const doc: DocumentItem = {
      id: uid('doc'),
      name: name.trim(),
      category: category as DocCategory,
      fileType: fileType as DocFileType,
      sizeKB: Math.round(Math.random() * 3950) + 50,
      uploadedAt: new Date().toISOString(),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
    }
    addItem('documents', doc)
    toast('Uploaded', { description: `${doc.name} (${prettySize(doc.sizeKB)}) added to your documents.`, tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
      description="Add a file to your business archive."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={submit} icon={<Upload />}>
            Upload
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setAttached(true)}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
            attached
              ? 'border-good/50 bg-good-wash text-[#006300] dark:text-good'
              : 'border-edge bg-sunken/50 text-ink-3 hover:border-accent/50 hover:bg-accent-wash/40 hover:text-accent',
          )}
        >
          <UploadCloud className="h-7 w-7" />
          <span className="text-[13px] font-medium">
            {attached ? 'File attached — ready to upload' : 'Click to browse, or drop a file here'}
          </span>
          {!attached && <span className="text-xs">PDF, PNG, JPG, DOCX, XLSX, CSV up to 10 MB</span>}
        </button>
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Filament invoice — June"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" required>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Select…"
              options={CATEGORIES}
            />
          </Field>
          <Field label="File type" required>
            <Select
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              placeholder="Select…"
              options={FILE_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))}
            />
          </Field>
        </div>
        <Field label="Tags" hint="Comma-separated, e.g. supplies, q2">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="supplies, q2" />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this file…" />
        </Field>
      </div>
    </Modal>
  )
}

// ── Rename modal ─────────────────────────────────────────────────────────────

function RenameModal({ doc, onClose }: { doc: DocumentItem | null; onClose: () => void }) {
  const updateItem = useStore((s) => s.updateItem)
  const [name, setName] = useState('')

  useEffect(() => {
    if (doc) setName(doc.name)
  }, [doc])

  const valid = name.trim().length > 0

  const submit = () => {
    if (!doc || !valid) return
    updateItem('documents', doc.id, { name: name.trim() })
    toast('Document renamed', { tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open={doc !== null}
      onClose={onClose}
      title="Rename document"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
      </Field>
    </Modal>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Documents() {
  const loaded = useLoaded()
  const documents = useStore((s) => s.documents)
  const removeItem = useStore((s) => s.removeItem)

  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  // Re-sync the search box when navigated here again (e.g. from global search)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setQuery(q)
  }, [searchParams])

  const [category, setCategory] = useState('')
  const [fileType, setFileType] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [renaming, setRenaming] = useState<DocumentItem | null>(null)
  const [deleting, setDeleting] = useState<DocumentItem | null>(null)

  // ?new=1 auto-opens the upload modal
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setUploadOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return documents.filter((d) => {
      if (category && d.category !== category) return false
      if (fileType && d.fileType !== fileType) return false
      if (q && !d.name.toLowerCase().includes(q) && !d.tags.some((t) => t.toLowerCase().includes(q))) return false
      return true
    })
  }, [documents, query, category, fileType])

  const totalKB = useMemo(() => documents.reduce((a, d) => a + d.sizeKB, 0), [documents])
  const invoiceCount = documents.filter((d) => d.category === 'Invoice').length
  const taxCount = documents.filter((d) => d.category === 'Tax').length

  /** Clicking a stat tile resets the other filters so the table count matches the tile */
  const showTileFilter = (cat: DocCategory | '') => {
    setQuery('')
    setFileType('')
    setCategory(cat)
  }

  const download = (doc: DocumentItem) => {
    downloadFile(
      `${doc.name}.${doc.fileType}`,
      `TinyBiz demo document\n\nName: ${doc.name}\nCategory: ${doc.category}\nUploaded: ${fmtDate(doc.uploadedAt)}\nSize: ${prettySize(doc.sizeKB)}\n${doc.notes ? `Notes: ${doc.notes}\n` : ''}`,
    )
    toast('Download started', { description: `${doc.name}.${doc.fileType}` })
  }

  const columns: Array<Column<DocumentItem>> = [
    {
      key: 'name',
      header: 'Document',
      sortValue: (d) => d.name.toLowerCase(),
      render: (d) => (
        <div className="flex items-center gap-3">
          <FileTile type={d.fileType} />
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{d.name}</div>
            {d.tags.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {d.tags.map((t) => (
                  <span key={t} className="rounded-full bg-sunken px-1.5 py-px text-[10px] font-medium text-ink-3">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortValue: (d) => d.category,
      hideBelow: 'sm',
      render: (d) => <Badge tone={CATEGORY_TONE[d.category]}>{d.category}</Badge>,
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      sortValue: (d) => d.sizeKB,
      hideBelow: 'md',
      render: (d) => <span className="tnum text-ink-2">{prettySize(d.sizeKB)}</span>,
    },
    {
      key: 'uploadedAt',
      header: 'Uploaded',
      sortValue: (d) => d.uploadedAt,
      render: (d) => (
        <div>
          <div className="text-ink-2">{fmtDate(d.uploadedAt)}</div>
          <div className="text-xs text-ink-3">{timeAgo(d.uploadedAt)}</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 'w-12',
      render: (d) => (
        <Menu
          trigger={
            <IconButton label={`Actions for ${d.name}`} size="sm">
              <MoreHorizontal />
            </IconButton>
          }
        >
          <MenuItem icon={<Download />} onSelect={() => download(d)}>
            Download
          </MenuItem>
          <MenuItem icon={<Pencil />} onSelect={() => setRenaming(d)}>
            Rename
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={() => setDeleting(d)}>
            Delete
          </MenuItem>
        </Menu>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Invoices, receipts, manuals and tax paperwork — everything in one tidy drawer."
        actions={
          <Button icon={<Upload />} onClick={() => setUploadOpen(true)}>
            Upload document
          </Button>
        }
      />

      {!loaded ? (
        <SkeletonStats />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Total documents"
            value={num(documents.length)}
            icon={<FolderOpen />}
            clickHint="Show every document"
            onClick={() => showTileFilter('')}
          />
          <Stat
            label="Storage used"
            value={`${(totalKB / 1024).toFixed(1)} MB`}
            icon={<HardDrive />}
            clickHint="View all documents"
            onClick={() => showTileFilter('')}
          />
          <Stat
            label="Invoices"
            value={num(invoiceCount)}
            icon={<Receipt />}
            clickHint="Filter the table to invoices"
            onClick={() => showTileFilter('Invoice')}
          />
          <Stat
            label="Tax documents"
            value={num(taxCount)}
            icon={<FileText />}
            clickHint="Filter the table to tax documents"
            onClick={() => showTileFilter('Tax')}
          />
        </div>
      )}

      <div>
        <FilterBar>
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or tag…"
            aria-label="Search documents"
            containerClassName="w-full sm:w-64"
          />
          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="All categories"
            options={CATEGORIES}
            className="w-40"
          />
          <Select
            aria-label="Filter by file type"
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            placeholder="All types"
            options={FILE_TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))}
            className="w-32"
          />
        </FilterBar>

        {!loaded ? (
          <SkeletonTable />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(d) => d.id}
            initialSort={{ key: 'uploadedAt', dir: 'desc' }}
            emptyState={
              <EmptyState
                icon={<FileText />}
                title="No documents match"
                description="Try a different search, clear the filters, or upload a new file."
                action={
                  <Button icon={<Upload />} onClick={() => setUploadOpen(true)}>
                    Upload document
                  </Button>
                }
              />
            }
          />
        )}
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <RenameModal doc={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          removeItem('documents', deleting.id)
          toast('Document deleted', { tone: 'success' })
        }}
        title="Delete document?"
        description={deleting ? `"${deleting.name}" will be permanently removed from your archive.` : undefined}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
