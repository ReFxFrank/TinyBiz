import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCcw, Save } from 'lucide-react'
import type { CurrencyCode, Settings as SettingsType } from '@/data/types'
import { useStore } from '@/store/useStore'
import { useUI, toast, type Theme } from '@/store/useUI'
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
import { useLoaded } from '@/lib/utils'

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

// ── Appearance ───────────────────────────────────────────────────────────────

function AppearanceCard() {
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)

  return (
    <Card>
      <CardHeader title="Appearance" subtitle="Theme changes apply instantly — no save needed." />
      <div className="flex flex-wrap items-center gap-4">
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
        <p className="text-[13px] text-ink-3">System follows your device's light/dark preference automatically.</p>
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
          <AppearanceCard />
          <NotificationsCard />
          <IntegrationsCard />
          <ShortcutsCard />
          <DangerZoneCard />
          <p className="pb-2 text-center text-xs text-ink-3">TinyBiz v0.1 — made with 🐣</p>
        </motion.div>
      )}
    </div>
  )
}
