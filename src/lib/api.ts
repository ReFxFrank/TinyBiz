// Typed fetch layer for the TinyBiz API server. Same-origin (/api is proxied
// by Vite in dev and nginx in production), cookie-authenticated.

import type { CurrencyCode, Order, Product } from '@/data/types'

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
    throw new ApiError(0, 'network', 'Could not reach the TinyBiz server.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || 'server_error', data?.message || `Request failed (${res.status})`)
  }
  return data as T
}

// ── Shapes ────────────────────────────────────────────────────────────────────

export interface MeResponse {
  needsSetup: boolean
  user: { email: string } | null
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
  taxRate: number
  freeShippingOver: number
  flatShipping: number
}

/** The sanitized order shape the public confirmation endpoint returns */
export type PublicOrder = Pick<
  Order,
  'id' | 'number' | 'customerName' | 'email' | 'items' | 'shippingCharged' | 'taxCollected' | 'shippingAddress' | 'notes' | 'placedAt' | 'shipBy'
>

export interface CheckoutPayload {
  items: Array<{ productId: string; variantId?: string; qty: number }>
  promoCode?: string
  contact: { name: string; email: string }
  address: { line1: string; city: string; state: string; zip: string }
  notes?: string
}

export type CheckoutResponse =
  | { mode: 'mock'; orderId: string; number: string }
  | { mode: 'stripe'; checkoutUrl: string }

// ── Endpoints ─────────────────────────────────────────────────────────────────

export const api = {
  // auth
  me: () => request<MeResponse>('/api/auth/me'),
  setup: (email: string, password: string, state?: unknown) =>
    request<{ ok: true }>('/api/auth/setup', { method: 'POST', body: JSON.stringify({ email, password, state }) }),
  login: (email: string, password: string) =>
    request<{ ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  // owner state sync
  state: (since?: number) =>
    request<{ rev: number; unchanged?: true; state?: Record<string, unknown> }>(
      since != null ? `/api/state?since=${since}` : '/api/state',
    ),
  ops: (ops: SyncOp[]) => request<{ rev: number }>('/api/ops', { method: 'POST', body: JSON.stringify({ ops }) }),
  import: (state: unknown) => request<{ rev: number }>('/api/import', { method: 'POST', body: JSON.stringify({ state }) }),
  stripeStatus: () => request<{ enabled: boolean }>('/api/stripe/status'),

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
  orderBySession: (sid: string) =>
    request<{ order?: PublicOrder; pending?: true }>(`/api/store/order/by-session/${encodeURIComponent(sid)}`),
  subscribe: (email: string) =>
    request<{ ok: true; already?: boolean }>('/api/store/subscribe', { method: 'POST', body: JSON.stringify({ email }) }),
}
