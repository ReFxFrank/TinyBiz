import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { ProductionBatch } from '@/data/types'
import { num } from '@/lib/format'

/**
 * Wrap up a running batch: record good units, failed prints, and waste.
 * Spillover above the planned quantity is allowed.
 */
export function CompleteBatchModal({
  batch,
  onClose,
}: {
  batch: ProductionBatch | null
  onClose: () => void
}) {
  const completeBatch = useStore((s) => s.completeBatch)

  const [produced, setProduced] = useState('0')
  const [failed, setFailed] = useState('0')
  const [waste, setWaste] = useState('0')
  const [wasteTouched, setWasteTouched] = useState(false)

  useEffect(() => {
    if (batch) {
      setProduced(String(batch.quantity))
      setFailed('0')
      setWaste('0')
      setWasteTouched(false)
    }
  }, [batch])

  const producedN = Number(produced)
  const failedN = Number(failed)
  const wasteN = Number(waste)
  const valid =
    produced.trim() !== '' &&
    Number.isFinite(producedN) &&
    producedN >= 0 &&
    Number.isFinite(failedN) &&
    failedN >= 0 &&
    Number.isFinite(wasteN) &&
    wasteN >= 0

  // Waste tracks failed prints (~80g each) until the user edits it directly.
  const onFailedChange = (v: string) => {
    setFailed(v)
    if (!wasteTouched) setWaste(String(Math.max(0, Math.round((Number(v) || 0) * 80))))
  }

  const submit = () => {
    if (!batch || !valid) return
    const good = Math.floor(producedN)
    completeBatch(batch.id, good, Math.max(0, Math.floor(failedN)), Math.max(0, wasteN))
    toast(good > 0 ? `Added ${num(good)} to stock` : 'Batch recorded as failed', {
      tone: 'success',
      description: good > 0 ? `${batch.productName} — stock updated.` : undefined,
    })
    onClose()
  }

  return (
    <Modal
      open={Boolean(batch)}
      onClose={onClose}
      title="Complete batch"
      description={batch ? `${batch.productName} · planned ${num(batch.quantity)} on ${batch.machineName}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Complete batch
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Good units" required hint="Added to product stock.">
          <Input
            type="number"
            min={0}
            value={produced}
            onChange={(e) => setProduced(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Failed prints">
          <Input type="number" min={0} value={failed} onChange={(e) => onFailedChange(e.target.value)} />
        </Field>
        <Field label="Waste (grams)" hint="Defaults to ~80g per failed print." className="sm:col-span-2">
          <Input
            type="number"
            min={0}
            value={waste}
            onChange={(e) => {
              setWaste(e.target.value)
              setWasteTouched(true)
            }}
          />
        </Field>
      </div>
    </Modal>
  )
}
