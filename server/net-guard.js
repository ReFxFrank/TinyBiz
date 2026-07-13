// Guards for server-side outbound HTTP to owner/staff-configurable URLs
// (Discord webhooks). NOT applied to the mail bridge, which legitimately runs
// on localhost — that surface is protected by owner-gating its URL (see
// state.js) plus the optional MAIL_BRIDGE_URL env pin.
//
// For a target that has ONE legitimate host (Discord), prefer the allowlist
// (discordWebhookBlockedReason): it structurally defeats SSRF a denylist can't
// — IP literals, IPv4-mapped IPv6, DNS names A-recorded to internal/metadata
// IPs, and DNS rebinding, since none of those are discord.com.
//
// Tests that point a mock at 127.0.0.1 set ALLOW_PRIVATE_WEBHOOKS=1.

/** IPv4 embedded in an IPv4-mapped IPv6 host, else null. WHATWG URL normalizes
 *  [::ffff:127.0.0.1] to its hex form ::ffff:7f00:1, so handle both. */
function mappedIpv4(host) {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host)
  if (dotted) return dotted[1]
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
  }
  return null
}

/** Best-effort denylist for arbitrary webhook hosts. Returns a human reason
 *  string if the URL must be blocked, else null. Allowlist where you can. */
export function blockedWebhookReason(raw) {
  let u
  try {
    u = new URL(String(raw))
  } catch {
    return 'not a valid URL'
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'must be http(s)'
  if (process.env.ALLOW_PRIVATE_WEBHOOKS === '1') return null
  let host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  // An IPv4-mapped IPv6 literal ([::ffff:127.0.0.1]) reaches the same v4 stack —
  // judge it by its embedded IPv4 so loopback/private ranges are still caught.
  host = mappedIpv4(host) || host
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return 'private host'
  }
  if (host === '::1' || host === '::' || host === '0' || host === '0.0.0.0' || /^127\./.test(host)) return 'loopback'
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return 'private range'
  if (/^169\.254\./.test(host)) return 'link-local / cloud metadata'
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return 'private range'
  if (/^(fc|fd)/.test(host) || /^fe80:/.test(host)) return 'private/link-local IPv6'
  return null
}

export function isSafeWebhookUrl(raw) {
  return blockedWebhookReason(raw) === null
}

/** Strict ALLOWLIST for Discord webhooks: only https on discord.com /
 *  discordapp.com (or a subdomain). Refusing everything else is what actually
 *  closes the SSRF — an attacker can't point it at an IP literal, an internal
 *  DNS name, or a rebinding host, because none of those are discord.com.
 *  Returns a human reason string if blocked, else null. */
export function discordWebhookBlockedReason(raw) {
  let u
  try {
    u = new URL(String(raw))
  } catch {
    return 'not a valid URL'
  }
  if (process.env.ALLOW_PRIVATE_WEBHOOKS === '1') return null
  if (u.protocol !== 'https:') return 'must be https'
  const host = u.hostname.toLowerCase()
  const ok =
    host === 'discord.com' ||
    host === 'discordapp.com' ||
    host.endsWith('.discord.com') ||
    host.endsWith('.discordapp.com')
  return ok ? null : 'not a discord.com webhook URL'
}
