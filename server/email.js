// Transactional order-confirmation email, sent through the mail
// bridge (mail-bridge/) when one is configured in Settings → Newsletter.
// Fire-and-forget: a down bridge must never break checkout.

import { getCollection, getMeta } from './db.js'
import { promoUsable } from './store-math.js'

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

// Public tracking pages per carrier — mirrors src/pages/store/StoreTrack.tsx
const CARRIER_URLS = {
  'Canada Post': (tn) =>
    `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(tn)}`,
  USPS: (tn) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tn)}`,
  UPS: (tn) => `https://www.ups.com/track?tracknum=${encodeURIComponent(tn)}`,
  FedEx: (tn) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tn)}`,
  DHL: (tn) => `https://www.dhl.com/ca-en/home/tracking.html?tracking-id=${encodeURIComponent(tn)}`,
}

function trackingUrl(order) {
  const tn = String(order.trackingNumber || '').trim()
  if (!tn) return null
  const build = CARRIER_URLS[order.carrier]
  return build ? build(tn) : null
}

/** "Your order is on its way" — sent when the owner ships / adds tracking */
export function buildOrderShippedHtml(order, settings) {
  const shopName = settings?.businessName || 'Our shop'
  const tn = String(order.trackingNumber || '').trim()
  const url = trackingUrl(order)
  const items = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;color:#111;font-size:14px;">${esc(i.name)}<span style="color:#999;"> × ${i.quantity}</span></td>
      </tr>`,
    )
    .join('')
  const a = order.shippingAddress
  const trackingBlock = tn
    ? `
        <tr><td style="padding:6px 32px 0;">
          <div style="background:#fafaf9;border:1px solid #eee;border-radius:12px;padding:14px 16px;">
            <div style="color:#777;font-size:12px;">${esc(order.carrier || 'Carrier')} tracking number</div>
            <div style="color:#111;font-size:16px;font-weight:700;font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:2px;">${esc(tn)}</div>
            ${url ? `<a href="${esc(url)}" style="display:inline-block;margin-top:12px;background:#5f6f2d;color:#fff;text-decoration:none;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:700;">Track your package</a>` : ''}
          </div>
        </td></tr>`
    : ''

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order ${esc(order.number)} shipped</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:30px 32px 0;">
          <div style="font-size:32px;line-height:1;">${esc(settings?.logoEmoji || '🛍️')}</div>
          <div style="color:#111;font-size:19px;font-weight:700;margin-top:8px;">${esc(shopName)}</div>
        </td></tr>
        <tr><td style="padding:22px 32px 0;">
          <div style="display:inline-block;background:#eef2df;color:#5f6f2d;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;">📦 On its way</div>
          <h1 style="margin:14px 0 6px;color:#111;font-size:22px;">Your order shipped, ${esc(order.customerName.split(' ')[0])}!</h1>
          <p style="margin:0 0 4px;color:#555;font-size:15px;line-height:1.6;">
            Order <strong style="color:#111;">${esc(order.number)}</strong> just left the studio${order.carrier ? ` with ${esc(order.carrier)}` : ''}.
          </p>
        </td></tr>
        ${trackingBlock}
        <tr><td style="padding:16px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table>
        </td></tr>
        <tr><td style="padding:8px 32px 26px;">
          <div style="color:#777;font-size:13px;line-height:1.6;">
            Heading to ${esc(a.line1)}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.zip)}.
          </div>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#fafaf9;border-top:1px solid #eee;color:#999;font-size:12px;line-height:1.6;">
          Questions? Just reply to this email${settings?.email ? ` or write to ${esc(settings.email)}` : ''}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function buildOrderShippedText(order, settings) {
  const tn = String(order.trackingNumber || '').trim()
  const url = trackingUrl(order)
  return [
    `${settings?.businessName || 'Our shop'} — order ${order.number} is on its way!`,
    '',
    ...order.items.map((i) => `${i.name} × ${i.quantity}`),
    ...(tn ? ['', `${order.carrier || 'Carrier'} tracking: ${tn}`, ...(url ? [url] : [])] : []),
  ].join('\n')
}

/**
 * Send through the shared bridge plumbing. Never throws. Retries once, and a
 * final failure leaves a notification in the admin bell — a silently-down
 * bridge otherwise means customers just stop hearing from the shop.
 */
export async function sendViaBridge(kind, { to, toName, subject, html, text, ref }) {
  const ns = getMeta('newsletterSettings')
  const settings = getMeta('settings')
  const base = String(ns?.mailBridgeUrl || '').trim().replace(/\/$/, '')
  if (!base || !to) return // no bridge configured — skip silently

  const attempt = async () => {
    const res = await fetch(`${base}/send-one`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        token: ns?.mailBridgeToken || 'demo',
        to,
        toName,
        subject,
        html,
        text,
        from: { name: ns?.fromName || settings?.businessName || 'Shop', email: ns?.fromEmail || settings?.email || '' },
        replyTo: ns?.replyTo || undefined,
      }),
    })
    if (!res.ok) throw new Error(`bridge responded ${res.status}`)
  }

  try {
    try {
      await attempt()
    } catch {
      await new Promise((r) => setTimeout(r, 2000))
      await attempt()
    }
    console.log(`[tinymagic-api] ${kind} email${ref ? ` for ${ref}` : ''} → ${to}`)
  } catch (err) {
    console.warn(`[tinymagic-api] ${kind} email${ref ? ` for ${ref}` : ''} FAILED: ${err.message}`)
    try {
      const { uid, upsertItem, bumpRev } = await import('./db.js')
      upsertItem('notifications', {
        id: uid('ntf'),
        type: 'message',
        title: `Email failed: ${kind}${ref ? ` for ${ref}` : ''}`,
        body: `${to} — ${err.message}. Check Settings → Newsletter → Email delivery.`,
        createdAt: new Date().toISOString(),
        read: false,
        link: '/admin/newsletter?tab=settings',
      })
      bumpRev()
    } catch {
      /* the notification is best-effort too */
    }
  }
}

/** "Your order was cancelled/returned" — closure plus the refund expectation */
export function buildOrderCancelledHtml(order, settings) {
  const shopName = settings?.businessName || 'Our shop'
  const returned = order.status === 'Returned'
  const paid = order.payment?.provider === 'stripe'
  const items = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;color:#111;font-size:14px;">${esc(i.name)}<span style="color:#999;"> × ${i.quantity}</span></td>
      </tr>`,
    )
    .join('')
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order ${esc(order.number)} ${returned ? 'returned' : 'cancelled'}</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:30px 32px 0;">
          <div style="font-size:32px;line-height:1;">${esc(settings?.logoEmoji || '🛍️')}</div>
          <div style="color:#111;font-size:19px;font-weight:700;margin-top:8px;">${esc(shopName)}</div>
        </td></tr>
        <tr><td style="padding:22px 32px 0;">
          <div style="display:inline-block;background:#fbe9e9;color:#a32f2f;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;">Order ${returned ? 'returned' : 'cancelled'}</div>
          <h1 style="margin:14px 0 6px;color:#111;font-size:22px;">Hi ${esc(order.customerName.split(' ')[0])},</h1>
          <p style="margin:0 0 4px;color:#555;font-size:15px;line-height:1.6;">
            Your order <strong style="color:#111;">${esc(order.number)}</strong> has been ${returned ? 'marked as returned' : 'cancelled'}.
            ${paid ? 'Your refund goes back to your original payment method — most banks show it within 5–10 business days.' : ''}
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#fafaf9;border-top:1px solid #eee;color:#999;font-size:12px;line-height:1.6;">
          Didn't expect this, or have a question? Just reply to this email${settings?.email ? ` or write to ${esc(settings.email)}` : ''} and a real human will sort it out.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function buildOrderCancelledText(order, settings) {
  const paid = order.payment?.provider === 'stripe'
  return [
    `${settings?.businessName || 'Our shop'} — order ${order.number} ${order.status === 'Returned' ? 'returned' : 'cancelled'}`,
    '',
    ...order.items.map((i) => `${i.name} × ${i.quantity}`),
    ...(paid ? ['', 'Your refund goes back to your original payment method within 5–10 business days.'] : []),
  ].join('\n')
}

