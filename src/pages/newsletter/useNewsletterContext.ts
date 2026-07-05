import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { bestSellers } from '@/lib/metrics'
import type { NewsletterContext } from '@/lib/newsletter'

/** Read the live brand accent (hex) from the CSS variable */
export function currentAccentHex(): string {
  if (typeof document === 'undefined') return '#2a78d6'
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return v || '#2a78d6'
}

/** Shop data + branding used to render/send a newsletter */
export function useNewsletterContext(): NewsletterContext {
  const products = useStore((s) => s.products)
  const orders = useStore((s) => s.orders)
  const promoCodes = useStore((s) => s.promoCodes)
  const settings = useStore((s) => s.settings)

  return useMemo(
    () => ({
      products,
      bestSellers: bestSellers(orders, 90),
      promoCodes,
      accent: currentAccentHex(),
      logoEmoji: settings.logoEmoji,
      businessName: settings.businessName,
    }),
    [products, orders, promoCodes, settings.logoEmoji, settings.businessName],
  )
}
