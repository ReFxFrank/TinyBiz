// Settings → Store policies: the shipping, returns and privacy text shown at
// /policies. Blank fields fall back to defaults built from the business
// identity and live shipping config, so clearing a field is always safe.

import { useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { ExternalLink, Save } from 'lucide-react'
import { Button, Card, CardHeader, Field, Textarea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import { defaultPolicies, POLICY_FIELDS } from '@/lib/policyCopy'
import { emojify } from '@/lib/emoji'
import { DEFAULT_SHIPPING, type PolicyContent } from '@/data/types'

/** Textarea that grows with its content so long policies never scroll inside the field */
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

export function PoliciesCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  const shipping = useMemo(() => ({ ...DEFAULT_SHIPPING, ...settings.shipping }), [settings.shipping])
  const defaults = useMemo(
    () =>
      defaultPolicies({
        businessName: settings.businessName,
        email: settings.email,
        country: shipping.country,
        flatShipping: shipping.flatRate,
        freeShippingOver: shipping.freeOver,
      }),
    [settings.businessName, settings.email, shipping],
  )

  const [draft, setDraft] = useState<Partial<PolicyContent>>(settings.policies ?? {})
  // emojify as-you-type: ":sparkles:" becomes ✨ the moment the closing colon lands
  const set = (key: keyof PolicyContent, value: string) => setDraft((d) => ({ ...d, [key]: emojify(value) }))

  // Fields show the standard wording as real, editable text. Anything left
  // matching the standard (or emptied) isn't stored, so untouched fields keep
  // following the shipping config and business identity automatically.
  const shown = (key: keyof PolicyContent) => draft[key] ?? defaults[key]
  const saved = settings.policies ?? {}
  const dirty = POLICY_FIELDS.some(({ key }) => shown(key).trim() !== (saved[key] ?? defaults[key]).trim())

  const save = () => {
    const cleaned: Partial<PolicyContent> = {}
    for (const { key } of POLICY_FIELDS) {
      const v = shown(key).trim()
      if (v !== '' && v !== defaults[key].trim()) cleaned[key] = v
    }
    updateSettings({ policies: cleaned })
    setDraft(cleaned)
    toast('Store policies saved', { description: 'The policies page shows the new text immediately.', tone: 'success' })
  }

  return (
    <Card>
      <CardHeader
        title="Store policies"
        subtitle="The shipping, returns and privacy text on your shop's policies page — edit any field directly. Fields you haven't changed keep following your shipping settings automatically."
        actions={
          <div className="flex items-center gap-2">
            <a href="/policies" target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm" icon={<ExternalLink />}>
                View policies page
              </Button>
            </a>
            <Button size="sm" icon={<Save />} disabled={!dirty} onClick={save}>
              Save
            </Button>
          </div>
        }
      />
      <div className="space-y-4">
        {POLICY_FIELDS.map(({ key, label, hint }) => (
          <Field key={key} label={label} hint={hint}>
            <GrowingTextarea value={shown(key)} onChange={(e) => set(key, e.target.value)} rows={5} />
          </Field>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Fields you haven't touched weave in your rates and country from the Shipping & delivery card automatically, so
        they stay accurate as those change. To go back to that standard wording, just empty the field and save.
      </p>
    </Card>
  )
}