/** Fired when an order transitions to Shipped (or gains a tracking number). */
export async function sendOrderShipped(order) {
  if (!order?.email || !Array.isArray(order.items)) return
  const settings = getMeta('settings')
  await sendViaBridge('shipped', {
    to: order.email,
    toName: order.customerName,
    subject: `Your order ${order.number} is on its way! — ${settings?.businessName || ''}`.trim().replace(/ —$/, ''),
    html: buildOrderShippedHtml(order, settings),
    text: buildOrderShippedText(order, settings),
    ref: order.number,
  })
}

/** Fired when an order transitions to Cancelled/Returned. */
export async function sendOrderCancelled(order) {
  if (!order?.email || !Array.isArray(order.items)) return
  const settings = getMeta('settings')
  await sendViaBridge('cancellation', {
    to: order.email,
    toName: order.customerName,
    subject: `Your order ${order.number} was ${order.status === 'Returned' ? 'returned' : 'cancelled'} — ${settings?.businessName || ''}`.trim().replace(/ —$/, ''),
    html: buildOrderCancelledHtml(order, settings),
    text: buildOrderCancelledText(order, settings),
    ref: order.number,
  })
}

/**
 * Send the confirmation through the mail bridge, if one is configured.
 * Never throws — checkout already succeeded by the time this runs.
 */
