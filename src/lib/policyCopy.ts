// Store policies shown at /policies. Every field is optional — blank fields
// fall back to defaults built from the business identity and live shipping
// config, so the page reads well (and stays accurate) before anything is
// customized. Edited in the admin under Settings → Store policies.

import type { PolicyContent } from '@/data/types'

export interface PolicyContext {
  businessName: string
  email: string
  country: string
  flatShipping: number
  freeShippingOver: number
}

/** Field metadata for the Settings editor */
export const POLICY_FIELDS: Array<{ key: keyof PolicyContent; label: string; hint: string }> = [
  {
    key: 'shippingPolicy',
    label: 'Shipping policy',
    hint: 'Where you ship, how long it takes, what it costs.',
  },
  {
    key: 'returnsPolicy',
    label: 'Returns & exchanges',
    hint: 'What you accept back, the time window, and how to start a return.',
  },
  {
    key: 'privacyPolicy',
    label: 'Privacy policy',
    hint: 'What customer info you collect and how you use it.',
  },
]

/** Defaults woven from the shop's identity + live shipping config */
export function defaultPolicies(ctx: PolicyContext): PolicyContent {
  const free =
    ctx.freeShippingOver > 0
      ? `Orders over $${ctx.freeShippingOver.toFixed(2)} ship free; below that, shipping is a flat $${ctx.flatShipping.toFixed(2)}.`
      : 'Shipping is free on every order.'
  return {
    shippingPolicy: [
      `Everything is made in small batches, so orders usually leave the studio within 3–5 business days.`,
      free,
      `Right now we ship within ${ctx.country}. Once your order is on its way you'll get an email with a tracking number, and you can check on it anytime from the Track your order page.`,
    ].join('\n\n'),
    returnsPolicy: [
      `If something isn't right, we want to fix it. You can return any unused item within 30 days of delivery — just reply to your order email${ctx.email ? ` or write to ${ctx.email}` : ''} and we'll sort it out.`,
      `If your order arrives damaged, send us a photo and we'll replace it free of charge. Custom or personalized pieces can't be returned unless they arrive damaged.`,
    ].join('\n\n'),
    privacyPolicy: [
      `We only collect what we need to get your order to you: your name, email, and shipping address. If you join the newsletter, we keep your email for that too — you can unsubscribe anytime.`,
      `We never sell or share your information. Payments are handled securely by Stripe; ${ctx.businessName} never sees your card details.`,
    ].join('\n\n'),
  }
}

/** Merge the owner's overrides over the defaults; blank strings mean "default" */
export function resolvePolicies(overrides: Partial<PolicyContent> | undefined, ctx: PolicyContext): PolicyContent {
  const base = defaultPolicies(ctx)
  const out = { ...base }
  for (const key of Object.keys(base) as Array<keyof PolicyContent>) {
    const v = overrides?.[key]
    if (typeof v === 'string' && v.trim() !== '') out[key] = v
  }
  return out
}
