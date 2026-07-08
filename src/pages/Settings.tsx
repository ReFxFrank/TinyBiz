import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Pipette, RotateCcw, Save } from 'lucide-react'
import { DEFAULT_SHIPPING, type CurrencyCode, type Settings as SettingsType } from '@/data/types'
import { useStore } from '@/store/useStore'
import { useUI, toast, ACCENTS, ACCENT_META, type Accent, type Radius, type Theme, type UIScale } from '@/store/useUI'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Kbd,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Toggle,
} from '@/components/ui'
import { cn, useLoaded } from '@/lib/utils'
import { bestTextOn, contrastRatio, isValidHex, normalizeHex, type AccentTokens } from '@/lib/color'
import { AccountCard, TeamAccess } from '@/pages/settings/TeamAccess'
import { StorefrontContentCard } from '@/pages/settings/StorefrontContent'

// ── Business profile ─────────────────────────────────────────────────────────

interface ProfileDraft {
  businessName: string
  ownerName: string
  email: string
  phone: string
  tagline: string
  logoEmoji: string
  line1: string
  city: string
  state: string
  zip: string
}

function draftFromSettings(s: SettingsType): ProfileDraft {
  return {
    businessName: s.businessName,
    ownerName: s.ownerName,
    email: s.email,
    phone: s.phone,
    tagline: s.tagline,
    logoEmoji: s.logoEmoji,
    line1: s.address.line1,
    city: s.address.city,
    state: s.address.state,
    zip: s.address.zip,
  }
}

function BusinessProfileCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromSettings(settings))

  const dirty = useMemo(() => {
    const saved = draftFromSettings(settings)
    return (Object.keys(saved) as Array<keyof ProfileDraft>).some((k) => saved[k] !== draft[k])
  }, [settings, draft])
  const valid = draft.businessName.trim().length > 0 && draft.email.trim().length > 0

  const set = (k: keyof ProfileDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }))

  const save = () => {
    updateSettings({
      businessName: draft.businessName.trim(),
      ownerName: draft.ownerName.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      tagline: draft.tagline.trim(),
      logoEmoji: draft.logoEmoji.trim() || '🐣',
      address: {
        ...settings.address,
        line1: draft.line1.trim(),
        city: draft.city.trim(),
        state: draft.state.trim(),
        zip: draft.zip.trim(),
      },
    })
    toast('Business profile saved', { tone: 'success' })
  }

  return (
    <Card>
      <CardHeader
        title="Business profile"
        subtitle="How your shop appears on invoices, packing slips and emails."
        actions={
          <Button size="sm" icon={<Save />} disabled={!dirty || !valid} onClick={save}>
            Save changes
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Business name" required>
          <Input value={draft.businessName} onChange={set('businessName')} placeholder="Nova Prints & Co." />
        </Field>
        <Field label="Owner name">
          <Input value={draft.ownerName} onChange={set('ownerName')} placeholder="Your name" />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={draft.email} onChange={set('email')} placeholder="hello@example.com" />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={draft.phone} onChange={set('phone')} placeholder="(555) 555-0100" />
        </Field>
        <Field label="Tagline" className="sm:col-span-2">
          <Input value={draft.tagline} onChange={set('tagline')} placeholder="A short line about what you make" />
        </Field>
        <Field label="Logo emoji" hint="One emoji used as your shop mark across the app.">
          <div className="flex items-center gap-3">
            <Input
              value={draft.logoEmoji}
              onChange={set('logoEmoji')}
              maxLength={2}
              className="w-20 text-center text-lg"
              aria-label="Logo emoji"
            />
            <span
              aria-hidden
              className="inline-flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl bg-accent-wash text-xl shadow-soft"
            >
              {draft.logoEmoji || '🐣'}
            </span>
            <span className="text-xs text-ink-3">Live preview</span>
          </div>
        </Field>
        <Field label="Street address">
          <Input value={draft.line1} onChange={set('line1')} placeholder="742 Alder St, Studio 3" />
        </Field>
        <Field label="City">
          <Input value={draft.city} onChange={set('city')} placeholder="Portland" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="State">
            <Input value={draft.state} onChange={set('state')} placeholder="OR" />
          </Field>
          <Field label="ZIP">
            <Input value={draft.zip} onChange={set('zip')} placeholder="97205" />
          </Field>
        </div>
      </div>
    </Card>
  )
}