export async function sendOrderConfirmation(order) {
  if (!order?.email || !Array.isArray(order.items)) return
  const settings = getMeta('settings')
  await sendViaBridge('confirmation', {
    to: order.email,
    toName: order.customerName,
    subject: `Order ${order.number} confirmed — ${settings?.businessName || 'thank you!'}`,
    html: buildOrderConfirmationHtml(order, settings),
    text: buildOrderConfirmationText(order, settings),
    ref: order.number,
  })
}

// ── Shared shell for the lighter lifecycle emails ────────────────────────────

/** Branded card wrapper: pass body rows (already <tr>-wrapped) + footer text */
function shellHtml(settings, { title, badge, badgeColors, bodyRows, footer }) {
  const shopName = settings?.businessName || 'Our shop'
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding:30px 32px 0;">
          <div style="font-size:32px;line-height:1;">${esc(settings?.logoEmoji || '🛍️')}</div>
          <div style="color:#111;font-size:19px;font-weight:700;margin-top:8px;">${esc(shopName)}</div>
        </td></tr>
        ${badge ? `<tr><td style="padding:22px 32px 0;"><div style="display:inline-block;background:${badgeColors?.bg || '#eef2df'};color:${badgeColors?.fg || '#5f6f2d'};border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;">${badge}</div></td></tr>` : ''}
        ${bodyRows}
        <tr><td style="padding:18px 32px;background:#fafaf9;border-top:1px solid #eee;color:#999;font-size:12px;line-height:1.6;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

const ctaButton = (label, url) =>
  `<a href="${esc(url)}" style="display:inline-block;background:#5f6f2d;color:#fff;text-decoration:none;border-radius:10px;padding:12px 22px;font-size:15px;font-weight:700;">${esc(label)}</a>`

// ── Password reset ───────────────────────────────────────────────────────────

/** One link, one hour, one use. Same email for shoppers and studio staff. */
export async function sendPasswordReset({ to, toName, resetUrl }) {
  const settings = getMeta('settings')
  const html = shellHtml(settings, {
    title: 'Reset your password',
    badge: '🔑 Password reset',
    bodyRows: `
        <tr><td style="padding:16px 32px 6px;">
          <h1 style="margin:0 0 6px;color:#111;font-size:22px;">Hi${toName ? ` ${esc(String(toName).split(' ')[0])}` : ''},</h1>
          <p style="margin:0;color:#555;font-size:15px;line-height:1.6;">
            Someone (hopefully you) asked to reset the password for this email address.
            The link below works once and expires in an hour.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 26px;">${ctaButton('Choose a new password', resetUrl)}</td></tr>`,
    footer: `If you didn't ask for this, you can safely ignore it — your password stays as it is.`,
  })
  await sendViaBridge('password-reset', {
    to,
    toName,
    subject: `Reset your password — ${settings?.businessName || 'your account'}`,
    html,
    text: `Someone asked to reset the password for this email address.\n\nChoose a new password (link works once, expires in an hour):\n${resetUrl}\n\nIf you didn't ask for this, ignore this email.`,
  })
}

// ── Welcome email (newsletter signup) ────────────────────────────────────────

const DEFAULT_WELCOME_MESSAGE =
  "Thanks for joining the list! We're a tiny studio making small-batch 3D-printed magic, and you'll be the first to hear about new pieces, restocks and studio news."

/** Owner config lives in newsletterSettings.welcome {enabled, promoCode, message} */
export async function sendWelcomeEmail({ to, origin }) {
  const ns = getMeta('newsletterSettings')
  const welcome = ns?.welcome
  if (!welcome || welcome.enabled === false) return
  const settings = getMeta('settings')
  const message = String(welcome.message || '').trim() || DEFAULT_WELCOME_MESSAGE

  // The promo block only ships while the code is actually redeemable
  let promo = null
  if (welcome.promoCode) {
    const found = getCollection('promoCodes').find(
      (p) => p.code.toLowerCase() === String(welcome.promoCode).trim().toLowerCase(),
    )
    if (promoUsable(found)) promo = found
  }

  const promoRow = promo
    ? `
        <tr><td style="padding:6px 32px 0;">
          <div style="background:#fafaf9;border:1px dashed #b3c375;border-radius:12px;padding:16px;text-align:center;">
            <div style="color:#777;font-size:12px;">A little welcome gift — ${promo.discountPct}% off your order</div>
            <div style="color:#111;font-size:22px;font-weight:800;letter-spacing:2px;font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:4px;">${esc(promo.code)}</div>
            <div style="color:#999;font-size:12px;margin-top:4px;">Paste it in at checkout</div>
          </div>
        </td></tr>`
    : ''

  const html = shellHtml(settings, {
    title: `Welcome to ${settings?.businessName || 'the shop'}`,
    badge: '✨ Welcome',
    bodyRows: `
        <tr><td style="padding:16px 32px 6px;">
          <h1 style="margin:0 0 6px;color:#111;font-size:22px;">Welcome!</h1>
          <p style="margin:0;color:#555;font-size:15px;line-height:1.6;">${esc(message)}</p>
        </td></tr>
        ${promoRow}
        <tr><td style="padding:18px 32px 26px;">${ctaButton('Browse the shop', `${origin}/shop`)}</td></tr>`,
    footer: `You're getting this one-time hello because this address just joined the ${esc(settings?.businessName || 'shop')} list.`,
  })

  await sendViaBridge('welcome', {
    to,
    subject: `Welcome to ${settings?.businessName || 'the shop'}! ${promo ? `Here's ${promo.discountPct}% off ✨` : '✨'}`,
    html,
    text: [
      message,
      ...(promo ? ['', `Welcome gift: ${promo.code} for ${promo.discountPct}% off — paste it in at checkout.`] : []),
      '',
      `Browse the shop: ${origin}/shop`,
    ].join('\n'),
  })
}

// ── Back in stock ────────────────────────────────────────────────────────────

export async function sendBackInStock({ to, product, url }) {
  const settings = getMeta('settings')
  const html = shellHtml(settings, {
    title: `${product.name} is back in stock`,
    badge: '🎉 Back in stock',
    bodyRows: `
        <tr><td style="padding:16px 32px 6px;">
          <h1 style="margin:0 0 6px;color:#111;font-size:22px;">${esc(product.name)} is back!</h1>
          <p style="margin:0;color:#555;font-size:15px;line-height:1.6;">
            You asked us to let you know — it's back on the shelf at <strong style="color:#111;">${money(product.price)}</strong>.
            Small batches sell out fast, so don't wait too long.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px 26px;">${ctaButton('Grab yours', url)}</td></tr>`,
    footer: `You're getting this because you asked to be notified when this item returned. That's the only email this signup sends.`,
  })
  await sendViaBridge('back-in-stock', {
    to,
    subject: `It's back: ${product.name} — ${settings?.businessName || ''}`.trim().replace(/ —$/, ''),
    html,
    text: `${product.name} is back in stock at ${money(product.price)}.\n\nGrab yours: ${url}`,
    ref: product.name,
  })
}

// ── Abandoned checkout reminder ──────────────────────────────────────────────

/** One gentle nudge, ~2h after a Stripe checkout was started but never paid */
export async function sendCartReminder({ payload, origin }) {
  const settings = getMeta('settings')
  const { contact, totals } = payload
  const items = totals.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;color:#111;font-size:14px;">${esc(l.name)}<span style="color:#999;"> × ${l.qty}</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#111;font-size:14px;white-space:nowrap;">${money(l.discountedUnitPrice * l.qty)}</td>
      </tr>`,
    )
    .join('')
  const html = shellHtml(settings, {
    title: 'Your cart is waiting',
    badge: '🛒 Still in your cart',
    bodyRows: `
        <tr><td style="padding:16px 32px 6px;">
          <h1 style="margin:0 0 6px;color:#111;font-size:22px;">Hi ${esc(contact.name.split(' ')[0])},</h1>
          <p style="margin:0;color:#555;font-size:15px;line-height:1.6;">
            Looks like checkout got interrupted — no worries, we kept your cart. Here's what's in it:
          </p>
        </td></tr>
        <tr><td style="padding:14px 32px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table>
        </td></tr>
        <tr><td style="padding:16px 32px 26px;">${ctaButton('Finish checking out', `${origin}/checkout`)}</td></tr>`,
    footer: `This is the only reminder we'll send. If you've changed your mind, no action needed — the cart just quietly expires.`,
  })
  await sendViaBridge('cart-reminder', {
    to: contact.email,
    toName: contact.name,
    subject: `You left something behind at ${settings?.businessName || 'the shop'} 🛒`,
    html,
    text: [
      `Looks like checkout got interrupted — we kept your cart:`,
      '',
      ...totals.lines.map((l) => `${l.name} × ${l.qty} — ${money(l.discountedUnitPrice * l.qty)}`),
      '',
      `Finish checking out: ${origin}/checkout`,
      '',
      `This is the only reminder we'll send.`,
    ].join('\n'),
  })
}

