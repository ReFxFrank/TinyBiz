// Builds the actual newsletter email — a single inline-styled, table-based HTML
// document that renders in email clients, plus a plain-text fallback. The same
// output feeds the in-app preview AND the mail bridge, so what you see is sent.

import type { Newsletter, NewsletterBlock, NewsletterSettings, Product, PromoCode, Subscriber } from '@/data/types'
import { money } from '@/lib/format'
import { uid } from '@/lib/utils'
import type { SellerStat } from '@/lib/metrics'

export interface NewsletterContext {
  products: Product[]
  bestSellers: SellerStat[]
  promoCodes: PromoCode[]
  /** Business accent color (hex) so the email matches the brand */
  accent: string
  logoEmoji: string
  businessName: string
  /** First name used to render {{first_name}} in previews; sends fall back to "there" */
  sampleFirstName?: string
  /** Site origin for absolutizing /uploads photo URLs (emails need full URLs) */
  origin?: string
}

/** Replace personalization merge tags — {{first_name}}, {{name}}, {{shop}} */
export function applyMergeTags(text: string, vars: { first_name: string; shop: string }): string {
  return text.replace(/\{\{\s*(first[_ ]?name|name|shop)\s*\}\}/gi, (_, key: string) => {
    const k = key.toLowerCase().replace(/\s/g, '_')
    if (k === 'shop') return vars.shop
    return vars.first_name
  })
}

/** The merge tags a user can insert, for the composer helper */
export const MERGE_TAGS: Array<{ tag: string; label: string }> = [
  { tag: '{{first_name}}', label: "Subscriber's first name" },
  { tag: '{{shop}}', label: 'Your shop name' },
]

/** Escape a string for safe insertion into HTML */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Split intro copy into paragraphs on blank lines */
function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function productRow(p: Product, accent: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top;width:52px;">
        <div style="width:44px;height:44px;border-radius:12px;background:hsl(${p.imageHue},70%,92%);text-align:center;font-size:24px;line-height:44px;">${esc(p.image)}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;">
        <div style="font-weight:600;color:#111;font-size:15px;">${esc(p.name)}</div>
        <div style="color:#777;font-size:13px;margin-top:2px;">${esc(p.category)}</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;vertical-align:top;text-align:right;white-space:nowrap;">
        <span style="font-weight:700;color:${accent};font-size:15px;">${money(p.price)}</span>
      </td>
    </tr>`
}

export interface BuildOptions {
  /**
   * Build a SEND template: leave {{first_name}}/{{shop}} tags intact for the
   * mail bridge to personalize per recipient, and point the unsubscribe link at
   * the {{unsubscribe}} tag the bridge rewrites. Preview builds resolve tags.
   */
  forSend?: boolean
}

/** The effective body blocks: rich blocks when present, else legacy intro+CTA */
export function effectiveBlocks(n: Newsletter): NewsletterBlock[] {
  if (n.blocks && n.blocks.length > 0) return n.blocks
  const legacy: NewsletterBlock[] = [{ id: uid('blk'), type: 'text', text: n.intro }]
  if (n.ctaLabel?.trim()) legacy.push({ id: uid('blk'), type: 'button', text: n.ctaLabel, url: n.ctaUrl })
  return legacy
}

/** A reasonable centered button block, shared by blocks and the legacy CTA */
function buttonHtml(label: string, href: string, accent: string, align: string): string {
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td align="${align}">
        <a href="${esc(href)}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 30px;border-radius:12px;">${esc(label)}</a>
      </td></tr></table>`
}

