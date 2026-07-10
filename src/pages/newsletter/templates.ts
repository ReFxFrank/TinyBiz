import type { Newsletter } from '@/data/types'

/** A starting point for a new newsletter — MailerLite-style template gallery */
export interface NewsletterTemplate {
  id: string
  name: string
  emoji: string
  description: string
  /** Fields prefilled into the composer */
  preset: Partial<
    Pick<
      Newsletter,
      'subject' | 'preheader' | 'intro' | 'includeBestSellers' | 'includeNewProducts' | 'ctaLabel' | 'ctaUrl'
    >
  >
}

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    emoji: '✏️',
    description: 'Start from scratch.',
    preset: { includeBestSellers: false, includeNewProducts: false },
  },
  {
    id: 'monthly',
    name: 'Monthly update',
    emoji: '🗓️',
    description: 'A friendly recap with your best sellers.',
    preset: {
      subject: 'Your monthly update from {{shop}} ✨',
      preheader: "What's new this month",
      intro:
        "Hi {{first_name}}! Here's what we've been up to this month at {{shop}} — new makes, shop favorites, and a few things we're excited about. Thanks for following along!",
      includeBestSellers: true,
      includeNewProducts: false,
    },
  },
  {
    id: 'launch',
    name: 'New product launch',
    emoji: '🚀',
    description: 'Announce a fresh drop with a shop button.',
    preset: {
      subject: 'Just dropped: something new 🚀',
      preheader: 'Fresh from the workbench',
      intro:
        "Hi {{first_name}}! We just added something new to the shop and couldn't wait to share it with you. Take a peek below — these tend to go fast!",
      includeBestSellers: false,
      includeNewProducts: true,
      ctaLabel: 'Shop the drop',
      ctaUrl: '', // filled with the shop's own address when the template is applied
    },
  },
  {
    id: 'sale',
    name: 'Sale / promo',
    emoji: '🎉',
    description: 'Feature a discount code with a big CTA.',
    preset: {
      subject: 'A little treat for you 🎉',
      preheader: 'A thank-you discount inside',
      intro:
        "Hi {{first_name}}! As a thank-you for being part of the {{shop}} community, here's a discount on your next order. Enjoy!",
      includeBestSellers: true,
      includeNewProducts: false,
      ctaLabel: 'Shop the sale',
      ctaUrl: '', // filled with the shop's own address when the template is applied
    },
  },
  {
    id: 'welcome',
    name: 'Welcome',
    emoji: '👋',
    description: 'Greet new subscribers warmly.',
    preset: {
      subject: 'Welcome to {{shop}} 👋',
      preheader: "We're so glad you're here",
      intro:
        "Hi {{first_name}}, welcome! We're a small maker shop and we're thrilled to have you. Here's a taste of what we make — reply anytime, a real human reads every message.",
      includeBestSellers: true,
      includeNewProducts: false,
      ctaLabel: 'Browse the shop',
      ctaUrl: '', // filled with the shop's own address when the template is applied
    },
  },
  {
    id: 'restock',
    name: 'Back in stock',
    emoji: '📦',
    description: 'Let fans know a favorite returned.',
    preset: {
      subject: "It's back! 📦",
      preheader: 'Your favorite just restocked',
      intro:
        "Good news, {{first_name}} — a shop favorite is back in stock. These sell out quickly, so grab yours before they're gone!",
      includeBestSellers: true,
      includeNewProducts: false,
      ctaLabel: 'Grab yours',
      ctaUrl: '', // filled with the shop's own address when the template is applied
    },
  },
]
