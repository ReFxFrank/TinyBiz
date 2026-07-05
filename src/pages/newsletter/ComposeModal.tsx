import { useEffect, useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea, Toggle } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Newsletter, NewsletterCadence } from '@/data/types'
import { buildNewsletterHtml, newsletterRecipients } from '@/lib/newsletter'
import { uid } from '@/lib/utils'
import { useNewsletterContext } from './useNewsletterContext'

const CADENCES: Array<{ value: NewsletterCadence; label: string }> = [
  { value: 'one-time', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

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
  const [intro, setIntro] = useState('')
  const [audienceTag, setAudienceTag] = useState('')
  const [cadence, setCadence] = useState<NewsletterCadence>('monthly')
  const [includeBestSellers, setIncludeBestSellers] = useState(true)
  const [includeNewProducts, setIncludeNewProducts] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [showPreviewMobile, setShowPreviewMobile] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubject(editing?.subject ?? '')
    setPreheader(editing?.preheader ?? '')
    setIntro(editing?.intro ?? '')
    setAudienceTag(editing?.audienceTag ?? '')
    setCadence(editing?.cadence ?? nlSettings.defaultCadence)
    setIncludeBestSellers(editing?.includeBestSellers ?? true)
    setIncludeNewProducts(editing?.includeNewProducts ?? false)
    setPromoCode(editing?.promoCode ?? '')
    setShowPreviewMobile(false)
  }, [open, editing, nlSettings.defaultCadence])

  // Distinct subscriber tags for the audience picker
  const tagOptions = useMemo(() => {
    const set = new Set<string>()
    subscribers.forEach((s) => s.tags.forEach((t) => set.add(t)))
    return [...set].sort()
  }, [subscribers])

  const draft: Newsletter = useMemo(
    () => ({
      id: editing?.id ?? 'preview',
      subject: subject || '(no subject)',
      preheader: preheader || undefined,
      intro: intro || 'Start writing your newsletter…',
      audienceTag: audienceTag || undefined,
      cadence,
      status: editing?.status ?? 'draft',
      includeBestSellers,
      includeNewProducts,
      promoCode: promoCode || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }),
    [editing, subject, preheader, intro, audienceTag, cadence, includeBestSellers, includeNewProducts, promoCode],
  )

  const previewHtml = useMemo(() => buildNewsletterHtml(draft, nlSettings, ctx), [draft, nlSettings, ctx])
  const recipientCount = useMemo(
    () => newsletterRecipients(draft, subscribers).length,
    [draft, subscribers],
  )

  const valid = subject.trim().length > 0 && intro.trim().length > 0

  const submit = () => {
    if (!valid) return
    const payload = {
      subject: subject.trim(),
      preheader: preheader.trim() || undefined,
      intro: intro.trim(),
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit newsletter' : 'New newsletter'}
      description={`${recipientCount} subscriber${recipientCount === 1 ? '' : 's'} will receive this`}
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<Eye />}
            className="mr-auto sm:hidden"
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
          <div className="space-y-4">
            <Field label="Subject" required>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your July maker update 🌞" autoFocus />
            </Field>
            <Field label="Preview text" hint="The teaser shown after the subject in inboxes.">
              <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Market dates, a new collection, and a treat" />
            </Field>
            <Field label="Message" required hint="Blank lines start new paragraphs.">
              <Textarea rows={6} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="Hi friends! Here's what's new this month…" />
            </Field>
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
