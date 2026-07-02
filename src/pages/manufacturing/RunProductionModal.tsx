import { useEffect, useState } from 'react'
import { Button, Field, Modal, Input, Select, Textarea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import { num } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Kick off a production batch from a recipe. Shows a live material-requirement
 * preview against current stock and blocks the run when anything is short.
 */
export function RunProductionModal({
  open,
  onClose,
  initialRecipeId,
}: {
  open: boolean
  onClose: () => void
  /** Preselect a recipe (e.g. launched from a recipe card) */
  initialRecipeId?: string | null
}) {
  const recipes = useStore((s) => s.recipes)
  const machines = useStore((s) => s.machines)
  const materials = useStore((s) => s.materials)
  const startBatch = useStore((s) => s.startBatch)

  const [recipeId, setRecipeId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [machineId, setMachineId] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    const s = useStore.getState()
    const recipe = (initialRecipeId && s.recipes.find((r) => r.id === initialRecipeId)) || s.recipes[0]
    setRecipeId(recipe?.id ?? '')
    setQuantity(String(Math.max(1, recipe?.outputQty ?? 1)))
    setMachineId(s.machines.find((m) => m.status === 'Idle')?.id ?? '')
    setNotes('')
  }, [open, initialRecipeId])

  const idleMachines = machines.filter((m) => m.status === 'Idle')
  const recipe = recipes.find((r) => r.id === recipeId)
  const qtyN = Math.floor(Number(quantity) || 0)

  const requirements = (recipe?.lines ?? []).map((line) => {
    const material = materials.find((m) => m.id === line.materialId)
    const need = line.quantity * Math.max(0, qtyN)
    const stock = material?.stock ?? 0
    return { line, material, need, stock, short: Math.max(0, need - stock) }
  })
  const anyShort = requirements.some((r) => r.short > 0 || !r.material)

  const valid = Boolean(recipe) && qtyN >= 1 && machineId !== '' && !anyShort

  const submit = () => {
    if (!valid || !recipe) return
    const machine = machines.find((m) => m.id === machineId)
    const batch = startBatch(recipe.id, qtyN, machineId, notes.trim() || undefined)
    if (batch) {
      toast(`Batch started on ${machine?.name ?? 'printer'}`, {
        tone: 'success',
        description: `${batch.productName} ×${num(qtyN)} — materials deducted from inventory.`,
      })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run production"
      description="Queue a batch on a printer. Materials are committed up front."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            Start batch
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Recipe" required className="sm:col-span-2">
          <Select
            value={recipeId}
            onChange={(e) => {
              setRecipeId(e.target.value)
              const next = recipes.find((r) => r.id === e.target.value)
              if (next) setQuantity(String(Math.max(1, next.outputQty)))
            }}
            placeholder="Select a recipe"
            options={recipes.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <Field label="Quantity" required hint="Units to produce.">
          <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field
          label="Machine"
          hint={idleMachines.length === 0 ? 'All printers are busy — free one up to start a run.' : 'Only idle printers are listed.'}
        >
          <Select
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
            placeholder={idleMachines.length === 0 ? 'No idle printers' : 'Select a printer'}
            disabled={idleMachines.length === 0}
            options={idleMachines.map((m) => ({ value: m.id, label: `${m.name} — ${m.model}` }))}
          />
        </Field>

        {recipe && qtyN >= 1 && (
          <div className="rounded-xl border border-hairline bg-sunken/50 p-3.5 sm:col-span-2">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Materials needed
            </div>
            <ul className="space-y-1.5">
              {requirements.map(({ line, material, need, stock, short }) => (
                <li
                  key={line.materialId}
                  className={cn(
                    'flex items-center justify-between gap-3 text-[13px]',
                    short > 0 || !material ? 'text-critical' : 'text-ink-2',
                  )}
                >
                  <span className="min-w-0 truncate">{material?.name ?? 'Unknown material'}</span>
                  <span className="tnum shrink-0">
                    {num(need)} {material?.unit ?? ''} of {num(stock)} on hand
                    {short > 0 && (
                      <span className="font-semibold">
                        {' '}
                        · short by {num(short)} {material?.unit ?? ''}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs text-ink-3">
              Starting the batch deducts these materials from inventory immediately.
            </p>
          </div>
        )}

        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Nozzle, filament color, client run…"
          />
        </Field>
      </div>
    </Modal>
  )
}
