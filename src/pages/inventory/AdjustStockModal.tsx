import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { AdjustmentReason } from '@/data/types'
import { num } from '@/lib/format'

export interface AdjustTarget {
  type: 'product' | 'material'
  id: string
  /** Pre-select a reason (e.g. "Damaged" for the record-damaged shortcut) */
  presetReason?: AdjustmentReason
}

const REASONS: AdjustmentReason[] = ['Recount', 'Damaged', 'Lost', 'Production', 'Return', 'Received', 'Manual']

/** Reasons that almost always mean stock going down */
const REMOVE_REASONS: AdjustmentReason[] = ['Damaged', 'Lost']

export default function AdjustStockModal({ target, onClose }: { target: AdjustTarget | null; onClose: () => void }) {
  const products = useStore((s) => s.products)
  const materials = useStore((s) => s.materials)
  const adjustStock = useStore((s) => s.adjustStock)

  const item = useMemo(() => {
    if (!target) return null
    return target.type === 'product'
      ? (products.find((p) => p.id === target.id) ?? null)
      : (materials.find((m) => m.id === target.id) ?? null)
  }, [target, products, materials])

  const unit = target?.type === 'material' && item && 'unit' in item ? item.unit : ''

  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState<AdjustmentReason>('Recount')
  const [notes, setNotes] = useState('')

  // Reset the form each time the modal opens for a (possibly different) item
  useEffect(() => {
    if (target) {
      setDirection(target.presetReason && REMOVE_REASONS.includes(target.presetReason) ? 'remove' : 'add')
      setQty('')
      setReason(target.presetReason ?? 'Recount')
      setNotes('')
    }
  }, [target])

  const qtyNum = Number(qty)
  const valid = Number.isFinite(qtyNum) && qtyNum > 0
  const delta = valid ? (direction === 'remove' ? -qtyNum : qtyNum) : 0
  const newLevel = item ? Math.max(0, item.stock + delta) : 0

  const submit = () => {
    if (!target || !item || !valid) return
    adjustStock(target.type, target.id, delta, reason, notes.trim() || undefined)
    toast('Stock updated', {
      description: `${item.name} is now at ${num(newLevel)}${unit ? ` ${unit}` : ''}.`,
      tone: 'success',
    })
    onClose()
  }

  return (
    <Modal
      open={Boolean(target && item)}
      onClose={onClose}
      title="Adjust stock"
      description={item ? item.name : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Save adjustment
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-sunken px-4 py-3 text-sm">
            <span className="text-ink-3">Current stock</span>
            <span className="tnum font-semibold text-ink">
              {num(item.stock)}
              {unit ? ` ${unit}` : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction" required>
              <Select
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}
                options={[
                  { value: 'add', label: 'Add' },
                  { value: 'remove', label: 'Remove' },
                ]}
              />
            </Field>
            <Field label="Quantity" required>
              <Input
                type="number"
                min={0}
                step="any"
                placeholder="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Reason" required>
            <Select value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} options={REASONS} />
          </Field>

          <Field label="Notes" hint="Optional — why the level changed">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Shelf recount after the market weekend" />
          </Field>

          {valid && (
            <p className="text-[13px] text-ink-3">
              New level will be{' '}
              <span className="tnum font-semibold text-ink">
                {num(newLevel)}
                {unit ? ` ${unit}` : ''}
              </span>
              {item.stock + delta < 0 && ' (stock cannot go below zero)'}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
