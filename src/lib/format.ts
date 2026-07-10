import type { CurrencyCode, DisplayCurrencyCode } from '@/data/types'

let activeCurrency: CurrencyCode = 'USD'

/** Called once by the store subscription so formatters follow the settings */
export function setActiveCurrency(c: CurrencyCode): void {
  activeCurrency = c
}

export function getActiveCurrency(): CurrencyCode {
  return activeCurrency
}

// Storefront display currency: when a visitor picks e.g. USD, every money()
// call without an explicit currency converts at the day's rate. The admin
// never sets this, and passing a currency explicitly always shows raw,
// unconverted amounts (used for "you'll be charged …" lines).
let displayCurrency: DisplayCurrencyCode | null = null
let displayRate = 1

export function setDisplayCurrency(c: DisplayCurrencyCode | null, rate = 1): void {
  displayCurrency = c
  displayRate = rate > 0 ? rate : 1
}

/** The currency prices are currently converted into, if any */
export function getDisplayCurrency(): DisplayCurrencyCode | null {
  return displayCurrency
}

function resolve(n: number, currency?: CurrencyCode): { n: number; currency: string } {
  if (currency) return { n, currency }
  if (displayCurrency) return { n: n * displayRate, currency: displayCurrency }
  return { n, currency: activeCurrency }
}

/** Currencies with no minor unit — forcing cents would show ¥1,644.00 */
const ZERO_DECIMAL = new Set(['JPY'])

/** $1,284.50 — full-precision money */
export function money(amount: number, cur?: CurrencyCode): string {
  const { n, currency } = resolve(amount, cur)
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n)
}

/** $1,284 — whole-dollar money for stats and axis ticks */
export function money0(amount: number, cur?: CurrencyCode): string {
  const { n, currency } = resolve(amount, cur)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

/** $12.9K / $4.2M — compact money for tiles and axes */
export function moneyCompact(amount: number, cur?: CurrencyCode): string {
  if (Math.abs(amount) < 10000) return money0(amount, cur)
  const { n, currency } = resolve(amount, cur)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

export function num(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function numCompact(n: number): string {
  if (Math.abs(n) < 10000) return num(n)
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

/** Signed delta like "+12.4%" */
export function signedPct(n: number, digits = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`
}

// ── Dates ────────────────────────────────────────────────────────────────────

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

/** "2h ago", "3d ago" */
export function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = secs / 60
  if (mins < 60) return `${Math.floor(mins)}m ago`
  const hours = mins / 60
  if (hours < 24) return `${Math.floor(hours)}h ago`
  const days = hours / 24
  if (days < 30) return `${Math.floor(days)}d ago`
  return fmtDate(iso)
}

/** "in 2d" / "3d overdue" for due dates — compares calendar days, not 24h spans */
export function dueIn(iso: string): { label: string; overdue: boolean } {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(new Date(iso)) - startOf(new Date())) / 86_400_000)
  if (days < 0) return { label: `${-days}d overdue`, overdue: true }
  if (days === 0) return { label: 'today', overdue: false }
  if (days === 1) return { label: 'tomorrow', overdue: false }
  return { label: `in ${days}d`, overdue: false }
}

export function minutesToHours(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export function grams(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}kg` : `${Math.round(n)}g`
}
