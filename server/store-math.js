// Server-authoritative checkout math — mirrors src/store/useCart.ts
// useCartDetails exactly (per-UNIT promo rounding so the stored order re-sums
// to the quoted total, free shipping threshold, 2dp tax). Keep in lockstep.

export const FREE_SHIPPING_OVER = 50
export const FLAT_SHIPPING = 4.99

export const round2 = (n) => Math.round(n * 100) / 100

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

/** Totals from validated lines + optional promo pct + tax rate */
export function computeTotals(lines, discountPct, taxRate) {
  const pct = discountPct || 0
  const priced = lines.map((l) => ({ ...l, discountedUnitPrice: round2(l.unitPrice * (1 - pct / 100)) }))
  const subtotal = round2(priced.reduce((a, l) => a + l.unitPrice * l.qty, 0))
  const discountedSubtotal = round2(priced.reduce((a, l) => a + l.discountedUnitPrice * l.qty, 0))
  const discount = round2(subtotal - discountedSubtotal)
  const shipping = priced.length === 0 || discountedSubtotal >= FREE_SHIPPING_OVER ? 0 : FLAT_SHIPPING
  const tax = round2((discountedSubtotal * (taxRate || 0)) / 100)
  const total = round2(discountedSubtotal + shipping + tax)
  return { lines: priced, subtotal, discountedSubtotal, discount, shipping, tax, total }
}

/** Next order number — mirrors src/lib/metrics.ts nextOrderNumber */
export function nextOrderNumber(orders) {
  const max = orders.reduce((m, o) => {
    const n = Number(String(o.number || '').replace(/\D/g, ''))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 1000)
  return `NP-${max + 1}`
}