// ── Preferences ──────────────────────────────────────────────────────────────

const CURRENCIES: Array<{ value: CurrencyCode; label: string }> = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
]

function PreferencesCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency)
  const [taxRate, setTaxRate] = useState<string>(String(settings.taxRate))

  const parsedTax = Number(taxRate)
  const taxValid = taxRate.trim() !== '' && Number.isFinite(parsedTax) && parsedTax >= 0 && parsedTax <= 100
  const dirty = currency !== settings.currency || (taxValid && parsedTax !== settings.taxRate)

  const save = () => {
    updateSettings({ currency, taxRate: parsedTax })
    toast('Preferences saved', { tone: 'success' })
  }

  return (
    <Card>
      <CardHeader
        title="Preferences"
        subtitle="Currency and sales tax used across the whole app."
        actions={
          <Button size="sm" icon={<Save />} disabled={!dirty || !taxValid} onClick={save}>
            Save
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Currency" hint="Applies everywhere immediately">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} options={CURRENCIES} />
        </Field>
        <Field
          label="Sales tax rate"
          hint="Default rate applied to new orders."
          error={taxValid ? undefined : 'Enter a rate between 0 and 100'}
        >
          <div className="relative">
            <Input
              type="number"
              step={0.01}
              min={0}
              max={100}
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="pr-8 tnum"
              aria-label="Sales tax rate percent"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">%</span>
          </div>
        </Field>
      </div>
    </Card>
  )
}

// ── Shipping & delivery ──────────────────────────────────────────────────────

function ShippingCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const saved = { ...DEFAULT_SHIPPING, ...settings.shipping }
  const [flatRate, setFlatRate] = useState(String(saved.flatRate))
  const [freeOver, setFreeOver] = useState(String(saved.freeOver))
  const [country, setCountry] = useState(saved.country)
  const [region, setRegion] = useState(saved.region)

  const parsedFlat = Number(flatRate)
  const parsedFree = Number(freeOver)
  const flatValid = flatRate.trim() !== '' && Number.isFinite(parsedFlat) && parsedFlat >= 0
  const freeValid = freeOver.trim() !== '' && Number.isFinite(parsedFree) && parsedFree >= 0
  const dirty =
    parsedFlat !== saved.flatRate ||
    parsedFree !== saved.freeOver ||
    country.trim() !== saved.country ||
    region.trim() !== saved.region

  const save = () => {
    updateSettings({
      shipping: {
        flatRate: Math.round(parsedFlat * 100) / 100,
        freeOver: Math.round(parsedFree * 100) / 100,
        country: country.trim() || DEFAULT_SHIPPING.country,
        region: region.trim(),
      },
    })
    toast('Shipping settings saved', { tone: 'success' })
  }

  return (
    <Card>
      <CardHeader
        title="Shipping & delivery"
        subtitle="What the storefront charges for shipping and where you deliver."
        actions={
          <Button size="sm" icon={<Save />} disabled={!dirty || !flatValid || !freeValid} onClick={save}>
            Save
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Flat shipping rate"
          hint="Charged on storefront orders below the free-shipping threshold."
          error={flatValid ? undefined : 'Enter an amount of 0 or more'}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$</span>
            <Input
              type="number"
              step={0.01}
              min={0}
              value={flatRate}
              onChange={(e) => setFlatRate(e.target.value)}
              className="pl-7 tnum"
              aria-label="Flat shipping rate"
            />
          </div>
        </Field>
        <Field
          label="Free shipping over"
          hint="Orders at or above this (after discounts) ship free. Set to 0 for free shipping on everything."
          error={freeValid ? undefined : 'Enter an amount of 0 or more'}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">$</span>
            <Input
              type="number"
              step={1}
              min={0}
              value={freeOver}
              onChange={(e) => setFreeOver(e.target.value)}
              className="pl-7 tnum"
              aria-label="Free shipping threshold"
            />
          </div>
        </Field>
        <Field label="Ship-to country" hint="Shown at checkout — the storefront ships to this country only.">
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={DEFAULT_SHIPPING.country} />
        </Field>
        <Field
          label="Region wording"
          hint='Finishes the storefront banner "Free shipping across …". Leave blank for plain "Free shipping".'
        >
          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={DEFAULT_SHIPPING.region} />
        </Field>
      </div>
    </Card>
  )
}

