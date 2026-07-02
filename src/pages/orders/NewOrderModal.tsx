import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, IconButton, Input, Modal, Select, Textarea, Toggle } from '@/components/ui'
import { useStore } from '@/store/useStore'
import type { Customer, Order, OrderItem, SalesChannel } from '@/data/types'
import { money } from '@/lib/format'
import { addDays, dayKey } from '@/lib/dates'
import { nextOrderNumber } from '@/lib/metrics'
import { sum, uid } from '@/lib/utils'
import { toast } from '@/store/useUI'

const CHANNELS: SalesChannel[] = ['Etsy', 'Shopify', 'Website', 'Market', 'Amazon']

interface Line {
  key: string
  productId: string
  quantity: number
}

const emptyLine = (): Line => ({ key: uid('line'), productId: '', quantity: 1 })

export default function NewOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const customers = useStore((s) => s.customers)
  const products = useStore((s) => s.products)
  const orders = useStore((s) => s.orders)
  const settings = useStore((s) => s.settings)
  const addItem = useStore((s) => s.addItem)

  const [customerId, setCustomerId] = useState('')
  const [newCustomer, setNewCustomer] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [channel, setChannel] = useState<SalesChannel>('Etsy')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [shippingCharged, setShippingCharged] = useState('4.99')
  const [shippingCost, setShippingCost] = useState('5.50')
  const [shipBy, setShipBy] = useState(() => dayKey(addDays(new Date(), 4)))
  const [notes, setNotes] = useState('')

  // Fresh form each time the modal opens
  useEffect(() => {
    if (open) {
      setCustomerId('')
      setNewCustomer(false)
      setNewName('')
      setNewEmail('')
      setChannel('Etsy')
      setLines([emptyLine()])
      setShippingCharged('4.99')
      setShippingCost('5.50')
      setShipBy(dayKey(addDays(new Date(), 4)))
      setNotes('')
    }
  }, [open])

  const setLine = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const validLines = useMemo(
    () =>
      lines
        .filter((l) => l.productId && l.quantity >= 1)
        .map((l) => ({ line: l, product: products.find((p) => p.id === l.productId)! }))
        .filter((x) => x.product),
    [lines, products],
  )

  const itemsTotal = sum(validLines.map((x) => x.product.price * x.line.quantity))
  const tax = (itemsTotal * settings.taxRate) / 100
  const shipCharged = Number(shippingCharged) || 0
  const grandTotal = itemsTotal + shipCharged + tax

  const customerValid = newCustomer ? newName.trim().length > 0 && /\S+@\S+\.\S+/.test(newEmail) : Boolean(customerId)
  const canSubmit = customerValid && validLines.length > 0 && Boolean(shipBy)

  const submit = () => {
    if (!canSubmit) return

    let customer: Customer
    if (newCustomer) {
      customer = {
        id: uid('cus'),
        name: newName.trim(),
        email: newEmail.trim(),
        tags: [],
        createdAt: new Date().toISOString(),
      }
      addItem('customers', customer)
    } else {
      const found = customers.find((c) => c.id === customerId)
      if (!found) return
      customer = found
    }

    // Merge lines that reference the same product so items carry unique productIds
    const merged = new Map<string, OrderItem>()
    for (const { line, product } of validLines) {
      const existing = merged.get(product.id)
      if (existing) existing.quantity += line.quantity
      else
        merged.set(product.id, {
          productId: product.id,
          name: product.name,
          quantity: line.quantity,
          unitPrice: product.price,
          unitCost: product.cost,
        })
    }
    const items: OrderItem[] = [...merged.values()]

    const order: Order = {
      id: uid('ord'),
      number: nextOrderNumber(orders),
      customerId: customer.id,
      customerName: customer.name,
      email: customer.email,
      status: 'New',
      channel,
      items,
      shippingCost: Number(shippingCost) || 0,
      shippingCharged: shipCharged,
      taxCollected: Number(tax.toFixed(2)),
      shippingAddress: customer.address ?? { line1: '', city: '', state: '', zip: '', country: 'US' },
      notes: notes.trim() || undefined,
      placedAt: new Date().toISOString(),
      shipBy: new Date(`${shipBy}T17:00:00`).toISOString(),
    }
    addItem('orders', order)
    toast(`Order ${order.number} created`, { tone: 'success', description: `${customer.name} · ${money(grandTotal)}` })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New order"
      description="Record a sale and it flows straight into fulfillment."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Create order · {money(grandTotal)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink-2">Customer</span>
            <Toggle checked={newCustomer} onChange={setNewCustomer} label="New customer" className="gap-2" />
          </div>
          {newCustomer ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jamie Rivera" />
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jamie@example.com"
                />
              </Field>
            </div>
          ) : (
            <Select
              aria-label="Customer"
              placeholder="Choose a customer…"
              options={customers.map((c) => ({ value: c.id, label: `${c.name} — ${c.email}` }))}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            />
          )}
        </div>

        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Items</div>
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <Select
                  aria-label="Product"
                  placeholder="Choose a product…"
                  options={products
                    .filter((p) => p.active)
                    .map((p) => ({ value: p.id, label: `${p.name} — ${money(p.price)}` }))}
                  value={line.productId}
                  onChange={(e) => setLine(line.key, { productId: e.target.value })}
                  className="min-w-0 flex-1"
                />
                <Input
                  aria-label="Quantity"
                  type="number"
                  min={1}
                  className="w-20"
                  value={line.quantity}
                  onChange={(e) => setLine(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
                <IconButton
                  label="Remove item"
                  size="sm"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                >
                  <Trash2 />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              Add item
            </Button>
            <span className="text-[13px] text-ink-3">
              Items total <span className="tnum font-semibold text-ink">{money(itemsTotal)}</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Channel">
            <Select
              options={CHANNELS}
              value={channel}
              onChange={(e) => setChannel(e.target.value as SalesChannel)}
            />
          </Field>
          <Field label="Shipping charged">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={shippingCharged}
              onChange={(e) => setShippingCharged(e.target.value)}
            />
          </Field>
          <Field label="Shipping cost" hint="What you pay the carrier">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Ship by" required>
          <Input type="date" value={shipBy} onChange={(e) => setShipBy(e.target.value)} />
        </Field>

        <Field label="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gift wrap, color requests, rush shipping…"
            rows={2}
          />
        </Field>

        <div className="rounded-xl bg-sunken/60 px-4 py-3 text-sm">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-ink-3">Items</span>
            <span className="tnum font-medium text-ink">{money(itemsTotal)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-ink-3">Shipping</span>
            <span className="tnum font-medium text-ink">{money(shipCharged)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-ink-3">Tax ({settings.taxRate}%)</span>
            <span className="tnum font-medium text-ink">{money(tax)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-hairline pt-1.5">
            <span className="font-medium text-ink">Total</span>
            <span className="tnum font-semibold text-ink">{money(grandTotal)}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
