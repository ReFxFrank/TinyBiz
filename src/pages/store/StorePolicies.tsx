// Store policies — shipping, returns, privacy. Content comes from
// resolvePolicies (owner overrides over identity-woven defaults), so the page
// reads well even before the owner has written a word.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ScrollText } from 'lucide-react'
import { useCatalog } from '@/store/useCatalog'
import { FLAT_SHIPPING, FREE_SHIPPING_OVER } from '@/store/useCart'
import { resolvePolicies } from '@/lib/policyCopy'
import type { PolicyContent } from '@/data/types'

const SECTIONS: Array<{ id: string; title: string; key: keyof PolicyContent }> = [
  { id: 'shipping', title: 'Shipping', key: 'shippingPolicy' },
  { id: 'returns', title: 'Returns & exchanges', key: 'returnsPolicy' },
  { id: 'privacy', title: 'Privacy', key: 'privacyPolicy' },
]

export default function StorePolicies() {
  const shop = useCatalog((s) => s.shop)
  const policies = useMemo(
    () =>
      resolvePolicies(shop?.policies, {
        businessName: shop?.businessName ?? 'Our shop',
        email: shop?.email ?? '',
        country: shop?.shippingCountry ?? 'Canada',
        flatShipping: shop?.flatShipping ?? FLAT_SHIPPING,
        freeShippingOver: shop?.freeShippingOver ?? FREE_SHIPPING_OVER,
      }),
    [shop],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"
    >
      <div className="text-center">
        <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl brand-gradient-soft text-accent">
          <ScrollText className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Store policies</h1>
        <p className="mt-2 text-sm text-ink-3">
          The plain-language version of how we ship, fix things, and look after your info.
        </p>
      </div>

      <nav aria-label="Policy sections" className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-hairline bg-raised/70 px-4 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-edge hover:text-ink"
          >
            {section.title}
          </a>
        ))}
      </nav>

      <div className="mt-12 space-y-12">
        {SECTIONS.map((section) => (
          // scroll-mt clears the sticky store header when anchor-jumping
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{section.title}</h2>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{policies[section.key]}</p>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-hairline pt-6 text-center text-sm text-ink-3">
        Questions about any of this?{' '}
        {shop?.email ? (
          <a href={`mailto:${shop.email}`} className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
            Write to us
          </a>
        ) : (
          'Reply to your order email'
        )}{' '}
        — we're happy to help.
      </p>
    </motion.div>
  )
}