/** Render the ordered content blocks into email-safe HTML */
function renderBlocks(
  blocks: NewsletterBlock[],
  accent: string,
  merged: (t: string) => string,
  abs: (u: string) => string,
): string {
  return blocks
    .map((b) => {
      if (b.type === 'text') {
        return paragraphs(merged(b.text || ''))
          .map((p) => `<p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.6;">${esc(p)}</p>`)
          .join('')
      }
      if (b.type === 'image' && b.url) {
        const align = b.align || 'center'
        const width = Math.min(100, Math.max(40, b.widthPct || 100))
        const img = `<img src="${esc(abs(b.url))}" alt="${esc(b.text || '')}" style="display:inline-block;width:${width}%;max-width:100%;border-radius:12px;" />`
        const linked = b.linkUrl?.trim() ? `<a href="${esc(b.linkUrl.trim())}">${img}</a>` : img
        const caption = b.text?.trim()
          ? `<div style="color:#777;font-size:13px;margin-top:6px;">${esc(merged(b.text))}</div>`
          : ''
        return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;"><tr><td align="${align}">
        ${linked}${caption}
      </td></tr></table>`
      }
      if (b.type === 'button' && b.text?.trim()) {
        return buttonHtml(b.text, (b.url || '#').trim(), accent, b.align || 'center')
      }
      if (b.type === 'divider') {
        return `<div style="border-top:1px solid #e8e8e3;margin:20px 0;"></div>`
      }
      return ''
    })
    .join('')
}

/** The full HTML email for a newsletter */
export function buildNewsletterHtml(n: Newsletter, s: NewsletterSettings, ctx: NewsletterContext, opts: BuildOptions = {}): string {
  // Per-campaign look overrides fall back to the brand defaults
  const accent = n.style?.accent || ctx.accent
  const background = n.style?.background || '#f4f4f2'
  const radius = Math.min(24, Math.max(0, n.style?.radius ?? 20))
  const lightHeader = n.style?.header === 'light'
  const vars = { first_name: ctx.sampleFirstName || 'there', shop: ctx.businessName }
  // For send, keep tags for the bridge; for preview, resolve them now.
  const merged = (t: string) => (opts.forSend ? t : applyMergeTags(t, vars))
  const unsubHref = opts.forSend ? '{{unsubscribe}}' : '#unsubscribe'
  // Emails need absolute URLs — /uploads photos get the site origin prefixed
  const abs = (u: string) => (u.startsWith('/') && ctx.origin ? ctx.origin + u : u)
  const bodyHtml = renderBlocks(effectiveBlocks(n), accent, merged, abs)

  // Best sellers module
  let bestSellersBlock = ''
  if (n.includeBestSellers && ctx.bestSellers.length) {
    const rows = ctx.bestSellers
      .slice(0, 3)
      .map((sel) => ctx.products.find((p) => p.id === sel.productId))
      .filter((p): p is Product => Boolean(p))
      .map((p, i) => productRow(p, accent).replace('>' + esc(p.image) + '<', `>${i === 0 ? '👑' : esc(p.image)}<`))
      .join('')
    if (rows) {
      bestSellersBlock = `
        <h2 style="margin:28px 0 8px;color:#111;font-size:18px;">This month's favorites 🌟</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`
    }
  }

  // New products module
  let newProductsBlock = ''
  if (n.includeNewProducts) {
    const recent = [...ctx.products]
      .filter((p) => p.active)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 3)
    const rows = recent.map((p) => productRow(p, accent)).join('')
    if (rows) {
      newProductsBlock = `
        <h2 style="margin:28px 0 8px;color:#111;font-size:18px;">Fresh from the shop ✨</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`
    }
  }

  // Promo module
  let promoBlock = ''
  if (n.promoCode) {
    const promo = ctx.promoCodes.find((p) => p.code === n.promoCode)
    if (promo) {
      promoBlock = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr><td align="center" style="background:${accent};border-radius:16px;padding:24px;">
            <div style="color:#fff;font-size:15px;opacity:.9;">A little thank-you</div>
            <div style="color:#fff;font-size:26px;font-weight:800;margin:6px 0;">${promo.discountPct}% off your next order</div>
            <div style="display:inline-block;background:rgba(255,255,255,.18);border:1px dashed rgba(255,255,255,.6);border-radius:10px;padding:8px 18px;color:#fff;font-size:18px;font-weight:700;letter-spacing:2px;font-family:monospace;">${esc(promo.code)}</div>
          </td></tr>
        </table>`
    }
  }

  const preheader = n.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(n.preheader)}</div>`
    : ''

  const header = lightHeader
    ? `<tr><td style="padding:28px 32px 6px;">
          <div style="font-size:34px;line-height:1;">${esc(ctx.logoEmoji)}</div>
          <div style="color:${accent};font-size:20px;font-weight:700;margin-top:8px;">${esc(ctx.businessName)}</div>
        </td></tr>`
    : `<tr><td style="background:${accent};padding:28px 32px;">
          <div style="font-size:34px;line-height:1;">${esc(ctx.logoEmoji)}</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:8px;">${esc(ctx.businessName)}</div>
        </td></tr>`

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(merged(n.subject))}</title></head>
<body style="margin:0;padding:0;background:${background};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${background};padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:${radius}px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        ${header}
        <tr><td style="padding:32px;">
          ${bodyHtml}
          ${promoBlock}
          ${bestSellersBlock}
          ${newProductsBlock}
        </td></tr>
        <tr><td style="padding:24px 32px;background:#fafaf9;border-top:1px solid #eee;color:#999;font-size:12px;line-height:1.6;">
          <div style="margin-bottom:6px;color:#777;">${esc(s.footerNote)}</div>
          <div>${esc(s.mailingAddress)}</div>
          <div style="margin-top:10px;">You're receiving this because you subscribed at ${esc(ctx.businessName)}. <a href="${unsubHref}" style="color:#999;">Unsubscribe</a>.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Plain-text fallback for the same newsletter */
export function buildNewsletterText(n: Newsletter, s: NewsletterSettings, ctx: NewsletterContext, opts: BuildOptions = {}): string {
  const vars = { first_name: ctx.sampleFirstName || 'there', shop: ctx.businessName }
  const merged = (t: string) => (opts.forSend ? t : applyMergeTags(t, vars))
  const abs = (u: string) => (u.startsWith('/') && ctx.origin ? ctx.origin + u : u)
  const lines: string[] = [ctx.businessName, '']
  for (const b of effectiveBlocks(n)) {
    if (b.type === 'text') lines.push(...paragraphs(merged(b.text || '')), '')
    else if (b.type === 'image' && b.url) lines.push(`${b.text?.trim() ? merged(b.text) + ': ' : ''}${abs(b.url)}`, '')
    else if (b.type === 'button' && b.text?.trim()) lines.push(`${merged(b.text)}: ${b.url || ''}`, '')
    else if (b.type === 'divider') lines.push('———', '')
  }
  if (n.promoCode) {
    const promo = ctx.promoCodes.find((p) => p.code === n.promoCode)
    if (promo) lines.push('', `${promo.discountPct}% off your next order — code ${promo.code}`)
  }
  lines.push('', '—', s.footerNote, s.mailingAddress, 'Unsubscribe: reply STOP')
  return lines.join('\n')
}

// ── Audience & scheduling helpers ─────────────────────────────────────────────

/** Subscribed recipients for a newsletter's audience (all, or one tag) */
export function newsletterRecipients(n: Newsletter, subscribers: Subscriber[]): Subscriber[] {
  return subscribers.filter(
    (sub) => sub.status === 'subscribed' && (!n.audienceTag || sub.tags.includes(n.audienceTag)),
  )
}

/** Human label for a cadence value */
export function cadenceLabel(c: Newsletter['cadence']): string {
  return c === 'weekly' ? 'Weekly' : c === 'monthly' ? 'Monthly' : 'One-time'
}

/**
 * The next send date for a recurring cadence given the settings' schedule.
 * Returns an ISO string in the future, or null for one-time.
 */
export function nextSendDate(cadence: Newsletter['cadence'], s: NewsletterSettings, from: Date): string | null {
  if (cadence === 'one-time') return null
  const d = new Date(from)
  d.setHours(s.sendHour, 0, 0, 0)
  if (cadence === 'weekly') {
    const delta = (s.sendWeekday - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + delta)
  } else {
    // monthly: next occurrence of sendMonthDay
    d.setDate(Math.min(s.sendMonthDay, 28))
    if (d.getTime() <= from.getTime()) d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString()
}

export function openRate(n: Newsletter): number {
  return n.recipientCount && n.opens ? (n.opens / n.recipientCount) * 100 : 0
}

export function clickRate(n: Newsletter): number {
  return n.recipientCount && n.clicks ? (n.clicks / n.recipientCount) * 100 : 0
}
