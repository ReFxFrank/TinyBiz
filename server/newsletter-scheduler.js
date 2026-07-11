// Scheduled newsletter sending. The composer snapshots the fully-rendered
// template (merge tags intact) onto the campaign when the owner schedules it;
// this sweep resolves the audience FRESH at send time and posts everything to
// the mail bridge — which personalizes per recipient and injects open/click
// tracking, exactly like a send from the open admin tab.

import { getCollection, getMeta, upsertItem, uid, bumpRev } from './db.js'

const SWEEP_MS = Number(process.env.NEWSLETTER_SWEEP_MS) || 60_000
const MAX_ATTEMPTS = 3

function bell(title, body) {
  upsertItem('notifications', {
    id: uid('ntf'),
    type: 'message',
    title,
    body,
    createdAt: new Date().toISOString(),
    read: false,
    link: '/admin/newsletter',
  })
}

/** Subscribed recipients for a campaign's audience (mirrors lib/newsletter.ts) */
function recipientsFor(n) {
  return getCollection('subscribers').filter(
    (s) => s.status === 'subscribed' && (!n.audienceTag || (s.tags || []).includes(n.audienceTag)),
  )
}

async function sendScheduled(n) {
  const ns = getMeta('newsletterSettings') || {}
  const settings = getMeta('settings') || {}
  const now = new Date().toISOString()
  const recipients = recipientsFor(n)

  if (recipients.length === 0) {
    upsertItem('newsletters', { ...n, status: 'draft', sendingAt: undefined, sendAttempts: undefined })
    bell(`“${n.subject}” wasn't sent`, 'Its audience has no subscribed contacts — it went back to drafts.')
    bumpRev()
    return
  }

  const base = String(ns.mailBridgeUrl || '').trim().replace(/\/$/, '')
  if (base) {
    const res = await fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        token: ns.mailBridgeToken || 'demo',
        campaignId: n.id,
        subject: n.subject,
        html: n.renderedHtml,
        text: n.renderedText,
        from: { name: ns.fromName || settings.businessName || 'Shop', email: ns.fromEmail || settings.email || '' },
        replyTo: ns.replyTo || undefined,
        shop: settings.businessName || 'Shop',
        trackOpens: true,
        trackClicks: true,
        recipients: recipients.map((r) => ({ email: r.email, name: r.name, firstName: r.name?.split(' ')[0] })),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) throw new Error(data.error || `bridge responded ${res.status}`)
  }

  upsertItem('newsletters', {
    ...n,
    status: 'sent',
    sentAt: now,
    recipientCount: recipients.length,
    opens: 0,
    clicks: 0,
    renderedHtml: undefined,
    renderedText: undefined,
    sendAttempts: undefined,
    sendingAt: undefined,
  })
  bell(
    `Newsletter sent: “${n.subject}”`,
    `${recipients.length} subscriber${recipients.length === 1 ? '' : 's'}${base ? '' : ' (demo mode — no mail bridge configured)'}.`,
  )
  bumpRev()
  console.log(`[tinymagic-api] scheduled newsletter "${n.subject}" → ${recipients.length} recipients`)
}

async function sweep() {
  const now = Date.now()
  const due = getCollection('newsletters').filter(
    (n) =>
      n.status === 'scheduled' &&
      n.scheduledFor &&
      new Date(n.scheduledFor).getTime() <= now &&
      typeof n.renderedHtml === 'string' &&
      // in-flight lock: a send started <5 min ago is still someone's problem
      (!n.sendingAt || now - new Date(n.sendingAt).getTime() > 5 * 60_000),
  )
  for (const n of due) {
    const locked = { ...n, sendingAt: new Date().toISOString() }
    upsertItem('newsletters', locked)
    try {
      await sendScheduled(locked)
    } catch (err) {
      const attempts = (n.sendAttempts || 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        upsertItem('newsletters', { ...locked, status: 'draft', sendingAt: undefined, sendAttempts: undefined })
        bell(
          `“${n.subject}” couldn't be sent`,
          `The mail bridge failed ${MAX_ATTEMPTS} times (${err.message}) — it went back to drafts. Check Settings → Newsletter.`,
        )
        bumpRev()
      } else {
        upsertItem('newsletters', { ...locked, sendingAt: undefined, sendAttempts: attempts })
        bumpRev()
      }
      console.warn(`[tinymagic-api] scheduled newsletter "${n.subject}" attempt ${attempts} failed: ${err.message}`)
    }
  }
}

/** Kick off the sweep. Campaigns scheduled from an old client (no snapshot)
 *  are left alone — the Newsletter page still sends those by hand. */
export function startNewsletterScheduler() {
  setInterval(() => void sweep().catch(() => {}), SWEEP_MS).unref()
}
