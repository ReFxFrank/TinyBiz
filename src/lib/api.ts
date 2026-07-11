// Typed fetch layer for the studio's API server. Same-origin (/api is proxied
// by Vite in dev and nginx in production), cookie-authenticated.

import type { CurrencyCode, Order, PolicyContent, Product, PromoBanner, SocialLinks, StorefrontContent } from '@/data/types'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the studio server.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || 'server_error', data?.message || `Request failed (${res.status})`)
  }
  return data as T
}

// ── Shapes ────────────────────────────────────────────────────────────────────

/** Admin sections an account can be granted (mirrors the sidebar) */
export type PermKey =
  | 'dashboard' | 'orders' | 'inventory' | 'products' | 'customers' | 'suppliers'
  | 'expenses' | 'income' | 'accounting' | 'shipping' | 'manufacturing' | 'analytics'
  | 'marketing' | 'newsletter' | 'social' | 'calendar' | 'tasks' | 'documents'
  | 'employees' | 'settings'

export interface AccountAccess {
  all: boolean
  readable?: string[]
  writable?: string[]
  canWriteSettings?: boolean
  canWriteNewsletterSettings?: boolean
}

export interface AuthUser {
  email: string
  name: string
  role: 'owner' | 'staff'
  perms: PermKey[]
  access: AccountAccess
}

export interface MeResponse {
  needsSetup: boolean
  user: AuthUser | null
}

export interface TeamMember {
  id: string
  email: string
  name: string
  role: 'owner' | 'staff'
  perms: PermKey[]
  disabled: boolean
  createdAt: string
}

export type SyncOp =
  | { op: 'upsert'; collection: string; item: { id: string } & Record<string, unknown> }
  | { op: 'delete'; collection: string; id: string }
  | { op: 'settings'; data: unknown }
  | { op: 'newsletterSettings'; data: unknown }

export interface ShopInfo {
  businessName: string
  tagline: string
  logoEmoji: string
  email: string
  ownerName: string
  city: string
  state: string
  currency: CurrencyCode
  /** Conversion rates from the shop currency to the display currencies */
  currencyRates: { rates: Record<string, number>; source: 'live' | 'approx'; asOf: string | null } | null
  /** Which real payment providers are configured — checkout adapts its UI */
  payments: { stripe: boolean; paypal: boolean }
  taxRate: number
  /** Province → combined GST/HST/PST when the shop ships within Canada */
  caTaxTable: Record<string, number> | null
  freeShippingOver: number
  flatShipping: number
  shippingCountry: string
  shippingRegion: string
  storefront: Partial<StorefrontContent>
  /** Owner's uploaded photo for the About the maker section (null = logo) */
  makerPhoto: string | null
  policies: Partial<PolicyContent>
  social: SocialLinks
  promoBanner: PromoBanner | null
}

/** A shopper's account on the storefront (separate from the admin login) */
export interface ShopAccount {
  id: string
  name: string
  email: string
  address: { line1: string; city: string; state: string; zip: string } | null
  /** True when this is really the owner/staff signed in with their studio login */
  staff?: boolean
  role?: 'owner' | 'staff'
}

/** The sanitized order shape the public confirmation/track endpoints return */
export type PublicOrder = Pick<
  Order,
  | 'id' | 'number' | 'customerName' | 'email' | 'status' | 'items' | 'shippingCharged' | 'taxCollected'
  | 'shippingAddress' | 'notes' | 'placedAt' | 'shipBy' | 'trackingNumber' | 'carrier' | 'shippedAt' | 'deliveredAt'
>

export interface CheckoutPayload {
  items: Array<{ productId: string; variantId?: string; qty: number }>
  promoCode?: string
  contact: { name: string; email: string }
  address: { line1: string; city: string; state: string; zip: string }
  notes?: string
  /** Shopper's payment method when more than one provider is configured */
  payWith?: 'stripe' | 'paypal'
}

export type CheckoutResponse =
  | { mode: 'mock'; orderId: string; number: string }
  | { mode: 'stripe'; checkoutUrl: string }
  | { mode: 'paypal'; checkoutUrl: string }

// ── Endpoints ─────────────────────────────────────────────────────────────────

