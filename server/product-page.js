// Per-product link previews. Crawlers (Discord, iMessage, Facebook, Google)
// don't run the SPA's JavaScript — they read the meta tags of whatever HTML
// the URL serves. nginx proxies /product/ here so every product page carries
// its own og:title/description/image plus schema.org Product data; browsers
// get the exact same dist/index.html and boot the app as usual.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getItem, getMeta } from './db.js'

const DIST_INDEX = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/index.html')

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Swap a meta tag's content attribute in place; no-op when the tag is absent */
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`)
  return html.replace(re, `$1${esc(value)}$2`)
}

export function productPage(req, res) {
  let html
  try {
    html = readFileSync(DIST_INDEX, 'utf8')
  } catch {
    // No build yet (dev) — crawlers still get the tags, minus the app shell
    html = `<!doctype html><html><head><meta charset="utf-8"><title>The Tiny Magic Studio</title>
<meta name="description" content="" /><meta property="og:type" content="website" />
<meta property="og:site_name" content="" /><meta property="og:title" content="" />
<meta property="og:description" content="" /><meta property="og:url" content="" />
<meta property="og:image" content="" /><meta name="twitter:card" content="summary" />
</head><body></body></html>`
  }

  const product = getItem('products', req.params.id)
  res.type('html').setHeader('Cache-Control', 'no-cache')
  if (!product || !product.active) return res.send(html) // SPA shows its own not-found state

  const settings = getMeta('settings') || {}
  const origin = `${req.protocol}://${req.get('host')}`
  const url = `${origin}/product/${product.id}`
  const shopName = settings.businessName || 'The Tiny Magic Studio'
  const title = `${product.name} — ${shopName}`
  const description = String(product.description || '').trim().slice(0, 200) || `Handmade by ${shopName}.`
  const currency = settings.currency || 'USD'

  // First real photo wins; emoji-only products fall back to the shop logo
  const photo = (product.photos || []).find((p) => /^(\/|https?:)/.test(String(p)))
  const image = photo ? (photo.startsWith('/') ? origin + photo : photo) : `${origin}/brand/logo.png`

  const sellable = (product.stock || 0) + (product.variants || []).reduce((a, v) => a + (v.stock || 0), 0)

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  html = setMeta(html, 'name', 'description', description)
  html = setMeta(html, 'property', 'og:type', 'product')
  html = setMeta(html, 'property', 'og:title', title)
  html = setMeta(html, 'property', 'og:description', description)
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'property', 'og:image', image)
  if (photo) html = setMeta(html, 'name', 'twitter:card', 'summary_large_image')

  // Rich results for Google: schema.org Product with a live offer
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    image,
    url,
    offers: {
      '@type': 'Offer',
      price: Number(product.price).toFixed(2),
      priceCurrency: currency,
      availability: sellable > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url,
    },
  }
  // </script> inside JSON would end the tag early — escape it defensively
  const ld = JSON.stringify(jsonLd).replace(/</g, '\\u003c')
  html = html.replace(
    '</head>',
    `<meta property="product:price:amount" content="${esc(Number(product.price).toFixed(2))}" />\n` +
      `<meta property="product:price:currency" content="${esc(currency)}" />\n` +
      `<script type="application/ld+json">${ld}</script>\n</head>`,
  )

  res.send(html)
}
