// Tiny in-memory rate limiter — per-IP sliding window, no dependencies.
// State resets on restart, which is fine: this guards against brute force
// and scraping, not determined DDoS (Cloudflare sits in front for that).

const buckets = new Map()

// Sweep stale buckets occasionally so long-running processes stay lean
setInterval(() => {
  const now = Date.now()
  for (const [key, hits] of buckets) {
    while (hits.length && hits[0] <= now) hits.shift()
    if (hits.length === 0) buckets.delete(key)
  }
}, 60_000).unref()

/**
 * rateLimit({ windowMs, max, name }) → Express middleware.
 * Allows `max` requests per IP per rolling window; 429 beyond that.
 */
export function rateLimit({ windowMs, max, name }) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`
    const now = Date.now()
    let hits = buckets.get(key)
    if (!hits) buckets.set(key, (hits = []))
    while (hits.length && hits[0] <= now) hits.shift() // drop expired stamps
    if (hits.length >= max) {
      const retryAfter = Math.ceil((hits[0] - now) / 1000)
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)))
      return res.status(429).json({
        error: 'rate_limited',
        message: 'Too many attempts — please wait a few minutes and try again.',
      })
    }
    hits.push(now + windowMs) // store expiry stamps
    next()
  }
}
