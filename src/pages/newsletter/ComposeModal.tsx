import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Eye,
  Image as ImageIcon,
  ImagePlus,
  Minus,
  MousePointerClick,
  Trash2,
  Type,
} from 'lucide-react'
import { Button, Field, IconButton, Input, Modal, Segmented, Select, Textarea, Toggle } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Newsletter, NewsletterBlock, NewsletterCadence, NewsletterStyle } from '@/data/types'
import { buildNewsletterHtml, effectiveBlocks, MERGE_TAGS, newsletterRecipients } from '@/lib/newsletter'
import { api, ApiError } from '@/lib/api'
import { prepareImageForUpload } from '@/lib/image'
import { cn, uid } from '@/lib/utils'
import { useNewsletterContext } from './useNewsletterContext'
import { NEWSLETTER_TEMPLATES } from './templates'

const CADENCES: Array<{ value: NewsletterCadence; label: string }> = [
  { value: 'one-time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

// ── Block editor bits ─────────────────────────────────────────────────────────

const BLOCK_META: Record<NewsletterBlock['type'], { label: string; Icon: typeof Type }> = {
  text: { label: 'Text', Icon: Type },
  image: { label: 'Photo', Icon: ImageIcon },
  button: { label: 'Button', Icon: MousePointerClick },
  divider: { label: 'Divider', Icon: Minus },
}

const ALIGN_OPTIONS: Array<{ value: 'left' | 'center' | 'right'; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const WIDTH_OPTIONS = [
  { value: '100', label: 'Full width' },
  { value: '80', label: '80% wide' },
  { value: '60', label: '60% wide' },
  { value: '40', label: '40% wide' },
]

const HEADER_OPTIONS: Array<{ value: 'banner' | 'light'; label: string }> = [
  { value: 'banner', label: 'Color banner' },
  { value: 'light', label: 'Light' },
]

const RADIUS_OPTIONS = [
  { value: '20', label: 'Round' },
  { value: '12', label: 'Soft' },
  { value: '0', label: 'Square' },
]

const ACCENT_PRESETS: Array<{ hex: string; name: string }> = [
  { hex: '#5f6f2d', name: 'Sage' },
  { hex: '#b04a7a', name: 'Pink' },
  { hex: '#2a6f97', name: 'Blue' },
  { hex: '#7c5cd6', name: 'Purple' },
  { hex: '#b3541e', name: 'Terracotta' },
]

/** Does a block contribute anything to the email? (dividers are just decoration) */
function blockHasContent(b: NewsletterBlock): boolean {
  if (b.type === 'text' || b.type === 'button') return Boolean(b.text?.trim())
  if (b.type === 'image') return Boolean(b.url)
  return false
}

/** Textarea that grows with its content so long copy never scrolls inside the field */
function GrowingTextarea({ value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px` // +2 for the top/bottom border
  }, [value])
  return <Textarea ref={ref} value={value} {...rest} />
}

/** Round color chip for the Style card — a ring marks the active choice */
function Swatch({ color, name, selected, onClick }: { color: string; name: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={selected}
      onClick={onClick}
      style={{ background: color }}
      className={cn(
        'h-7 w-7 rounded-full border transition-all',
        selected ? 'border-transparent ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'border-hairline hover:scale-110',
      )}
    />
  )
}

/** Create or edit a newsletter, with a live email preview beside the form. */
export function ComposeModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Newsletter | null
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)
  const subscribers = useStore((s) => s.subscribers)
  const promoCodes = useStore((s) => s.promoCodes)
  const nlSettings = useStore((s) => s.newsletterSettings)
  const ctx = useNewsletterContext()

  const [subject, setSubject] = useState('')
  const [preheader, setPreheader] = useState('')
  const [blocks, setBlocks] = useState<NewsletterBlock[]>([])
  // Merge-tag chips insert here — the last text block the user touched
  const [lastTextBlockId, setLastTextBlockId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Which image block the shared file picker is feeding
  const uploadTargetRef = useRef<string | null>(null)
  const [audienceTag, setAudienceTag] = useState('')
  const [cadence, setCadence] = useState<NewsletterCadence>('monthly')
  const [includeBestSellers, setIncludeBestSellers] = useState(true)
  const [includeNewProducts, setIncludeNewProducts] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  // Style overrides — undefined means "use the brand default"
  const [styleAccent, setStyleAccent] = useState<string>()
  const [styleBackground, setStyleBackground] = useState<string>()
  const [styleHeader, setStyleHeader] = useState<'banner' | 'light'>()
  const [styleRadius, setStyleRadius] = useState<number>()
  const [showPreviewMobile, setShowPreviewMobile] = useState(false)
  // New newsletters start on the template gallery; editing skips straight to the form
  const [pickingTemplate, setPickingTemplate] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubject(editing?.subject ?? '')
    setPreheader(editing?.preheader ?? '')
    // Copy the blocks so edits never touch the stored campaign; blank starts get one empty text block
    setBlocks(editing ? effectiveBlocks(editing).map((b) => ({ ...b })) : [{ id: uid('blk'), type: 'text' }])
    setLastTextBlockId(null)
    setAudienceTag(editing?.audienceTag ?? '')
    setCadence(editing?.cadence ?? nlSettings.defaultCadence)
    setIncludeBestSellers(editing?.includeBestSellers ?? true)
    setIncludeNewProducts(editing?.includeNewProducts ?? false)
    setPromoCode(editing?.promoCode ?? '')
    setStyleAccent(editing?.style?.accent)
    setStyleBackground(editing?.style?.background)
    setStyleHeader(editing?.style?.header)
    setStyleRadius(editing?.style?.radius)
    setShowPreviewMobile(false)
    setPickingTemplate(!editing)
  }, [open, editing, nlSettings.defaultCadence])

  const applyTemplate = (t: (typeof NEWSLETTER_TEMPLATES)[number]) => {
    const p = t.preset
    setSubject(p.subject ?? '')
    setPreheader(p.preheader ?? '')
    // Presets describe a legacy intro + CTA — run them through the same converter editing uses
    setBlocks(
      effectiveBlocks({
        id: 'preset',
        subject: '',
        intro: p.intro ?? '',
        ctaLabel: p.ctaLabel,
        ctaUrl: p.ctaUrl,
        cadence: 'one-time',
        status: 'draft',
        includeBestSellers: false,
        includeNewProducts: false,
        createdAt: '',
      }),
    )
    setLastTextBlockId(null)
    setIncludeBestSellers(p.includeBestSellers ?? false)
    setIncludeNewProducts(p.includeNewProducts ?? false)
    setPromoCode('')
    setPickingTemplate(false)
  }

  // ── Block operations ──────────────────────────────────────────────────────

  const patchBlock = (id: string, patch: Partial<NewsletterBlock>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))

  const moveBlock = (id: string, dir: -1 | 1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= bs.length) return bs
      const next = [...bs]
      next[i] = bs[j]
      next[j] = bs[i]
      return next
    })

  const removeBlock = (id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id))

  const pickPhotoFor = (blockId: string) => {
    uploadTargetRef.current = blockId
    photoInputRef.current?.click()
  }

  const addBlock = (type: NewsletterBlock['type']) => {
    const block: NewsletterBlock = { id: uid('blk'), type }
    setBlocks((bs) => [...bs, block])
    if (type === 'image') pickPhotoFor(block.id) // straight into the file picker
  }

  // Prep the photo client-side then upload; only the server URL ever lands in the block
  const uploadPhoto = async (blockId: string, file: File) => {
    setUploadingId(blockId)
    try {
      const blob = await prepareImageForUpload(file)
      const { url } = await api.upload(blob)
      patchBlock(blockId, { url })
    } catch (err) {
      toast(`Couldn’t upload ${file.name}`, {
        description: err instanceof ApiError ? err.message : 'Could not read that image.',
        tone: 'error',
      })
    } finally {
      setUploadingId((id) => (id === blockId ? null : id))
    }
  }

  // Chips append to the focused text block, falling back to the last one there is
  const insertMergeTag = (tag: string) => {
    setBlocks((bs) => {
      const target =
        bs.find((b) => b.type === 'text' && b.id === lastTextBlockId) ?? [...bs].reverse().find((b) => b.type === 'text')
      if (!target) return [...bs, { id: uid('blk'), type: 'text', text: tag }]
      return bs.map((b) =>
        b.id === target.id ? { ...b, text: `${b.text ?? ''}${b.text && !b.text.endsWith(' ') ? ' ' : ''}${tag}` } : b,
      )
    })
  }

  // Distinct subscriber tags for the audience picker
  const tagOptions = useMemo(() => {
    const set = new Set<string>()
    subscribers.forEach((s) => s.tags.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [subscribers])

  // Legacy summary copy — list views and older code still read intro/ctaLabel
  const introCopy = useMemo(
    () =>
      blocks
        .filter((b) => b.type === 'text' && b.text?.trim())
        .map((b) => (b.text ?? '').trim())
        .join('\n\n'),
    [blocks],
  )

  // Only real overrides are kept — an empty style saves as undefined
  const style = useMemo<NewsletterStyle | undefined>(() => {
    const s: NewsletterStyle = {}
    if (styleAccent) s.accent = styleAccent
    if (styleBackground) s.background = styleBackground
    if (styleHeader) s.header = styleHeader
    if (styleRadius !== undefined) s.radius = styleRadius
    return Object.keys(s).length ? s : undefined
  }, [styleAccent, styleBackground, styleHeader, styleRadius])

  // While everything is still blank the preview shows a nudge instead of an empty body
  const previewBlocks = useMemo<NewsletterBlock[]>(
    () => (blocks.some(blockHasContent) ? blocks : [{ id: 'nudge', type: 'text', text: 'Start writing your newsletter…' }]),
    [blocks],
  )

  const draft: Newsletter = useMemo(
    () => ({
      id: editing?.id ?? 'preview',
      subject: subject || '(no subject)',
      preheader: preheader || undefined,
      intro: introCopy,
      blocks: previewBlocks,
      style,
      audienceTag: audienceTag || undefined,
      cadence,
      status: editing?.status ?? 'draft',
      includeBestSellers,
      includeNewProducts,
      promoCode: promoCode || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }),
    [editing, subject, preheader, introCopy, previewBlocks, style, audienceTag, cadence, includeBestSellers, includeNewProducts, promoCode],
  )

  // Personalize the preview with a real subscriber's first name
  const previewCtx = useMemo(() => {
    const sample = newsletterRecipients(draft, subscribers)[0]
    const firstName = sample?.name?.split(' ')[0]
    return { ...ctx, sampleFirstName: firstName }
  }, [ctx, draft, subscribers])
  const previewHtml = useMemo(() => buildNewsletterHtml(draft, nlSettings, previewCtx), [draft, nlSettings, previewCtx])
  const recipientCount = useMemo(
    () => newsletterRecipients(draft, subscribers).length,
    [draft, subscribers],
  )

  const valid = subject.trim().length > 0 && blocks.some(blockHasContent)

  const submit = () => {
    if (!valid) return
    const firstButton = blocks.find((b) => b.type === 'button' && b.text?.trim())
    const payload = {
      subject: subject.trim(),
      preheader: preheader.trim() || undefined,
      blocks,
      style,
      // Legacy fields stay in sync so list summaries keep reading correctly
      intro: introCopy || 'Photo update',
      ctaLabel: firstButton?.text?.trim() || undefined,
      ctaUrl: firstButton?.url?.trim() || undefined,
      audienceTag: audienceTag || undefined,
      cadence,
      includeBestSellers,
      includeNewProducts,
      promoCode: promoCode || undefined,
    }
    if (editing) {
      updateItem('newsletters', editing.id, payload)
      toast('Newsletter updated', { tone: 'success' })
    } else {
      addItem('newsletters', { id: uid('nws'), status: 'draft', createdAt: new Date().toISOString(), ...payload })
      toast('Draft saved', { tone: 'success' })
    }
    onClose()
  }

  // Template gallery (shown first for new newsletters)
  if (pickingTemplate) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Choose a starting point"
        description="Pick a template or start from scratch — you can change everything."
        size="lg"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NEWSLETTER_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t)}
              className="flex items-start gap-3 rounded-xl border border-edge bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lifted"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl brand-gradient-soft text-xl">
                {t.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-ink">{t.name}</span>
                <span className="mt-0.5 block text-[13px] text-ink-3">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit newsletter' : 'New newsletter'}
      description={`${recipientCount} subscriber${recipientCount === 1 ? '' : 's'} will receive this`}
      size="lg"
      footer={
        <>
          {!editing && (
            <Button variant="ghost" size="sm" icon={<ChevronLeft />} className="mr-auto" onClick={() => setPickingTemplate(true)}>
              Templates
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Eye />}
            className="sm:hidden"
            onClick={() => setShowPreviewMobile((v) => !v)}
          >
            {showPreviewMobile ? 'Edit' : 'Preview'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Save draft'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Form */}
        <div className={showPreviewMobile ? 'hidden sm:block' : 'block'}>
          {/* One shared picker — uploadTargetRef points it at the block that asked */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              const target = uploadTargetRef.current
              e.target.value = '' // allow re-picking the same file
              if (file && target) void uploadPhoto(target, file)
            }}
          />
          <div className="space-y-4">
            <Field label="Subject" required>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your July maker update 🌞" autoFocus />
            </Field>
            <Field label="Preview text" hint="The teaser shown after the subject in inboxes.">
              <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Market dates, a new collection, and a treat" />
            </Field>

            {/* ── Content blocks ── */}
            <div>
              <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-ink-2">
                Content blocks<span className="text-critical">*</span>
              </span>
              <div className="space-y-2">
                {blocks.map((b, i) => {
                  const { label, Icon } = BLOCK_META[b.type]
                  return (
                    <div key={b.id} className="rounded-xl border border-edge p-2.5">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
                        <div className="ml-auto flex items-center">
                          <IconButton label={`Move block ${i + 1} up`} size="sm" disabled={i === 0} onClick={() => moveBlock(b.id, -1)}>
                            <ArrowUp />
                          </IconButton>
                          <IconButton
                            label={`Move block ${i + 1} down`}
                            size="sm"
                            disabled={i === blocks.length - 1}
                            onClick={() => moveBlock(b.id, 1)}
                          >
                            <ArrowDown />
                          </IconButton>
                          <IconButton label={`Delete block ${i + 1}`} size="sm" className="hover:text-critical" onClick={() => removeBlock(b.id)}>
                            <Trash2 />
                          </IconButton>
                        </div>
                      </div>

                      {b.type === 'text' && (
                        <GrowingTextarea
                          aria-label={`Text block ${i + 1}`}
                          rows={3}
                          value={b.text ?? ''}
                          onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                          onFocus={() => setLastTextBlockId(b.id)}
                          placeholder="Write something… (blank lines start new paragraphs)"
                          className="mt-1.5"
                        />
                      )}

                      {b.type === 'image' &&
                        (b.url ? (
                          <div className="mt-1.5 space-y-2">
                            <img
                              src={b.url}
                              alt={b.text?.trim() || 'Newsletter photo'}
                              className="max-h-32 rounded-lg border border-hairline"
                            />
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <Input
                                aria-label={`Photo ${i + 1} caption`}
                                value={b.text ?? ''}
                                onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                                placeholder="Caption (optional)"
                              />
                              <Input
                                aria-label={`Photo ${i + 1} link`}
                                value={b.linkUrl ?? ''}
                                onChange={(e) => patchBlock(b.id, { linkUrl: e.target.value })}
                                placeholder="Link when clicked (optional)"
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Select
                                aria-label={`Photo ${i + 1} width`}
                                className="w-36"
                                value={String(b.widthPct ?? 100)}
                                onChange={(e) => patchBlock(b.id, { widthPct: Number(e.target.value) })}
                                options={WIDTH_OPTIONS}
                              />
                              <Segmented options={ALIGN_OPTIONS} value={b.align ?? 'center'} onChange={(v) => patchBlock(b.id, { align: v })} />
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<ImagePlus />}
                                disabled={uploadingId === b.id}
                                onClick={() => pickPhotoFor(b.id)}
                              >
                                {uploadingId === b.id ? 'Uploading…' : 'Replace'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={uploadingId === b.id}
                            onClick={() => pickPhotoFor(b.id)}
                            className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-edge bg-sunken/50 px-3 py-6 text-[13px] font-medium text-ink-3 transition-colors hover:border-accent/40 hover:text-ink-2 disabled:opacity-50"
                          >
                            <ImagePlus className="h-4 w-4" />
                            {uploadingId === b.id ? 'Uploading…' : 'Add a photo'}
                          </button>
                        ))}

                      {b.type === 'button' && (
                        <div className="mt-1.5 space-y-2">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Input
                              aria-label={`Button ${i + 1} label`}
                              value={b.text ?? ''}
                              onChange={(e) => patchBlock(b.id, { text: e.target.value })}
                              placeholder="Shop now"
                            />
                            <Input
                              aria-label={`Button ${i + 1} link`}
                              value={b.url ?? ''}
                              onChange={(e) => patchBlock(b.id, { url: e.target.value })}
                              placeholder="https://your-shop.com"
                              className={cn(b.text?.trim() && !b.url?.trim() && 'border-warn')}
                            />
                          </div>
                          <Segmented options={ALIGN_OPTIONS} value={b.align ?? 'center'} onChange={(v) => patchBlock(b.id, { align: v })} />
                        </div>
                      )}
                      {/* divider blocks are just the label row above */}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-3">Add:</span>
                <Button variant="secondary" size="sm" icon={<Type />} onClick={() => addBlock('text')}>
                  Text
                </Button>
                <Button variant="secondary" size="sm" icon={<ImageIcon />} onClick={() => addBlock('image')}>
                  Photo
                </Button>
                <Button variant="secondary" size="sm" icon={<MousePointerClick />} onClick={() => addBlock('button')}>
                  Button
                </Button>
                <Button variant="secondary" size="sm" icon={<Minus />} onClick={() => addBlock('divider')}>
                  Divider
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-3">Personalize:</span>
              {MERGE_TAGS.map((m) => (
                <button
                  key={m.tag}
                  type="button"
                  title={m.label}
                  onClick={() => insertMergeTag(m.tag)}
                  className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:bg-hairline"
                >
                  {m.tag}
                </button>
              ))}
            </div>

            <Field label="Audience">
              <Select
                value={audienceTag}
                onChange={(e) => setAudienceTag(e.target.value)}
                placeholder="All subscribers"
                options={tagOptions.map((t) => ({ value: t, label: `Tagged “${t}”` }))}
              />
            </Field>
            <Field label="Cadence" hint="Recurring newsletters remember their schedule from Settings.">
              <Select value={cadence} onChange={(e) => setCadence(e.target.value as NewsletterCadence)} options={CADENCES} />
            </Field>

            <div className="rounded-xl border border-edge p-3.5">
              <div className="mb-2 text-[13px] font-medium text-ink-2">Auto content</div>
              <div className="space-y-2.5">
                <Toggle
                  checked={includeBestSellers}
                  onChange={setIncludeBestSellers}
                  label="Best sellers"
                  description="Adds your top 3 products automatically."
                />
                <Toggle
                  checked={includeNewProducts}
                  onChange={setIncludeNewProducts}
                  label="New products"
                  description="Adds your 3 newest listings."
                />
              </div>
              <Field label="Feature a promo code" className="mt-3">
                <Select
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="None"
                  options={promoCodes.filter((p) => p.active).map((p) => ({ value: p.code, label: `${p.code} · ${p.discountPct}% off` }))}
                />
              </Field>
            </div>

            {/* ── Style ── */}
            <div className="rounded-xl border border-edge p-3.5">
              <div className="mb-2 text-[13px] font-medium text-ink-2">Style</div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-xs text-ink-3">Accent color</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Swatch color={ctx.accent} name="Brand" selected={styleAccent === undefined} onClick={() => setStyleAccent(undefined)} />
                    {ACCENT_PRESETS.map((p) => (
                      <Swatch key={p.hex} color={p.hex} name={p.name} selected={styleAccent === p.hex} onClick={() => setStyleAccent(p.hex)} />
                    ))}
                    <input
                      type="color"
                      value={styleAccent ?? ctx.accent}
                      onChange={(e) => setStyleAccent(e.target.value)}
                      aria-label="Custom accent color"
                      title="Custom"
                      className="h-7 w-7 cursor-pointer rounded-full border border-hairline bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs text-ink-3">Background</div>
                  <div className="flex items-center gap-2">
                    <Swatch color="#f4f4f2" name="Paper (default)" selected={styleBackground === undefined} onClick={() => setStyleBackground(undefined)} />
                    <Swatch color="#ffffff" name="White" selected={styleBackground === '#ffffff'} onClick={() => setStyleBackground('#ffffff')} />
                    <Swatch color="#efe9e1" name="Cream" selected={styleBackground === '#efe9e1'} onClick={() => setStyleBackground('#efe9e1')} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 text-xs text-ink-3">Header</div>
                    <Segmented
                      options={HEADER_OPTIONS}
                      value={styleHeader ?? 'banner'}
                      onChange={(v) => setStyleHeader(v === 'banner' ? undefined : v)}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs text-ink-3">Corners</div>
                    <Select
                      aria-label="Card corners"
                      value={String(styleRadius ?? 20)}
                      onChange={(e) => setStyleRadius(e.target.value === '20' ? undefined : Number(e.target.value))}
                      options={RADIUS_OPTIONS}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className={showPreviewMobile ? 'block' : 'hidden sm:block'}>
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
            <Eye className="h-4 w-4" /> Live preview
          </div>
          <div className="overflow-hidden rounded-xl border border-edge bg-sunken">
            <iframe
              title="Newsletter preview"
              srcDoc={previewHtml}
              className="h-[460px] w-full border-0 bg-white"
              sandbox=""
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}
