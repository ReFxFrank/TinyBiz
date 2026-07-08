// Slide-over cart — reads open state from the cart store so any page can open
// it. Line items with qty steppers, promo codes, a free-shipping nudge, and an
// itemized totals block that hands off to checkout.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, ShoppingBag, Tag, X } from 'lucide-react'
import { Button, Drawer, EmptyState, Input, Progress } from '@/components/ui'
import { useCart, useCartDetails } from '@/store/useCart'
import { api } from '@/lib/api'
import { money } from '@/lib/format'

const tileGradient = (hue: number) =>
  `linear-gradient(135deg, hsl(${hue}, 70%, 92%), hsl(${(hue + 40) % 360}, 60%, 86%))`

export function CartDrawer() {
  const open = useCart((s) => s.drawerOpen)
  const setOpen = useCart((s) => s.setDrawerOpen)
  const setQty = useCart((s) => s.setQty)
  const remove = useCart((s) => s.remove)
  const setPromo = useCart((s) => s.setPromo)
  const { lines, count, subtotal, promo, discount, shipping, freeShippingThreshold, taxRate, tax, total } =
    useCartDetails()
  const navigate = useNavigate()
  const [codeInput, setCodeInput] = useState('')
  const [promoError, setPromoError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  const afterDiscount = subtotal - discount
  const remaining = freeShippingThreshold - afterDiscount

  // The server owns promo validity; keep the typed code on rejection so the
  // shopper can fix a typo instead of retyping.
  const applyCode = async () => {
    const code = codeInput.trim()
    if (!code || applying) return
    setApplying(true)
    setPromoError(null)
    try {
      const res = await api.promo(code)
      if (res.valid && res.code && res.discountPct != null) {
        setPromo({ code: res.code, discountPct: res.discountPct })
        setCodeInput('')
      } else {
        setPromoError('That code isn\u2019t valid or has expired')
      }
    } catch {
      setPromoError('Could not check that code — try again in a moment')
    } finally {
      setApplying(false)
    }
  }

  const goToCheckout = () => {
    setOpen(false)
    navigate('/checkout')
  }

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title="Your cart"
      subtitle={count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : undefined}
      footer={
        lines.length > 0 ? (
          <div className="w-full space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-ink-2">
                <span>Subtotal</span>
                <span className="font-medium text-ink">{money(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between font-medium text-[#006300] dark:text-good">
                  <span>Discount{promo ? ` (${promo.code})` : ''}</span>
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
            <Button size="lg" className="w-full" onClick={goToCheckout}>
              Checkout
            </Button>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag />}
          title="Your cart is empty"
          description="Browse the shop and add something you love."
          action={
            <Link to="/shop" onClick={() => setOpen(false)}>
              <Button variant="secondary">Browse the shop</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* Free shipping nudge */}
          <div className="rounded-xl bg-sunken px-3.5 py-3">
            {remaining > 0 ? (
              <>
                <div className="text-[13px] font-medium text-ink">
                  You&rsquo;re <span className="font-semibold">{money(remaining)}</span> away from free shipping
                </div>
                <Progress
                  className="mt-2"
                  value={(afterDiscount / freeShippingThreshold) * 100}
                  label="Progress toward free shipping"
                />
              </>
            ) : (
              <div className="text-[13px] font-medium text-ink">🎉 You&rsquo;ve unlocked free shipping</div>
            )}
          </div>

          {/* Line items */}
          <ul className="space-y-4">
            {lines.map((l) => {
              const stock = l.available
              const atMax = l.item.qty >= stock
              return (
                <li key={`${l.item.productId}::${l.item.variantId ?? ''}`} className="flex gap-3">
                  {l.product.photos?.[0] ? (
                    <img
                      src={l.product.photos[0]}
                      alt={l.product.name}
                      loading="lazy"
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-3xl"
                      style={{ background: tileGradient(l.product.imageHue) }}
                      aria-hidden
                    >
                      {l.product.image}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/product/${l.product.id}`}
                          onClick={() => setOpen(false)}
                          className="block truncate text-sm font-medium text-ink hover:underline"
                        >
                          {l.name}
                        </Link>
                        <div className="mt-0.5 text-xs text-ink-3">{money(l.unitPrice)} each</div>
                      </div>
                      <button
                        onClick={() => remove(l.item.productId, l.item.variantId)}
                        aria-label={`Remove ${l.name} from cart`}
                        className="shrink-0 rounded-md p-1 text-ink-3 transition-colors hover:bg-sunken hover:text-critical"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-lg border border-edge">
                        <button
                          onClick={() => setQty(l.item.productId, l.item.variantId, l.item.qty - 1)}
                          disabled={l.item.qty <= 1}
                          aria-label={`Decrease quantity of ${l.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-l-lg text-ink-2 transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-[13px] font-semibold tabular-nums text-ink">
                          {l.item.qty}
                        </span>
                        <button
                          onClick={() => setQty(l.item.productId, l.item.variantId, Math.min(stock, l.item.qty + 1))}
                          disabled={atMax}
                          aria-label={`Increase quantity of ${l.name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-r-lg text-ink-2 transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-sm font-semibold text-ink">{money(l.lineTotal)}</div>
                    </div>
                    {atMax && (
                      <div className="mt-1 text-[11px] font-medium text-[#8a6100] dark:text-warn">
                        {l.item.qty > stock
                          ? `Only ${stock} left in stock — we'll adjust this at checkout`
                          : `Only ${stock} in stock`}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Promo code */}
          <div className="border-t border-hairline pt-4">
            {promo ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-accent-wash px-3 py-2">
                <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-accent-strong dark:text-accent">
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    <span className="font-semibold">{promo.code}</span> · −{promo.discountPct}% · saving{' '}
                    {money(discount)}
                  </span>
                </div>
                <button
                  onClick={() => setPromo(null)}
                  className="shrink-0 text-xs font-medium text-ink-3 underline underline-offset-2 hover:text-ink"
                >
                  Remove
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void applyCode()
                }}
                className="flex gap-2"
              >
                <Input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Promo code — try SUMMER15"
                  aria-label="Promo code"
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" disabled={!codeInput.trim() || applying}>
                  {applying ? 'Checking…' : 'Apply'}
                </Button>
              </form>
            )}
            <div aria-live="polite">
              {promoError && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-critical">
                  <span>{promoError}</span>
                  <button
                    onClick={() => {
                      setPromoError(null)
                      setCodeInput('')
                    }}
                    className="font-medium underline underline-offset-2 hover:opacity-80"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}
