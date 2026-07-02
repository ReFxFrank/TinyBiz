import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Field, IconButton, Input, Modal, Select } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Recipe } from '@/data/types'
import { minutesToHours, money } from '@/lib/format'
import { sum, uid } from '@/lib/utils'

interface LineDraft {
  /** Stable key for the row while editing — controlled inputs survive removals */
  key: string
  materialId: string
  quantity: string
}

/** Create or edit a bill of materials for a product. */
export function RecipeModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Recipe | null
}) {
  const products = useStore((s) => s.products)
  const materials = useStore((s) => s.materials)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)

  const [name, setName] = useState('')
  const [productId, setProductId] = useState('')
  const [outputQty, setOutputQty] = useState('1')
  const [printTimeMin, setPrintTimeMin] = useState('60')
  const [lines, setLines] = useState<LineDraft[]>([])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setProductId(editing.productId)
      setOutputQty(String(editing.outputQty))
      setPrintTimeMin(String(editing.printTimeMin))
      setLines(editing.lines.map((l) => ({ key: uid('line'), materialId: l.materialId, quantity: String(l.quantity) })))
    } else {
      setName('')
      setProductId('')
      setOutputQty('1')
      setPrintTimeMin('60')
      setLines([{ key: uid('line'), materialId: '', quantity: '1' }])
    }
  }, [open, editing])

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i))
  const addLine = () => setLines((ls) => [...ls, { key: uid('line'), materialId: '', quantity: '1' }])

  const materialsCost = sum(
    lines.map((l) => {
      const mat = materials.find((m) => m.id === l.materialId)
      return mat ? Math.max(0, Number(l.quantity) || 0) * mat.costPerUnit : 0
    }),
  )

  const linesValid =
    lines.length > 0 && lines.every((l) => l.materialId && Number.isFinite(Number(l.quantity)) && Number(l.quantity) > 0)
  const valid = name.trim().length > 0 && productId !== '' && linesValid

  const submit = () => {
    if (!valid) return
    const patch = {
      name: name.trim(),
      productId,
      outputQty: Math.max(1, Math.floor(Number(outputQty) || 1)),
      printTimeMin: Math.max(0, Number(printTimeMin) || 0),
      lines: lines.map((l) => ({ materialId: l.materialId, quantity: Number(l.quantity) })),
    }
    if (editing) {
      updateItem('recipes', editing.id, patch)
      // Re-linking to a different product must clear the old product's BOM link
      if (editing.productId !== productId) {
        updateItem('products', editing.productId, { recipeId: undefined })
      }
      updateItem('products', productId, { recipeId: editing.id })
      toast('Recipe updated', { tone: 'success' })
    } else {
      const id = uid('rcp')
      addItem('recipes', { id, ...patch })
      updateItem('products', productId, { recipeId: id })
      toast('Recipe created', { tone: 'success' })
    }
    onClose()
  }

  const printMin = Math.max(0, Number(printTimeMin) || 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit recipe' : 'New recipe'}
      description="The bill of materials a production run deducts from inventory."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Create recipe'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Recipe name" required className="sm:col-span-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dragon figurine — standard"
            autoFocus
          />
        </Field>
        <Field label="Product" required className="sm:col-span-2">
          <Select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="Select a product"
            options={products.map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }))}
          />
        </Field>
        <Field label="Output quantity" hint="Units made per run of this recipe.">
          <Input type="number" min={1} value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
        </Field>
        <Field label="Print time (minutes)">
          <Input type="number" min={0} value={printTimeMin} onChange={(e) => setPrintTimeMin(e.target.value)} />
        </Field>

        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-ink-2">
            Materials
            <span className="text-critical">*</span>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={line.key} className="flex items-center gap-2">
                <Select
                  aria-label={`Material for line ${i + 1}`}
                  className="min-w-0 flex-1"
                  value={line.materialId}
                  onChange={(e) => setLine(i, { materialId: e.target.value })}
                  placeholder="Select material"
                  options={materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }))}
                />
                <Input
                  aria-label={`Quantity for line ${i + 1}`}
                  type="number"
                  min={0}
                  step="any"
                  className="w-24"
                  value={line.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                />
                <IconButton
                  label={`Remove material line ${i + 1}`}
                  size="sm"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(i)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" icon={<Plus />} className="mt-2" onClick={addLine}>
            Add material
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-sunken px-3.5 py-2.5 text-sm sm:col-span-2">
          <span className="text-ink-3">Materials cost per run</span>
          <span className="tnum font-semibold text-ink">
            {money(materialsCost)}
            <span className="ml-2 font-normal text-ink-3">· {minutesToHours(printMin)} print</span>
          </span>
        </div>
      </div>
    </Modal>
  )
}
