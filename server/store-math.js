// Server-authoritative checkout math — mirrors src/store/useCart.ts
// useCartDetails exactly (per-UNIT promo rounding so the stored order re-sums
// to the quoted total, free shipping threshold, 2dp tax). Keep in lockstep.

// Fallbacks when the owner hasn't configured Settings → Shipping & delivery
export const FREE_SHIPPING_OVER = 50
export const FLAT_SHIPPING = 4.99
export const DEFAULT_SHIPPING = { flatRate: FLAT_SHIPPING, freeOver: FREE_SHIPPING_OVER, country: 'Canada', region: 'Canada' }

/** The owner's shipping config merged over defaults */
export function shippingConfig(settings) {
  const c = settings?.shipping
  return {
    flatRate: Number.isFinite(Number(c?.flatRate)) ? Number(c.flatRate) : DEFAULT_SHIPPING.flatRate,
    freeOver: Number.isFinite(Number(c?.freeOver)) ? Number(c.freeOver) : DEFAULT_SHIPPING.freeOver,
    country: typeof c?.country === 'string' && c.country.trim() ? c.country.trim() : DEFAULT_SHIPPING.country,
    region: typeof c?.region === 'string' ? c.region.trim() : DEFAULT_SHIPPING.region,
  }
}

export const round2 = (n) => Math.round(n * 100) / 100

// ── Canadian sales tax ────────────────────────────────────────────────────────
// Combined GST/HST/PST by destination province (mirrored in src/lib/tax.ts —
// keep in lockstep). Applied to goods AND shipping, the common simplification
// small shops use. Rates as of 2025 (NS dropped to 14% HST in April 2025).
export const CA_TAX = {
  AB: 5, BC: 12, MB: 12, NB: 15, NL: 15, NS: 14, NT: 5, NU: 5, ON: 13, PE: 15, QC: 14.975, SK: 11, YT: 5,
}

const PROVINCE_NAMES = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', newfoundland: 'NL', 'nova scotia': 'NS',
  'northwest territories': 'NT', nunavut: 'NU', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', 'québec': 'QC', saskatchewan: 'SK', yukon: 'YT',
}

/** "BC", "bc", "British Columbia" → "BC"; anything unrecognized → null */
export function provinceCode(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/\./g, '')
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (CA_TAX[upper] != null) return upper
  return PROVINCE_NAMES[raw] || null
}

/**
 * The tax rate for an order: destination-based for Canadian shops when the
 * province is recognizable, otherwise the flat Settings rate.
 */
export function taxRateFor(settings, address) {
  const ship = shippingConfig(settings)
  if (/canada/i.test(ship.country)) {
    const code = provinceCode(address?.state)
    if (code) return CA_TAX[code]
  }
  return Number(settings?.taxRate) || 0
}

/**
 * Validate raw cart items against live products and price them.
 * items: [{productId, variantId?, qty}]
 * Throws {status, error, message} on unsellable carts.
 */
export function buildLines(items, products) {
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 400, error: 'empty_cart', message: 'Your cart is empty.' }
  }
  const lines = []
  for (const raw of items) {
    const qty = Math.floor(Number(raw?.qty))
    if (!Number.isFinite(qty) || qty < 1 || qty > 999) {
      throw { status: 400, error: 'bad_qty', message: 'Invalid quantity.' }
    }
    const product = products.find((p) => p.id === raw.productId && p.active)
    if (!product) {
      throw { status: 409, error: 'gone', message: 'An item in your cart is no longer available.' }
    }
    const variant = raw.variantId ? (product.variants || []).find((v) => v.id === raw.variantId) : undefined
    if (raw.variantId && !variant) {
      throw { status: 409, error: 'gone', message: `The option you chose for ${product.name} is no longer available.` }
    }
    const available = variant ? variant.stock : product.stock
    if (qty > available) {
      throw {
        status: 409,
        error: 'stock',
        message: `Only ${available} of ${variant ? `${product.name} — ${variant.name}` : product.name} ${available === 1 ? 'is' : 'are'} in stock.`,
      }
    }
    lines.push({
      product,
      variant,
      qty,
      name: variant ? `${product.name} — ${variant.name}` : product.name,
      unitPrice: variant ? variant.price : product.price,
      unitCost: variant ? variant.cost : product.cost,
    })
  }
  return lines
}

