// Settings → Storefront content: every piece of wording on the shop's home
// page, editable. Blank fields fall back to defaults built from the business
// identity, so clearing a field is always safe.

import { useMemo, useState } from 'react'
import { ExternalLink, Save } from 'lucide-react'
import { Button, Card, CardHeader, Field, Input, Textarea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import { defaultStorefrontCopy, STOREFRONT_FIELDS } from '@/lib/storefrontCopy'
import { emojify } from '@/lib/emoji'
import type { StorefrontContent as Content } from '@/data/types'

export function StorefrontContentCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const defaults = useMemo(
    () =>
      defaultStorefrontCopy({
        businessName: settings.businessName,
        ownerName: settings.ownerName,
        city: settings.address.city,
      }),
    [settings.businessName, settings.ownerName, settings.address.city],
  )

  const [draft, setDraft] = useState<Partial<Content>>(settings.storefront ?? {})
  // emojify as-you-type: ":sparkles:" becomes ✨ the moment the closing colon lands
  const set = (key: keyof Content, value: string) => setDraft((d) => ({ ...d, [key]: emojify(value) }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.storefront ?? {})

  const save = () => {
    // Persist only real overrides — blanks mean "use the standard wording"
    const cleaned: Partial<Content> = {}
    for (const { key } of STOREFRONT_FIELDS) {
      const v = draft[key]
      if (typeof v === 'string' && v.trim() !== '') cleaned[key] = v.trim()
    }
    updateSettings({ storefront: cleaned })
    setDraft(cleaned)
    toast('Storefront content saved', { description: 'Customers see the new wording immediately.', tone: 'success' })
  }

  return (
    <Card>
      <CardHeader
        title="Storefront content"
        subtitle="The wording customers read on your shop's home page. Leave a field blank to use the standard wording shown in the placeholder."
        actions={
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" icon={<ExternalLink />}>
                View storefront
              </Button>
            </a>
            <Button size="sm" icon={<Save />} disabled={!dirty} onClick={save}>
              Save
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {STOREFRONT_FIELDS.map(({ key, label, hint, multiline }) => (
          <Field key={key} label={label} hint={hint} className={multiline ? 'sm:col-span-2' : undefined}>
            {multiline ? (
              <Textarea
                value={draft[key] ?? ''}
                onChange={(e) => set(key, e.target.value)}
                placeholder={defaults[key]}
                rows={3}
              />
            ) : (
              <Input value={draft[key] ?? ''} onChange={(e) => set(key, e.target.value)} placeholder={defaults[key]} />
            )}
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Your shop name, tagline, and owner name come from the Business card above — the standard wording weaves them in
        automatically.
      </p>
    </Card>
  )
}
