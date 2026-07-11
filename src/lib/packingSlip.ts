// Print-ready packing slip — opens the browser's print dialog with a clean,
// gift-friendly document (no prices; the customer's note is included since
// it often carries gift messages). Pure DOM strings, no react-to-print dep.

import type { Order, Product, Settings } from '@/data/types'

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The buyer-facing part of the notes — internal annotations stay internal */
function customerNote(notes?: string): string {
  if (!notes) return ''
  return notes
    .split(' — ')
    .filter((part) => !/^⚠|^Promo |^Imported from/.test(part.trim()))
    .join(' — ')
    .trim()
}

export function printPackingSlip(order: Order, products: Product[], settings: Settings): void {
  const skuFor = (productId: string, variantId?: string) => {
    const p = products.find((x) => x.id === productId)
    if (!p) return ''
    if (variantId) return p.variants.find((v) => v.id === variantId)?.sku ?? p.sku
    return p.sku
  }
  const note = customerNote(order.notes)
  const rows = order.items
    .map(
      (i) => `
      <tr>
        <td class="qty">${i.quantity}×</td>
        <td>${esc(i.name)}</td>
        <td class="sku">${esc(skuFor(i.productId, i.variantId))}</td>
      </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Packing slip ${esc(order.number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 40px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; }
  .shop { font-size: 20px; font-weight: 700; }
  .shop small { display: block; font-size: 12px; font-weight: 400; color: #555; margin-top: 2px; }
  .meta { text-align: right; font-size: 13px; color: #333; }
  .meta strong { font-size: 16px; color: #111; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; margin: 26px 0 6px; }
  .shipto { font-size: 15px; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 9px 8px 9px 0; border-bottom: 1px solid #ddd; vertical-align: top; }
  .qty { width: 44px; font-weight: 700; white-space: nowrap; }
  .sku { width: 130px; color: #666; font: 12px ui-monospace, Menlo, Consolas, monospace; text-align: right; }
  .note { margin-top: 8px; padding: 12px 14px; border: 1px solid #ccc; border-radius: 8px; font-size: 14px; }
  .foot { margin-top: 36px; padding-top: 14px; border-top: 1px solid #ddd; font-size: 12px; color: #777; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <div class="head">
    <div class="shop">${esc(settings.logoEmoji)} ${esc(settings.businessName)}<small>${esc(settings.tagline)}</small></div>
    <div class="meta"><strong>${esc(order.number)}</strong><br>${esc(
      new Date(order.placedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
    )}<br>${order.items.reduce((a, i) => a + i.quantity, 0)} item${order.items.reduce((a, i) => a + i.quantity, 0) === 1 ? '' : 's'}</div>
  </div>

  <h2>Ship to</h2>
  <div class="shipto">
    <strong>${esc(order.customerName)}</strong><br>
    ${esc(order.shippingAddress.line1)}<br>
    ${esc(order.shippingAddress.city)}, ${esc(order.shippingAddress.state)} ${esc(order.shippingAddress.zip)}
  </div>

  <h2>Inside this package</h2>
  <table>${rows}</table>

  ${note ? `<h2>Note</h2><div class="note">${esc(note)}</div>` : ''}

  <div class="foot">
    Packed with care by ${esc(settings.businessName)} · Questions? ${esc(settings.email)}
  </div>
  <script>window.onload = function () { window.print() }</script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
