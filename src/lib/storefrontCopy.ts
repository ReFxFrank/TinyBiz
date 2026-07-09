// The owner-editable wording on the storefront. Every field is optional —
// blank fields fall back to sensible defaults built from the business
// identity, so a fresh shop reads well before anything is customized.
// Edited in the admin under Settings → Storefront content.

import type { StorefrontContent } from '@/data/types'
import { emojify } from '@/lib/emoji'
import { money } from '@/lib/format'

export interface CopyContext {
  businessName: string
  ownerName: string
  city: string
  /** Shipping wording for the trust tiles, e.g. "Canada" */
  shippingRegion: string
  /** Free-shipping threshold for the trust tiles */
  freeShippingOver: number
}

/** Field metadata for the Settings editor (labels, hints, multiline) */
export const STOREFRONT_FIELDS: Array<{
  key: keyof StorefrontContent
  label: string
  hint: string
  multiline?: boolean
}> = [
  { key: 'heroBadge', label: 'Hero badge', hint: 'The small pill above your shop name, e.g. "Small-batch · 3D-printed · Hand-finished".' },
  { key: 'heroSubtext', label: 'Hero description', hint: 'The sentence under your shop name and tagline.', multiline: true },
  { key: 'trust1Title', label: 'Trust tile 1 — title', hint: 'First of the three highlight tiles under the hero. The standard wording follows your shipping settings.' },
  { key: 'trust1Body', label: 'Trust tile 1 — detail', hint: 'The smaller line under the first tile’s title.' },
  { key: 'trust2Title', label: 'Trust tile 2 — title', hint: 'Second highlight tile, e.g. "Made to order".' },
  { key: 'trust2Body', label: 'Trust tile 2 — detail', hint: 'The smaller line under the second tile’s title.' },
  { key: 'trust3Title', label: 'Trust tile 3 — title', hint: 'Third highlight tile, e.g. "Easy returns".' },
  { key: 'trust3Body', label: 'Trust tile 3 — detail', hint: 'The smaller line under the third tile’s title.' },
  { key: 'aboutHeading', label: 'About heading', hint: 'The title of the "About the maker" section.' },
  { key: 'aboutBody1', label: 'About — first paragraph', hint: 'Your story: how the shop started, what makes it yours.', multiline: true },
  { key: 'aboutBody2', label: 'About — second paragraph', hint: 'How things are made, quality, care — anything you want customers to know.', multiline: true },
  { key: 'newsletterHeading', label: 'Newsletter heading', hint: 'The title of the email signup panel.' },
  { key: 'newsletterSubtext', label: 'Newsletter description', hint: 'Why customers should subscribe.', multiline: true },
  { key: 'newsletterFinePrint', label: 'Newsletter fine print', hint: 'The small reassurance line under the signup form.' },
]

/** Defaults, generated from the business identity so they never feel generic */
export function defaultStorefrontCopy(ctx: CopyContext): StorefrontContent {
  return {
    heroBadge: 'Small-batch · 3D-printed · Hand-finished',
    heroSubtext: `Every piece is designed, 3D-printed, and hand-finished in ${
      ctx.city ? `our ${ctx.city} studio` : 'our studio'
    } — in small batches, never mass-produced.`,
    trust1Title: ctx.shippingRegion ? `Free shipping across ${ctx.shippingRegion}` : 'Free shipping',
    trust1Body: `On every order over ${money(ctx.freeShippingOver)}`,
    trust2Title: 'Made to order',
    trust2Body: 'Printed in-house in small batches',
    trust3Title: 'Easy returns',
    trust3Body: '30-day returns & friendly support',
    aboutHeading: ctx.ownerName
      ? `Hi, I’m ${ctx.ownerName} — the maker behind ${ctx.businessName}`
      : `The maker behind ${ctx.businessName}`,
    aboutBody1: `${ctx.businessName} started with a single printer on a kitchen table and a stubborn belief that everyday objects should be a little more delightful. Every design is still modeled in-house, printed on our own machines in small batches, and hand-finished one piece at a time.`,
    aboutBody2:
      'Nothing here sits in a warehouse. When you order, your piece comes from a fresh batch — or is printed just for you — then quality-checked and packed with care before it heads your way.',
    newsletterHeading: 'Get first dibs on new drops',
    newsletterSubtext: 'New designs land in small batches and sell out fast — subscribers always hear first.',
    newsletterFinePrint: 'No spam, ever — just new pieces, restocks, and the odd discount.',
  }
}

/** Merge the owner's overrides over the defaults; blank strings mean "default" */
export function resolveStorefrontCopy(
  overrides: Partial<StorefrontContent> | undefined,
  ctx: CopyContext,
): StorefrontContent {
  const base = defaultStorefrontCopy(ctx)
  const out = { ...base }
  for (const key of Object.keys(base) as Array<keyof StorefrontContent>) {
    const v = overrides?.[key]
    // emojify covers overrides saved before shortcode support existed
    if (typeof v === 'string' && v.trim() !== '') out[key] = emojify(v)
  }
  return out
}
