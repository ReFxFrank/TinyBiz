// Settings → Social links: profile URLs shown as icons in the storefront
// footer. Every link is optional — blank fields simply hide that icon.

import { useState } from 'react'
import { Save } from 'lucide-react'
import { Button, Card, CardHeader, Field, Input } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { SocialLinks } from '@/data/types'

const SOCIAL_FIELDS: Array<{ key: keyof SocialLinks; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourshop' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourshop' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourshop' },
  { key: 'etsy', label: 'Etsy', placeholder: 'https://yourshop.etsy.com' },
]

export function SocialLinksCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const [draft, setDraft] = useState<SocialLinks>(settings.social ?? {})
  const set = (key: keyof SocialLinks, value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.social ?? {})

  const save = () => {
    // Keep only filled-in links; add the scheme if someone pastes a bare URL
    const cleaned: SocialLinks = {}
    for (const { key } of SOCIAL_FIELDS) {
      const v = draft[key]?.trim()
      if (v) cleaned[key] = v.startsWith('http') ? v : `https://${v}`
    }
    updateSettings({ social: cleaned })
    setDraft(cleaned)
    toast('Social links saved', { description: 'The storefront footer shows them immediately.', tone: 'success' })
  }

  return (
    <Card>
      <CardHeader
        title="Social links"
        subtitle="Where customers can find you elsewhere — these appear as icons in the storefront footer."
        actions={
          <Button size="sm" icon={<Save />} disabled={!dirty} onClick={save}>
            Save
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
          <Field key={key} label={label}>
            <Input
              type="url"
              value={draft[key] ?? ''}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
            />
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Paste the full profile URL — we'll add https:// if it's missing. Leave a field blank to hide that icon.
      </p>
    </Card>
  )
}
