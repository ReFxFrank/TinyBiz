// Settings → Storefront banner: the announcement strip that shows right under
// the hero on the shop's home page — new drops, sales, holiday notes.

import { useState } from 'react'
import { ExternalLink, Save } from 'lucide-react'
import { Button, Card, CardHeader, Field, Input, Toggle } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import { emojify } from '@/lib/emoji'
import type { PromoBanner } from '@/data/types'

/** Every field normalized to a string so draft/saved comparisons stay stable */
interface BannerDraft {
  enabled: boolean
  heading: string
  body: string
  linkLabel: string
  linkUrl: string
}

const toDraft = (b?: PromoBanner): BannerDraft => ({
  enabled: b?.enabled ?? false,
  heading: b?.heading ?? '',
  body: b?.body ?? '',
  linkLabel: b?.linkLabel ?? '',
  linkUrl: b?.linkUrl ?? '',
})

export function PromoBannerCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const [draft, setDraft] = useState<BannerDraft>(() => toDraft(settings.promoBanner))
  // emojify as-you-type: ":dragon:" becomes 🐉 the moment the closing colon lands
  const set = (key: keyof Omit<BannerDraft, 'enabled'>, value: string) =>
    setDraft((d) => ({ ...d, [key]: key === 'heading' || key === 'body' ? emojify(value) : value }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings.promoBanner))

  const needsHeading = draft.enabled && draft.heading.trim() === ''

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
            <Button size="sm" icon={<Save />} disabled={!dirty || needsHeading} onClick={save}>
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
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Emoji shortcodes work in the headline and supporting line — type :sparkles: and it becomes ✨ as you type.
      </p>
    </Card>
  )
}