// ── Appearance ───────────────────────────────────────────────────────────────

function AppearanceRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-hairline py-4 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Preset swatches + a fully custom brand color with generated, contrast-checked shades */
function AccentSection() {
  const accent = useUI((s) => s.accent)
  const setAccent = useUI((s) => s.setAccent)
  const customAccent = useUI((s) => s.customAccent)
  const setCustomAccent = useUI((s) => s.setCustomAccent)

  const [hexDraft, setHexDraft] = useState(() => customAccent?.base ?? '#ff5ba6')

  const pickCustom = (hex: string) => {
    setHexDraft(hex)
    if (isValidHex(hex)) setCustomAccent(normalizeHex(hex))
  }

  const customActive = accent === 'custom'
  const whiteContrast = customAccent ? contrastRatio(customAccent.light.accent, '#ffffff') : 0

  return (
    <div className="border-b border-hairline py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">Accent color</div>
          <div className="mt-0.5 text-[13px] text-ink-3">
            Colors buttons, links, and highlights. Charts keep their colorblind-safe palette.
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => {
            const active = a === accent
            return (
              <button
                key={a}
                role="radio"
                aria-checked={active}
                aria-label={ACCENT_META[a].label}
                title={ACCENT_META[a].label}
                onClick={() => setAccent(a)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110',
                  active && 'ring-2 ring-offset-2 ring-offset-surface',
                )}
                style={{ background: ACCENT_META[a].swatch, ...(active ? { ['--tw-ring-color' as never]: ACCENT_META[a].swatch } : {}) }}
              >
                {active && <Check className="h-4 w-4 text-white" aria-hidden />}
              </button>
            )
          })}
          <button
            role="radio"
            aria-checked={customActive}
            aria-label="Custom color"
            title="Custom color"
            onClick={() => pickCustom(hexDraft)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110',
              customActive && 'ring-2 ring-offset-2 ring-offset-surface',
            )}
            style={{
              background: customActive && customAccent
                ? customAccent.base
                : 'conic-gradient(#e34948, #eda100, #1baf7a, #2a78d6, #7c6ce0, #e87ba4, #e34948)',
              ...(customActive && customAccent ? { ['--tw-ring-color' as never]: customAccent.base } : {}),
            }}
          >
            {customActive && customAccent ? (
              <Check className="h-4 w-4" style={{ color: bestTextOn(customAccent.base) }} aria-hidden />
            ) : (
              <Pipette className="h-3.5 w-3.5 text-white drop-shadow" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {customActive && customAccent && (
        <div className="mt-4 space-y-3 rounded-xl bg-sunken/60 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              value={customAccent.base}
              onChange={(e) => pickCustom(e.target.value)}
              aria-label="Pick a custom brand color"
              className="h-9 w-14 cursor-pointer rounded-lg border border-edge bg-surface p-1"
            />
            <div className="w-28 shrink-0">
              <Input
                value={hexDraft}
                onChange={(e) => pickCustom(e.target.value)}
                aria-label="Custom color hex value"
                className={cn('font-mono', hexDraft && !isValidHex(hexDraft) && 'border-critical focus:ring-critical/60')}
                placeholder="#ff5ba6"
                maxLength={7}
              />
            </div>
            <Badge tone={whiteContrast >= 4.5 ? 'green' : 'yellow'}>
              Button text {whiteContrast.toFixed(1)}:1 {whiteContrast >= 4.5 ? '✓ AA' : ''}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AccentPreviewStrip label="Light mode" tokens={customAccent.light} surface="#fcfcfb" />
            <AccentPreviewStrip label="Dark mode" tokens={customAccent.dark} surface="#1a1a19" />
          </div>

          <p className="text-xs leading-relaxed text-ink-3">
            Shade steps and button-text contrast are generated automatically for both modes.
            {customAccent.adjusted && (
              <> Your pick was nudged {`darker`} in light mode so text on buttons stays readable.</>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

function AccentPreviewStrip({ label, tokens, surface }: { label: string; tokens: AccentTokens; surface: string }) {
  const chips: Array<[string, string]> = [
    ['Accent', tokens.accent],
    ['Strong', tokens['accent-strong']],
    ['Soft', tokens['accent-soft']],
    ['Wash', tokens['accent-wash']],
    ['Pop', tokens.pop],
  ]
  return (
    <div className="rounded-lg border border-edge p-2.5" style={{ background: surface }}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#898781' }}>
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        {chips.map(([name, color]) => (
          <span key={name} title={`${name}: ${color}`} className="h-7 flex-1 rounded-md" style={{ background: color }} />
        ))}
      </div>
    </div>
  )
}

function AppearanceCard() {
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const accent = useUI((s) => s.accent)
  const setAccent = useUI((s) => s.setAccent)
  const radius = useUI((s) => s.radius)
  const setRadius = useUI((s) => s.setRadius)
  const scale = useUI((s) => s.scale)
  const setScale = useUI((s) => s.setScale)
  const reduceMotion = useUI((s) => s.reduceMotion)
  const setReduceMotion = useUI((s) => s.setReduceMotion)

  return (
    <Card>
      <CardHeader
        title="Appearance"
        subtitle="Make TinyBiz yours — every change applies instantly and only affects this browser."
      />
      <div>
        <AppearanceRow label="Theme" hint="System follows your device's light/dark preference automatically.">
          <Segmented<Theme>
            size="md"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </AppearanceRow>

        <AccentSection />

        <AppearanceRow label="Corner style" hint="From crisp and technical to soft and friendly.">
          <Segmented<Radius>
            size="md"
            value={radius}
            onChange={setRadius}
            options={[
              { value: 'sharp', label: 'Sharp' },
              { value: 'soft', label: 'Soft' },
              { value: 'round', label: 'Round' },
            ]}
          />
        </AppearanceRow>

        <AppearanceRow label="Interface scale" hint="Resizes text and spacing across the whole app.">
          <Segmented<UIScale>
            size="md"
            value={scale}
            onChange={setScale}
            options={[
              { value: 'compact', label: 'Compact' },
              { value: 'cozy', label: 'Cozy' },
              { value: 'large', label: 'Large' },
            ]}
          />
        </AppearanceRow>

        <AppearanceRow label="Reduce motion" hint="Minimizes page transitions and micro-animations.">
          <Toggle checked={reduceMotion} onChange={setReduceMotion} label="Reduce motion" className="[&>span:first-child]:sr-only" />
        </AppearanceRow>
      </div>
    </Card>
  )
}

// ── Notifications ────────────────────────────────────────────────────────────

const NOTIFICATION_PREFS: Array<{
  key: 'notifyLowStock' | 'notifyNewOrders' | 'notifyExpensesDue' | 'weeklyReports'
  label: string
  description: string
}> = [
  {
    key: 'notifyLowStock',
    label: 'Low stock alerts',
    description: 'Get notified when a product or material drops below its reorder point.',
  },
  {
    key: 'notifyNewOrders',
    label: 'New orders',
    description: 'A heads-up whenever a new order lands in the shop.',
  },
  {
    key: 'notifyExpensesDue',
    label: 'Expenses due',
    description: 'Reminders before recurring expenses hit your account.',
  },
  {
    key: 'weeklyReports',
    label: 'Weekly reports',
    description: 'A tidy Monday-morning summary of sales, profit and stock.',
  },
]

function NotificationsCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)

  return (
    <Card>
      <CardHeader title="Notifications" subtitle="Choose what TinyBiz pings you about. Changes apply immediately." />
      <div className="divide-y divide-hairline">
        {NOTIFICATION_PREFS.map((pref) => (
          <Toggle
            key={pref.key}
            className="py-3 first:pt-0 last:pb-0"
            label={pref.label}
            description={pref.description}
            checked={settings[pref.key]}
            onChange={(checked) => updateSettings({ [pref.key]: checked })}
          />
        ))}
      </div>
    </Card>
  )
}

// ── Printer sync ─────────────────────────────────────────────────────────────

function PrinterSyncCard() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [url, setUrl] = useState(settings.printerBridgeUrl ?? '')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const dirty = url.trim() !== (settings.printerBridgeUrl ?? '')

  const save = () => {
    updateSettings({ printerBridgeUrl: url.trim().replace(/\/$/, '') })
    toast('Printer bridge saved', { tone: 'success' })
  }

  const test = async () => {
    const base = url.trim().replace(/\/$/, '')
    if (!base) return
    setChecking(true)
    setResult(null)
    try {
      const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(6000) })
      const data = await res.json()
      const n = Array.isArray(data.printers) ? data.printers.length : 0
      setResult({ ok: true, msg: `Connected — ${n} printer${n === 1 ? '' : 's'} reporting.` })
    } catch {
      setResult({ ok: false, msg: 'Could not reach the bridge. Check the URL and that it is running.' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Printer sync"
        subtitle="Auto-update machine status from a Bambu printer bridge running on your network."
        actions={
          <Button size="sm" icon={<Save />} disabled={!dirty} onClick={save}>
            Save
          </Button>
        }
      />
      <div className="space-y-3">
        <Field
          label="Bridge URL"
          hint="Where the TinyBiz printer bridge is running — e.g. http://192.168.1.50:7070. Leave blank to keep status manual."
        >
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setResult(null)
              }}
              placeholder="http://192.168.1.50:7070"
              className="font-mono"
            />
            <Button variant="outline" onClick={test} disabled={!url.trim() || checking}>
              {checking ? 'Testing…' : 'Test'}
            </Button>
          </div>
        </Field>
        {result && (
          <div className={cn('flex items-center gap-2 text-[13px]', result.ok ? 'text-good' : 'text-critical')}>
            {result.ok ? <Check className="h-4 w-4" /> : <span aria-hidden>⚠️</span>}
            {result.msg}
          </div>
        )}
        <div className="rounded-xl bg-sunken/60 p-3.5 text-[13px] leading-relaxed text-ink-2">
          <p className="font-medium text-ink">How it works</p>
          <p className="mt-1 text-ink-3">
            The bridge is a small program you run on any always-on computer on the same network as your printers (setup
            in <span className="font-mono text-ink-2">bridge/README.md</span>). Once it's running and saved here, open{' '}
            <span className="font-medium text-ink-2">Manufacturing → Sync live status</span> and give each machine the
            matching printer serial as its Live sync ID.
          </p>
        </div>
      </div>
    </Card>
  )
}

// ── Integrations ─────────────────────────────────────────────────────────────

const INTEGRATIONS: Array<{ emoji: string; name: string; blurb: string }> = [
  { emoji: '🧡', name: 'Etsy', blurb: 'Sync orders & listings automatically' },
  { emoji: '🛍️', name: 'Shopify', blurb: 'Pull storefront sales into TinyBiz' },
  { emoji: '📦', name: 'Amazon', blurb: 'Track marketplace orders & fees' },
  { emoji: '🏷️', name: 'eBay', blurb: 'Import auction and fixed-price sales' },
  { emoji: '◼️', name: 'Square', blurb: 'Sync in-person and market-day sales' },
  { emoji: '💙', name: 'PayPal', blurb: 'Match payouts to orders automatically' },
  { emoji: '💳', name: 'Stripe', blurb: 'Reconcile online payments & fees' },
  { emoji: '📗', name: 'QuickBooks', blurb: 'Push your books to your accountant' },
  { emoji: '🎮', name: 'Discord', blurb: 'Order alerts in your community server' },
  { emoji: '✉️', name: 'Gmail', blurb: 'Send invoices & updates from your inbox' },
]

function IntegrationsCard() {
  return (
    <Card>
      <CardHeader title="Integrations" subtitle="Connect your storefronts and tools — coming soon" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((it) => (
          <div key={it.name} className="flex flex-col gap-3 rounded-2xl border border-edge bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <span
                aria-hidden
                className="inline-flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl bg-sunken text-xl"
              >
                {it.emoji}
              </span>
              <Badge tone="neutral">Coming soon</Badge>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">{it.name}</div>
              <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{it.blurb}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-auto self-start opacity-60"
              onClick={() => toast(`${it.name} integration is on the roadmap 🚧`)}
            >
              Connect
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['⌘', 'K'], label: 'Search & command palette' },
  { keys: ['g', 'd'], label: 'Go to Dashboard' },
  { keys: ['g', 'o'], label: 'Go to Orders' },
  { keys: ['g', 'p'], label: 'Go to Products' },
  { keys: ['g', 'i'], label: 'Go to Inventory' },
  { keys: ['g', 'a'], label: 'Go to Analytics' },
  { keys: ['g', 'c'], label: 'Go to Customers' },
  { keys: ['g', 't'], label: 'Go to Tasks' },
  { keys: ['g', 'e'], label: 'Go to Expenses' },
  { keys: ['g', 'm'], label: 'Go to Manufacturing' },
  { keys: ['g', 's'], label: 'Go to Settings' },
]

function ShortcutsCard() {
  return (
    <Card>
      <CardHeader title="Keyboard shortcuts" subtitle="Move around the app without touching the mouse." />
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between gap-4 border-b border-hairline py-2.5 text-sm last:border-0"
          >
            <span className="text-ink-2">{s.label}</span>
            <span className="flex items-center gap-1">
              {s.keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[11px] text-ink-3">then</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Danger zone ──────────────────────────────────────────────────────────────

function DangerZoneCard() {
  const resetDemo = useStore((s) => s.resetDemo)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <Card className="border-critical/30">
      <CardHeader title="Danger zone" subtitle="Irreversible actions live here. Tread lightly." />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">Reset demo data</div>
          <p className="mt-0.5 text-[13px] text-ink-3">
            Wipes every change you've made and restores the original Nova Prints & Co. sample dataset.
          </p>
        </div>
        <Button variant="danger" icon={<RotateCcw />} onClick={() => setConfirmOpen(true)}>
          Reset demo data
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          resetDemo()
          toast('Demo data reset', { tone: 'success', description: 'Everything is back to the sample dataset.' })
        }}
        danger
        title="Reset demo data?"
        description="All orders, products, expenses and settings you've changed will be replaced with the original sample dataset. This cannot be undone."
        confirmLabel="Reset everything"
      />
    </Card>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function SkeletonSettingsCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-1.5 h-3 w-64" />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: rows * 2 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-9 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Settings() {
  const loaded = useLoaded()

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" description="Your shop's profile, preferences and connections — all in one place." />
      {!loaded ? (
        <div className="space-y-6">
          <SkeletonSettingsCard rows={4} />
          <SkeletonSettingsCard rows={1} />
          <SkeletonSettingsCard rows={2} />
        </div>
      ) : (
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <BusinessProfileCard />
          <PreferencesCard />
          <ShippingCard />
          <AppearanceCard />
          <NotificationsCard />
          <StorefrontContentCard />
          <AccountCard />
          <TeamAccess />
          <PrinterSyncCard />
          <IntegrationsCard />
          <ShortcutsCard />
          <DangerZoneCard />
          <p className="pb-2 text-center text-xs text-ink-3">TinyBiz v0.1 — made with 🐣</p>
        </motion.div>
      )}
    </div>
  )
}
