// Daily exchange rates for the storefront's currency selector. Fetched from
// Frankfurter (ECB reference rates, no API key), cached in the meta table for
// 12h and refreshed in the background so the catalog route never blocks.
// Before the first successful fetch (or with no network) we serve rough
// baked-in cross rates, marked source: 'approx'.

import { getMeta, setMeta } from './db.js'

// The ten most-used currencies worldwide — all published by the ECB
export const CURRENCIES = ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD']

const TTL_MS = 12 * 60 * 60 * 1000
const META_KEY = 'currencyRates'

// Rough USD cross rates — only used until a live fetch succeeds
const USD_APPROX = { USD: 1, EUR: 0.86, JPY: 148, GBP: 0.74, CNY: 7.2, AUD: 1.51, CAD: 1.37, CHF: 0.8, HKD: 7.8, SGD: 1.28 }

function approxRates(base) {
  const out = {}
  for (const c of CURRENCIES) out[c] = USD_APPROX[c] / USD_APPROX[base]
  return out
}

let refreshing = false

async function refresh(base) {
  if (refreshing) return
  refreshing = true
  try {
    const symbols = CURRENCIES.filter((c) => c !== base).join(',')
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${symbols}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) throw new Error(`rates http ${res.status}`)
    const data = await res.json()
    const rates = {}
    for (const c of CURRENCIES) rates[c] = c === base ? 1 : Number(data?.rates?.[c])
    if (CURRENCIES.some((c) => !Number.isFinite(rates[c]) || rates[c] <= 0)) throw new Error('bad rates payload')
    setMeta(META_KEY, { base, rates, at: Date.now(), asOf: data.date || null, source: 'live' })
  } catch {
    // Keep serving the cache (or approx) — a missed refresh is harmless
  } finally {
    refreshing = false
  }
}

/** Rates for the shop's currency, refreshing in the background when stale */
export function currencyRates(base) {
  if (!CURRENCIES.includes(base)) return null
  const cached = getMeta(META_KEY)
  const usable = cached && cached.base === base
  const fresh = usable && Date.now() - cached.at < TTL_MS
  if (!fresh) void refresh(base)
  if (usable) return { rates: cached.rates, source: cached.source, asOf: cached.asOf }
  return { rates: approxRates(base), source: 'approx', asOf: null }
}
