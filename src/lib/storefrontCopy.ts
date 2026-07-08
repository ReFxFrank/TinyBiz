// The owner-editable wording on the storefront. Every field is optional —
// blank fields fall back to sensible defaults built from the business
// identity, so a fresh shop reads well before anything is customized.
// Edited in the admin under Settings → Storefront content.

import type { StorefrontContent } from '@/data/types'
import { emojify } from '@/lib/emoji'

export interface CopyContext {
  businessName: string
  ownerName: string
  city: string
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
