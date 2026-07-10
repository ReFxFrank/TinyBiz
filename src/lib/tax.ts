// Canadian province recognition for checkout's live tax estimate — mirrors
// server/store-math.js provinceCode (keep in lockstep). The server recomputes
// authoritatively at order time; this only drives what the shopper sees.

const PROVINCE_NAMES: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  newfoundland: 'NL',
  'nova scotia': 'NS',
  'northwest territories': 'NT',
  nunavut: 'NU',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  'québec': 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
}

const CODES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'])

/** "bc", "B.C.", "British Columbia" → "BC"; anything unrecognized → null */
export function provinceCode(input: string | undefined): string | null {
  const raw = String(input || '').trim().toLowerCase().replace(/\./g, '')
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (CODES.has(upper)) return upper
  return PROVINCE_NAMES[raw] ?? null
}

/** The rate to show: province-based when the shop ships within Canada and the
 *  province is recognizable, else the shop's flat rate. */
export function effectiveTaxRate(
  caTaxTable: Record<string, number> | null | undefined,
  flatRate: number,
  provinceInput?: string,
): number {
  if (caTaxTable) {
    const code = provinceCode(provinceInput)
    if (code && caTaxTable[code] != null) return caTaxTable[code]
  }
  return flatRate
}
