// The canonical public origin used to build links in emails, OAuth redirects,
// and SEO output.
//
// SECURITY: this must NEVER be derived from the attacker-controllable `Origin`
// request header. A poisoned `Origin: https://evil.com` on POST /forgot would
// otherwise produce a genuine password-reset email — from the shop itself —
// whose reset link (with a valid token) points at the attacker's host; one
// click hands over the account. So we prefer a server-configured constant and
// fall back only to the reverse-proxy-pinned Host (nginx `proxy_set_header Host
// $host`), never to `req.headers.origin`.
//
// Set PUBLIC_URL in /etc/tinymagic.env (e.g. https://thetinymagicstudio.ca) to
// pin every generated link regardless of inbound headers.
export function siteOrigin(req) {
  const configured = String(process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '')
  if (/^https?:\/\/.+/.test(configured)) return configured
  // Fallback: X-Forwarded-Proto-aware protocol + the Host nginx pinned. Still
  // safer than req.headers.origin; PUBLIC_URL is the definitive fix.
  return `${req.protocol}://${req.get('host')}`
}
