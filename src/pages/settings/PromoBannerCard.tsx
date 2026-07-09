// Settings → Storefront banner: the announcement strip that shows right under
// the hero on the shop's home page — new drops, sales, holiday notes.

import { useRef, useState } from 'react'
import { ExternalLink, ImagePlus, Save, X } from 'lucide-react'
import { Button, Card, CardHeader, Field, Input, Toggle } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import { emojify } from '@/lib/emoji'
import { api, ApiError } from '@/lib/api'
import { prepareImageForUpload } from '@/lib/image'
import type { PromoBanner } from '@/data/types'

/** Every field normalized to a string so draft/saved comparisons stay stable */
interface BannerDraft {
  enabled: boolean
  heading: string
  body: string
  linkLabel: string
  linkUrl: string
  imageUrl: string
}

const toDraft = (b?: PromoBanner): BannerDraft => ({
  enabled: b?.enabled ?? false,
  heading: b?.heading ?? '',
  body: b?.body ?? '',
  linkLabel: b?.linkLabel ?? '',
  linkUrl: b?.linkUrl ?? '',
  imageUrl: b?.imageUrl ?? '',
})

export function PromoBannerCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const [draft, setDraft] = useState<BannerDraft>(() => toDraft(settings.promoBanner))
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // emojify as-you-type: ":dragon:" becomes 🐉 the moment the closing colon lands
  const set = (key: keyof Omit<BannerDraft, 'enabled'>, value: string) =>
    setDraft((d) => ({ ...d, [key]: key === 'heading' || key === 'body' ? emojify(value) : value }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings.promoBanner))

  const needsHeading = draft.enabled && draft.heading.trim() === ''

  const pickPhoto = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const blob = await prepareImageForUpload(file)
      const { url } = await api.upload(blob)
      setDraft((d) => ({ ...d, imageUrl: url }))
    } catch (err) {
      toast('Couldn’t upload that photo', {
        description: err instanceof ApiError ? err.message : 'Could not read that image.',
        tone: 'error',
      })
    } finally {
      setUploading(false)
    }
  }

  const save = () => {
    // Trim everything and keep only filled-in optionals
    const cleaned: PromoBanner = { enabled: draft.enabled, heading: draft.heading.trim() }
    const body = draft.body.trim()
    if (body) cleaned.body = body
    const linkLabel = draft.linkLabel.trim()
    if (linkLabel) cleaned.linkLabel = linkLabel
    const linkUrl = draft.linkUrl.trim()
    if (linkUrl) {
      // Site-relative paths like /shop stay as-is; bare domains get a scheme
      cleaned.linkUrl = linkUrl.startsWith('http') || linkUrl.startsWith('/') ? linkUrl : `https://${linkUrl}`
    }
    if (draft.imageUrl) cleaned.imageUrl = draft.imageUrl
    updateSettings({ promoBanner: cleaned })
    setDraft(toDraft(cleaned))
    toast('Storefront banner saved', {
      description: cleaned.enabled
        ? 'Customers see it under the hero immediately.'
        : 'The banner stays hidden until you turn it on.',
      tone: 'success',
    })
  }

  return (
    <Card>
      <CardHeader
        title="Storefront banner"
        subtitle="An announcement strip that appears right under the hero on your shop's home page — perfect for drops and sales."
        actions={
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" icon={<ExternalLink />}>
                View storefront
              </Button>
            </a>
            <Button size="sm" icon={<Save />} disabled={!dirty || needsHeading || uploading} onClick={save}>
              Save
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Toggle
            checked={draft.enabled}
            onChange={(enabled) => setDraft((d) => ({ ...d, enabled }))}
            label="Show the banner"
            description="Turn it off to hide the strip without losing the wording below."
          />
        </div>
        <Field
          label="Headline"
          required
          className="sm:col-span-2"
          error={needsHeading ? 'Add a headline before saving — the banner needs something to say.' : undefined}
        >
          <Input
            value={draft.heading}
            onChange={(e) => set('heading', e.target.value)}
            placeholder="New drop: Rose Heart Dragons 🐉"
          />
        </Field>
        <Field label="Supporting line" hint="Optional smaller line under the headline." className="sm:col-span-2">
          <Input
            value={draft.body}
            onChange={(e) => set('body', e.target.value)}
            placeholder="Fresh colorways landed this week — limited run!"
          />
        </Field>
        <Field label="Button label" hint="Fill in both label and link for the button to show.">
          <Input value={draft.linkLabel} onChange={(e) => set('linkLabel', e.target.value)} placeholder="Shop the drop" />
        </Field>
        <Field label="Button link" hint="A full URL, or a path on your site like /shop.">
          <Input value={draft.linkUrl} onChange={(e) => set('linkUrl', e.target.value)} placeholder="/shop" />
        </Field>
        <Field
          label="Photo"
          hint="Optional — shows beside the text, great for a shot of the new product."
          className="sm:col-span-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              void pickPhoto(e.target.files?.[0] ?? null)
              e.target.value = '' // allow re-picking the same file
            }}
          />
          <div className="flex items-center gap-3">
            {draft.imageUrl ? (
              <div className="relative">
                <img
                  src={draft.imageUrl}
                  alt="Banner photo"
                  className="h-16 w-16 rounded-xl border border-hairline object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setDraft((d) => ({ ...d, imageUrl: '' }))}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-white shadow-soft"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus />}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Uploading…' : draft.imageUrl ? 'Swap photo' : 'Add photo'}
            </Button>
          </div>
        </Field>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Emoji shortcodes work in the headline and supporting line — type :sparkles: and it becomes ✨ as you type.
      </p>
    </Card>
  )
}