/** Heads-up to the owner when a website order lands (Settings toggle) */
export async function sendNewOrderAlert(order) {
  const settings = getMeta('settings')
  if (settings?.notifyNewOrders === false) return
  const to = String(settings?.email || '').trim()
  if (!to || to.toLowerCase() === String(order.email || '').toLowerCase()) return
  const total = order.items.reduce((a, i) => a + i.unitPrice * i.quantity, 0) + order.shippingCharged + order.taxCollected
  const paid = order.payment?.provider === 'stripe' ? 'PAID via Stripe' : 'no payment collected (preview mode)'
  const lines = order.items.map((i) => `• ${i.name} × ${i.quantity}`).join('<br>')
  await sendViaBridge('new-order alert', {
    to,
    toName: settings?.ownerName || '',
    subject: `🛒 New order ${order.number} — ${money(total)} (${order.customerName})`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#111;line-height:1.7;">
      <p><strong>${esc(order.customerName)}</strong> (${esc(order.email)}) just ordered:</p>
      <p>${lines}</p>
      <p>Total <strong>${money(total)}</strong> — ${paid}.</p>
      <p>Ships to ${esc(order.shippingAddress.line1)}, ${esc(order.shippingAddress.city)}, ${esc(order.shippingAddress.state)} ${esc(order.shippingAddress.zip)}</p>
    </div>`,
    text: `${order.customerName} (${order.email}) ordered ${order.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')} — total ${money(total)} (${paid}).`,
    ref: order.number,
  })
}
