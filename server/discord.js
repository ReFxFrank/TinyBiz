// Discord alerts — the owner pastes a webhook URL in Settings → Integrations
// and the shop posts compact embeds for new orders, support activity and
// reviews. Fire-and-forget with a short timeout: Discord being down must
// never slow an order down. Same trust model as the mail bridge URL — the
// owner controls where it points.

import { Router } from 'express'
import { getMeta } from './db.js'
import { requireAuth, requireOwner } from './auth.js'

export const DISCORD_COLORS = {
  order: 5763719, // green
  support: 3447003, // blue
  review: 16705372, // gold
}

export function discordConfigured() {
  return /^https?:\/\//.test(String(getMeta('settings')?.discordWebhookUrl || '').trim())
}

/** Post one embed to the configured webhook. Never throws. */
export async function postDiscord({ title, description, color, url }) {
  const webhook = String(getMeta('settings')?.discordWebhookUrl || '').trim()
  if (!/^https?:\/\//.test(webhook)) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        embeds: [
          {
            title: String(title).slice(0, 256),
            ...(description ? { description: String(description).slice(0, 2000) } : {}),
            ...(url ? { url } : {}),
            color,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    })
  } catch (err) {
    console.warn(`[tinymagic-api] discord alert failed: ${err.message}`)
  }
}

// ── One-line alert builders for the hook sites ───────────────────────────────

const money = (n) => `$${Number(n).toFixed(2)}`

export function discordOrderAlert(order) {
  const total =
    (order.items || []).reduce((a, i) => a + i.unitPrice * i.quantity, 0) +
    (order.shippingCharged || 0) +
    (order.taxCollected || 0) -
    (order.discountTotal || 0)
  const items = (order.items || []).map((i) => `${i.quantity}× ${i.name}`).join(', ')
  return postDiscord({
    title: `🛒 New order ${order.number} — ${money(total)}`,
    description: `**${order.customerName}** · ${items}`,
    color: DISCORD_COLORS.order,
  })
}

export function discordSupportAlert(ticket, kind) {
  return postDiscord({
    title:
      kind === 'new'
        ? `💬 New support request ${ticket.number}`
        : `💬 ${ticket.customerName} replied on ${ticket.number}`,
    description: `**${ticket.subject}**${ticket.orderNumber ? ` · order ${ticket.orderNumber}` : ''}\n${(ticket.messages?.at(-1)?.body || '').slice(0, 300)}`,
    color: DISCORD_COLORS.support,
  })
}

export function discordReviewAlert(review) {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)
  return postDiscord({
    title: `⭐ ${stars} review on ${review.productName}`,
    description: `**${review.authorName}** — ${(review.title ? `${review.title}: ` : '') + review.body.slice(0, 280)}`,
    color: DISCORD_COLORS.review,
  })
}

// "Send a test ping" from Settings → Integrations
export const discordRouter = Router()
discordRouter.post('/test', requireAuth, requireOwner, async (_req, res) => {
  if (!discordConfigured()) {
    return res.status(400).json({ error: 'not_configured', message: 'Save a webhook URL first.' })
  }
  await postDiscord({
    title: '✨ The Tiny Magic Studio is connected',
    description: 'New orders, support requests and reviews will ping this channel.',
    color: DISCORD_COLORS.order,
  })
  res.json({ ok: true })
})