/** Is this promo currently usable? Mirrors the client's promoValid check. */
export function promoUsable(promo) {
  return Boolean(
    promo &&
      promo.active &&
      (!promo.expiresAt || new Date(promo.expiresAt).getTime() > Date.now()) &&
      (!promo.maxUses || promo.uses < promo.maxUses),
  )
}

/** Totals from validated lines + optional promo pct + tax rate + shipping config.
 *  Tax applies to goods AND shipping (GST/HST treats freight as taxable). */
export function computeTotals(lines, discountPct, taxRate, ship = DEFAULT_SHIPPING) {
  const pct = discountPct || 0
  const priced = lines.map((l) => ({ ...l, discountedUnitPrice: round2(l.unitPrice * (1 - pct / 100)) }))
  const subtotal = round2(priced.reduce((a, l) => a + l.unitPrice * l.qty, 0))
  const discountedSubtotal = round2(priced.reduce((a, l) => a + l.discountedUnitPrice * l.qty, 0))
  const discount = round2(subtotal - discountedSubtotal)
  const shipping = priced.length === 0 || discountedSubtotal >= ship.freeOver ? 0 : ship.flatRate
  const tax = round2(((discountedSubtotal + shipping) * (taxRate || 0)) / 100)
  const total = round2(discountedSubtotal + shipping + tax)
  return { lines: priced, subtotal, discountedSubtotal, discount, shipping, tax, total }
}

/**
 * Promo-aware totals — mirrors src/store/useCart.ts useCartDetails.
 * Percent promos live INSIDE per-unit prices (discountedUnitPrice); fixed
 * promos are an order-level line (fixedOff) so receipts stay honest; free
 * shipping just zeroes the shipping line. Tax applies to what's actually
 * charged: (goods − fixed discount) + shipping.
 */
export function computePromoTotals(lines, promo, taxRate, ship = DEFAULT_SHIPPING) {
  const type = promo ? promo.type || 'percent' : null
  const pct = type === 'percent' ? Number(promo.discountPct) || 0 : 0
  const priced = lines.map((l) => ({ ...l, discountedUnitPrice: round2(l.unitPrice * (1 - pct / 100)) }))
  const subtotal = round2(priced.reduce((a, l) => a + l.unitPrice * l.qty, 0))
  const discountedSubtotal = round2(priced.reduce((a, l) => a + l.discountedUnitPrice * l.qty, 0))
  const fixedOff = type === 'fixed' ? Math.min(discountedSubtotal, round2(Number(promo.amountOff) || 0)) : 0
  const goods = round2(discountedSubtotal - fixedOff)
  const freeShip = type === 'freeship'
  const shipping = priced.length === 0 || freeShip || goods >= ship.freeOver ? 0 : ship.flatRate
  const tax = round2(((goods + shipping) * (taxRate || 0)) / 100)
  const total = round2(goods + shipping + tax)
  const discount = round2(subtotal - discountedSubtotal + fixedOff)
  return { lines: priced, subtotal, discountedSubtotal, fixedOff, discount, shipping, tax, total, freeShip }
}

/** Next order number ("TMS-1001") — mirrors src/lib/metrics.ts. Etsy imports
 *  keep their own ETSY-<receipt> numbers (9+ digits) and must never advance
 *  this sequence; old NP-* demo numbers still count toward the max. */
export function nextOrderNumber(orders) {
  const max = orders.reduce((m, o) => {
    const num = String(o.number || '')
    if (num.startsWith('ETSY-')) return m
    const n = Number(num.replace(/\D/g, ''))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 1000)
  return `TMS-${max + 1}`
}
