// Storefront checkout — contact + shipping form on the left, sticky order
// summary on the right. Placing an order POSTs to the server, which validates
// stock and promo, writes the customer/order/stock/notification records, and
// either confirms immediately (mock mode) or hands off to Stripe Checkout.

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CreditCard, Lock, ShoppingBag, Tag } from 'lucide-react'
import { Button, Card, CardHeader, EmptyState, Field, Input, Textarea } from '@/components/ui'
import { useCart, useCartDetails } from '@/store/useCart'
import { useCatalog } from '@/store/useCatalog'
import { api, ApiError } from '@/lib/api'
import { toast } from '@/store/useUI'
import { money } from '@/lib/format'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const tileGradient = (hue: number) =>
  `linear-gradient(135deg, hsl(${hue}, 70%, 92%), hsl(${(hue + 40) % 360}, 60%, 86%))`

type FieldKey = 'name' | 'email' | 'line1' | 'city' | 'state' | 'zip'
const FIELD_ORDER: FieldKey[] = ['name', 'email', 'line1', 'city', 'state', 'zip']

export default function StoreCheckout() {
  const { lines, count, subtotal, promo, discount, shipping, taxRate, tax, total } = useCartDetails()
  const clear = useCart((s) => s.clear)
  const setPromo = useCart((s) => s.setPromo)
  const reloadCatalog = useCatalog((s) => s.load)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // Stripe's cancel_url points back here with ?canceled=1 — the cart is intact
  useEffect(() => {
    if (searchParams.get('canceled')) {
      toast('Payment canceled — your cart is right where you left it', { tone: 'default' })
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [form, setForm] = useState({ name: '', email: '', line1: '', city: '', state: '', zip: '', notes: '' })
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [submitting, setSubmitting] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const line1Ref = useRef<HTMLInputElement>(null)
  const cityRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef<HTMLInputElement>(null)
  const zipRef = useRef<HTMLInputElement>(null)
  const refs: Record<FieldKey, RefObject<HTMLInputElement>> = {
    name: nameRef,
    email: emailRef,
    line1: line1Ref,
    city: cityRef,
    state: stateRef,
    zip: zipRef,
  }

  const update =
    (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value
      setForm((f) => ({ ...f, [key]: value }))
      setErrors((er) => (er[key as FieldKey] ? { ...er, [key]: undefined } : er))
    }

  const validate = (): Partial<Record<FieldKey, string>> => {
    const errs: Partial<Record<FieldKey, string>> = {}
    if (!form.name.trim()) errs.name = 'Please enter your full name'
    if (!form.email.trim()) errs.email = 'Please enter your email'
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = 'That doesn’t look like an email address'
    if (!form.line1.trim()) errs.line1 = 'Please enter your street address'
    if (!form.city.trim()) errs.city = 'Required'
    if (!form.state.trim()) errs.state = 'Required'
    if (!form.zip.trim()) errs.zip = 'Required'
    return errs
  }

  const placeOrder = async () => {
    try {
      const res = await api.checkout({
        items: lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, qty: l.item.qty })),
        promoCode: promo?.code,
        contact: { name: form.name.trim(), email: form.email.trim() },
        address: { line1: form.line1.trim(), city: form.city.trim(), state: form.state.trim(), zip: form.zip.trim() },
        notes: form.notes.trim() || undefined,
      })
      if (res.mode === 'stripe') {
        // Keep the cart until payment succeeds — cancel returns the shopper here
        window.location.assign(res.checkoutUrl)
        return
      }
      clear()
      navigate(`/store/confirmation/${res.orderId}`)
    } catch (err) {
      setSubmitting(false)
      if (err instanceof ApiError && err.code === 'promo') {
        setPromo(null)
        toast(err.message, { tone: 'error' })
      } else if (err instanceof ApiError && (err.code === 'stock' || err.code === 'gone')) {
        toast(err.message, { tone: 'error' })
        void reloadCatalog(true) // refresh availability so the cart self-corrects
      } else {
        toast(err instanceof ApiError ? err.message : 'Could not place the order — try again in a moment.', {
          tone: 'error',
        })
      }
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const errs = validate()
    setErrors(errs)
    const firstInvalid = FIELD_ORDER.find((k) => errs[k])
    if (firstInvalid) {
      const el = refs[firstInvalid].current
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    void placeOrder()
  }

  if (lines.length === 0 && !submitting) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<ShoppingBag />}
          title="Your cart is empty"
          description="Add something you love from the shop, then come back to check out."
          action={
            <Link to="/store/shop">
              <Button>Browse the shop</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const placeLabel = submitting ? 'Placing order…' : `Place order · ${money(total)}`

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        to="/store/shop"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Continue shopping
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Checkout</h1>
      <p className="mt-1 text-sm text-ink-3">Almost there — where should we send your order?</p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        {/* Left — form sections */}
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Contact" subtitle="We’ll only use this for order updates" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required error={errors.name}>
                <Input
                  ref={nameRef}
                  value={form.name}
                  onChange={update('name')}
                  autoComplete="name"
                  placeholder="Jamie Rivera"
                />
              </Field>
              <Field label="Email" required error={errors.email}>
                <Input
                  ref={emailRef}
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Shipping address" />
            <div className="space-y-4">
              <Field label="Address line 1" required error={errors.line1}>
                <Input
                  ref={line1Ref}
                  value={form.line1}
                  onChange={update('line1')}
                  autoComplete="address-line1"
                  placeholder="Street address, apt, suite…"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_120px_140px]">
                <Field label="City" required error={errors.city}>
                  <Input
                    ref={cityRef}
                    value={form.city}
                    onChange={update('city')}
                    autoComplete="address-level2"
                    placeholder="Portland"
                  />
                </Field>
                <Field label="State" required error={errors.state}>
                  <Input
                    ref={stateRef}
                    value={form.state}
                    onChange={update('state')}
                    autoComplete="address-level1"
                    placeholder="OR"
                  />
                </Field>
                <Field label="ZIP" required error={errors.zip}>
                  <Input
                    ref={zipRef}
                    value={form.zip}
                    onChange={update('zip')}
                    autoComplete="postal-code"
                    inputMode="numeric"
                    placeholder="97201"
                  />
                </Field>
              </div>
              <p className="text-[13px] text-ink-3">
                Country: <span className="font-medium text-ink-2">United States</span> — we currently ship US-only.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" subtitle="Optional — gift note or delivery instructions" />
            <Textarea
              value={form.notes}
              onChange={update('notes')}
              placeholder="e.g. It’s a gift — please leave the price off the packing slip"
            />
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-ink-3" /> Payment
                </span>
              }
              subtitle="Coming soon"
            />
            <div className="rounded-xl border border-dashed border-edge bg-sunken p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-ink-2">
                <Lock className="h-4 w-4 shrink-0" /> This preview doesn&rsquo;t charge anything.
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                Secure card payment (Stripe) plugs in here when the storefront goes live.
              </p>
              <div className="pointer-events-none mt-3 flex gap-2 opacity-50" aria-hidden>
                <div className="flex h-9 flex-1 items-center rounded-xl border border-edge bg-surface px-3 text-sm text-ink-3">
                  •••• •••• •••• 4242
                </div>
                <div className="flex h-9 w-[88px] items-center rounded-xl border border-edge bg-surface px-3 text-sm text-ink-3">
                  MM / YY
                </div>
                <div className="hidden h-9 w-[72px] items-center rounded-xl border border-edge bg-surface px-3 text-sm text-ink-3 sm:flex">
                  CVC
                </div>
              </div>
            </div>
          </Card>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {placeLabel}
          </Button>
        </div>

        {/* Right — sticky order summary */}
        <aside className="min-w-0 lg:sticky lg:top-20">
          <Card>
            <CardHeader title="Order summary" subtitle={`${count} ${count === 1 ? 'item' : 'items'}`} />
            <ul className="space-y-3">
              {lines.map((l) => (
                <li key={`${l.item.productId}::${l.item.variantId ?? ''}`} className="flex items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl"
                    style={{ background: tileGradient(l.product.imageHue) }}
                    aria-hidden
                  >
                    {l.product.image}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{l.name}</div>
                    <div className="text-xs text-ink-3">
                      {l.item.qty} × {money(l.unitPrice)}
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold text-ink">{money(l.lineTotal)}</div>
                </li>
              ))}
            </ul>

            {promo && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-accent-wash px-2.5 py-1.5 text-xs font-medium text-accent-strong dark:text-accent">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Tag className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {promo.code} · −{promo.discountPct}%
                  </span>
                </span>
                <span className="shrink-0">−{money(discount)}</span>
              </div>
            )}

            <div className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-sm">
              <div className="flex items-center justify-between text-ink-2">
                <span>Subtotal</span>
                <span className="font-medium text-ink">{money(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between font-medium text-[#006300] dark:text-good">
                  <span>Discount</span>
                  <span>−{money(discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-ink-2">
                <span>Shipping</span>
                {shipping === 0 ? (
                  <span className="font-medium text-[#006300] dark:text-good">Free</span>
                ) : (
                  <span className="font-medium text-ink">{money(shipping)}</span>
                )}
              </div>
              <div className="flex items-center justify-between text-ink-2">
                <span>Estimated tax ({taxRate}%)</span>
                <span className="font-medium text-ink">{money(tax)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-hairline pt-2 text-[15px] font-semibold text-ink">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
            </div>
          </Card>

          <Button type="submit" size="lg" className="mt-4 w-full lg:hidden" disabled={submitting}>
            {placeLabel}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-ink-3">
            <Lock className="h-3 w-3" /> Prototype checkout — no payment is collected.
          </p>
        </aside>
      </form>
    </div>
  )
}
