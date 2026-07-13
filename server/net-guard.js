// Guards for server-side outbound HTTP to owner/staff-configurable URLs
// (Discord webhooks). Blocks SSRF into loopback / private / link-local /
// cloud-metadata targets. NOT applied to the mail bridge, which legitimately
// runs on localhost — that surface is protected by owner-gating its URL
// (see state.js) plus the optional MAIL_BRIDGE_URL env pin.
//
// Tests that point a mock at 127.0.0.1 set ALLOW_PRIVATE_WEBHOOKS=1.

/** Returns a human reason string if the URL must be blocked, else null. */
export function blockedWebhookReason(raw) {
  let u
  try {
    u = new URL(String(raw))
  } catch {
    return 'not a valid URL'
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'must be http(s)'
  if (process.env.ALLOW_PRIVATE_WEBHOOKS === '1') return null
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return 'private host'
  }
  if (host === '::1' || host === '0.0.0.0' || /^127\./.test(host)) return 'loopback'
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return 'private range'
  if (/^169\.254\./.test(host)) return 'link-local / cloud metadata'
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'private range'
  if (/^(fc|fd)/.test(host) || /^fe80:/.test(host)) return 'private/link-local IPv6'
  return null
}

export function isSafeWebhookUrl(raw) {
  return blockedWebhookReason(raw) === null
}