export const api = {
  // auth
  me: () => request<MeResponse>('/api/auth/me'),
  setup: (email: string, password: string, state?: unknown) =>
    request<{ ok: true }>('/api/auth/setup', { method: 'POST', body: JSON.stringify({ email, password, state }) }),
  login: (email: string, password: string) =>
    request<{ ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>('/api/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),

  // team management (owner only)
  team: {
    list: () => request<{ users: TeamMember[] }>('/api/team/'),
    create: (input: { email: string; name: string; password: string; perms: PermKey[] }) =>
      request<{ user: TeamMember }>('/api/team/', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, patch: { name?: string; perms?: PermKey[]; password?: string; disabled?: boolean }) =>
      request<{ user: TeamMember }>(`/api/team/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    remove: (id: string) => request<{ ok: true }>(`/api/team/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  // file upload (product photos, documents…) — raw bytes, server returns the
  // hosted URL. contentType overrides blob.type for files the browser can't
  // sniff (e.g. .csv reported with an empty MIME on some systems).
  upload: async (blob: Blob, contentType?: string) => {
    let res: Response
    try {
      res = await fetch('/api/uploads', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': contentType || blob.type || 'image/jpeg' },
        body: blob,
      })
    } catch {
      throw new ApiError(0, 'network', 'Could not reach the studio server.')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new ApiError(res.status, data?.error || 'server_error', data?.message || `Upload failed (${res.status})`)
    }
    return data as { url: string }
  },

  // shopper accounts (storefront — separate cookie from the admin login)
  account: {
    me: () => request<{ account: ShopAccount | null }>('/api/store/account/me'),
    signup: (input: { name: string; email: string; password: string }) =>
      request<{ account: ShopAccount }>('/api/store/account/signup', { method: 'POST', body: JSON.stringify(input) }),
    login: (input: { email: string; password: string }) =>
      request<{ account: ShopAccount }>('/api/store/account/login', { method: 'POST', body: JSON.stringify(input) }),
    logout: () => request<{ ok: true }>('/api/store/account/logout', { method: 'POST' }),
    update: (patch: { name?: string; address?: ShopAccount['address'] }) =>
      request<{ account: ShopAccount }>('/api/store/account/me', { method: 'PATCH', body: JSON.stringify(patch) }),
    password: (input: { current: string; next: string }) =>
      request<{ ok: true }>('/api/store/account/password', { method: 'POST', body: JSON.stringify(input) }),
    forgot: (email: string) =>
      request<{ ok: true }>('/api/store/account/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
    reset: (token: string, password: string) =>
      request<{ account: ShopAccount }>('/api/store/account/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
    orders: () => request<{ orders: PublicOrder[] }>('/api/store/account/orders'),
  },

  // owner state sync
  state: (since?: number) =>
    request<{ rev: number; unchanged?: true; state?: Record<string, unknown> }>(
      since != null ? `/api/state?since=${since}` : '/api/state',
    ),
  ops: (ops: SyncOp[]) => request<{ rev: number }>('/api/ops', { method: 'POST', body: JSON.stringify({ ops }) }),
  import: (state: unknown) => request<{ rev: number }>('/api/import', { method: 'POST', body: JSON.stringify({ state }) }),
  stripeStatus: () => request<{ enabled: boolean }>('/api/stripe/status'),
  paymentsStatus: () => request<{ stripe: boolean; paypal: boolean }>('/api/payments/status'),

  // Etsy shop sync (owner)
  etsy: {
    status: () =>
      request<{ configured: boolean; connected: boolean; shopName: string | null; lastSyncAt: string | null }>(
        '/api/etsy/status',
      ),
    saveKeystring: (keystring: string) =>
      request<{ ok: true }>('/api/etsy/keystring', { method: 'POST', body: JSON.stringify({ keystring }) }),
    sync: () => request<{ imported: number }>('/api/etsy/sync', { method: 'POST' }),
    disconnect: () => request<{ ok: true }>('/api/etsy/disconnect', { method: 'POST' }),
  },

  // public storefront
  catalog: () => request<{ products: Product[]; shop: ShopInfo; bestSellerIds: string[] }>('/api/store/catalog'),
  promo: (code: string) =>
    request<{ valid: boolean; code?: string; discountPct?: number }>('/api/store/promo', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  checkout: (payload: CheckoutPayload) =>
    request<CheckoutResponse>('/api/store/checkout', { method: 'POST', body: JSON.stringify(payload) }),
  order: (id: string) => request<{ order: PublicOrder }>(`/api/store/order/${encodeURIComponent(id)}`),
  track: (number: string, email: string) =>
    request<{ order: PublicOrder }>('/api/store/track', { method: 'POST', body: JSON.stringify({ number, email }) }),
  orderBySession: (sid: string) =>
    request<{ order?: PublicOrder; pending?: true }>(`/api/store/order/by-session/${encodeURIComponent(sid)}`),
  orderByPaypal: (ref: string) =>
    request<{ order?: PublicOrder; pending?: true }>(`/api/store/order/by-paypal/${encodeURIComponent(ref)}`),
  subscribe: (email: string) =>
    request<{ ok: true; already?: boolean }>('/api/store/subscribe', { method: 'POST', body: JSON.stringify({ email }) }),
  notifyStock: (productId: string, email: string) =>
    request<{ ok?: true; already?: boolean }>('/api/store/notify-stock', {
      method: 'POST',
      body: JSON.stringify({ productId, email }),
    }),
}
