// Transactional order-confirmation email, sent through the TinyBiz mail
// bridge (mail-bridge/) when one is configured in Settings → Newsletter.
// Fire-and-forget: a down bridge must never break checkout.

import { getMeta } from './db.js'

const money = (n) => `$${Number(n).toFixed(2)}`

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Inline-styled, table-based HTML that renders in email clients */
export function buildOrderConfirmationHtml(order, settings) {
  const shopName = settings?.businessName || 'Our shop'
  const itemsSubtotal = order.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0)
  const total = itemsSubtotal + order.shippingCharged + order.taxCollected
  const rows = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;color:#111;font-size:14px;">${esc(i.name)}<span style="color:#999;"> × ${i.quantity}</span></td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;color:#111;font-size:14px;white-space:nowrap;">${money(i.unitPrice * i.quantity)}</td>
      </tr>`,
    )
    .join('')
  const totalRow = (label, value, bold = false) => `
      <tr>
        <td style="padding:5px 0;color:${bold ? '#111' : '#777'};font-size:${bold ? 15 : 13}px;${bold ? 'font-weight:700;' : ''}">${label}</td>
        <td style="padding:5px 0;text-align:right;color:${bold ? '#111' : '#777'};font-size:${bold ? 15 : 13}px;${bold ? 'font-weight:700;' : ''}white-space:nowrap;">${value}</td>
      </tr>`
  const a = order.shippingAddress
  const shipBy = order.shipBy
    ? new Date(order.shipBy).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : null

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order ${esc(order.number)} confirmed</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:30px 32px 0;">
          <div style="font-size:32px;line-height:1;">${esc(settings?.logoEmoji || '🛍️')}</div>
          <div style="color:#111;font-size:19px;font-weight:700;margin-top:8px;">${esc(shopName)}</div>
        </td></tr>
        <tr><td style="padding:22px 32px 0;">
          <div style="display:inline-block;background:#e7f6e7;color:#1c7a1c;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;">✓ Order confirmed</div>
          <h1 style="margin:14px 0 6px;color:#111;font-size:22px;">Thanks, ${esc(order.customerName.split(' ')[0])}!</h1>
          <p style="margin:0 0 4px;color:#555;font-size:15px;line-height:1.6;">
            Your order <strong style="color:#111;">${esc(order.number)}</strong> is in.
            ${shipBy ? `We're making it now — it ships by <strong style="color:#111;">${esc(shipBy)}</strong>.` : "We're making it now."}
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px;">
            ${totalRow('Subtotal', money(itemsSubtotal))}
            ${totalRow('Shipping', order.shippingCharged === 0 ? 'Free' : money(order.shippingCharged))}
            ${totalRow('Tax', money(order.taxCollected))}
            ${totalRow('Total', money(total), true)}
          </table>
        </td></tr>
        <tr><td style="padding:10px 32px 26px;">
          <div style="background:#fafaf9;border:1px solid #eee;border-radius:12px;padding:14px 16px;color:#555;font-size:13px;line-height:1.6;">
            <strong style="color:#111;">Shipping to</strong><br>
            ${esc(order.customerName)}<br>
            ${esc(a.line1)}<br>
            ${esc(a.city)}, ${esc(a.state)} ${esc(a.zip)}
          </div>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#fafaf9;border-top:1px solid #eee;color:#999;font-size:12px;line-height:1.6;">
          Questions about your order? Just reply to this email${settings?.email ? ` or write to ${esc(settings.email)}` : ''}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function buildOrderConfirmationText(order, settings) {
  const itemsSubtotal = order.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0)
  const total = itemsSubtotal + order.shippingCharged + order.taxCollected
  const lines = [
    `${settings?.businessName || 'Our shop'} — order ${order.number} confirmed`,
    '',
    ...order.items.map((i) => `${i.name} × ${i.quantity} — ${money(i.unitPrice * i.quantity)}`),
    '',
    `Subtotal: ${money(itemsSubtotal)}`,
    `Shipping: ${order.shippingCharged === 0 ? 'Free' : money(order.shippingCharged)}`,
    `Tax: ${money(order.taxCollected)}`,
    `Total: ${money(total)}`,
  ]
  return lines.join('\n')
}

/**
 * Send the confirmation through the mail bridge, if one is configured.
 * Never throws — checkout already succeeded by the time this runs.
 */
export async function sendOrderConfirmation(order) {
  try {
    const ns = getMeta('newsletterSettings')
    const settings = getMeta('settings')
    const base = String(ns?.mailBridgeUrl || '').trim().replace(/\/$/, '')
    if (!base) return // no bridge configured — skip silently

    const res = await fetch(`${base}/send-one`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        token: ns?.mailBridgeToken || 'demo',
        to: order.email,
        toName: order.customerName,
        subject: `Order ${order.number} confirmed — ${settings?.businessName || 'thank you!'}`,
        html: buildOrderConfirmationHtml(order, settings),
        text: buildOrderConfirmationText(order, settings),
        from: { name: ns?.fromName || settings?.businessName || 'Shop', email: ns?.fromEmail || settings?.email || '' },
        replyTo: ns?.replyTo || undefined,
      }),
    })
    if (!res.ok) throw new Error(`bridge responded ${res.status}`)
    console.log(`[tinybiz-api] confirmation email for ${order.number} → ${order.email}`)
  } catch (err) {
    console.warn(`[tinybiz-api] confirmation email for ${order.number} skipped: ${err.message}`)
  }
}
