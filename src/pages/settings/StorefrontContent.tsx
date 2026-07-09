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
import { DEFAULT_SHIPPING, type StorefrontContent as Content } from '@/data/types'

export function StorefrontContentCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const defaults = useMemo(() => {
    const shipping = { ...DEFAULT_SHIPPING, ...settings.shipping }
    return defaultStorefrontCopy({
      businessName: settings.businessName,
      ownerName: settings.ownerName,
      city: settings.address.city,
      shippingRegion: shipping.region,
      freeShippingOver: shipping.freeOver,
    })
  }, [settings.businessName, settings.ownerName, settings.address.city, settings.shipping])

  const [draft, setDraft] = useState<Partial<Content>>(settings.storefront ?? {})
  // emojify as-you-type: ":sparkles:" becomes ✨ the moment the closing colon lands
  const set = (key: keyof Content, value: string) => setDraft((d) => ({ ...d, [key]: emojify(value) }))

  // Fields show the standard wording as real, editable text. Anything left
  // matching the standard (or emptied) isn't stored, so untouched fields keep
  // following the business identity automatically.
  const shown = (key: keyof Content) => draft[key] ?? defaults[key]
  const saved = settings.storefront ?? {}
  const dirty = STOREFRONT_FIELDS.some(({ key }) => shown(key).trim() !== (saved[key] ?? defaults[key]).trim())

  const save = () => {
    const cleaned: Partial<Content> = {}
    for (const { key } of STOREFRONT_FIELDS) {
      const v = shown(key).trim()
      if (v !== '' && v !== defaults[key].trim()) cleaned[key] = v
    }
    updateSettings({ storefront: cleaned })
    setDraft(cleaned)
    toast('Storefront content saved', { description: 'Customers see the new wording immediately.', tone: 'success' })
  }

  return (
    <Card>
      <CardHeader
        title="Storefront content"
        subtitle="The wording customers read on your shop's home page — edit any field directly. Fields you haven't changed keep following your business details automatically."
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
              <Textarea value={shown(key)} onChange={(e) => set(key, e.target.value)} rows={3} />
            ) : (
              <Input value={shown(key)} onChange={(e) => set(key, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Fields you haven't touched weave in your shop name, owner name and shipping details automatically. To go back to
        that standard wording, just empty the field and save.
      </p>
    </Card>
  )
}
