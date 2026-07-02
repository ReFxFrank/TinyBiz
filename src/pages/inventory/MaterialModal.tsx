import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Material, MaterialCategory, MaterialUnit } from '@/data/types'
import { uid } from '@/lib/utils'

const CATEGORIES: MaterialCategory[] = [
  'Filament',
  'Packaging',
  'Stickers',
  'Boxes',
  'Shipping supplies',
  'Components',
  'Inserts',
]

const UNITS: MaterialUnit[] = ['g', 'pcs', 'm', 'sheets']

export interface MaterialModalProps {
  open: boolean
  /** When set, the modal edits this material instead of creating one */
  material: Material | null
  onClose: () => void
}

/** Create/edit modal for raw materials */
export default function MaterialModal({ open, material, onClose }: MaterialModalProps) {
  const suppliers = useStore((s) => s.suppliers)
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState<MaterialCategory>('Filament')
  const [unit, setUnit] = useState<MaterialUnit>('g')
  const [stock, setStock] = useState('')
  const [reorderPoint, setReorderPoint] = useState('')
  const [costPerUnit, setCostPerUnit] = useState('')
  const [supplierId, setSupplierId] = useState('')

  // (Re)fill the form when the modal opens
  useEffect(() => {
    if (open) {
      setName(material?.name ?? '')
      setSku(material?.sku ?? '')
      setCategory(material?.category ?? 'Filament')
      setUnit(material?.unit ?? 'g')
      setStock(material ? String(material.stock) : '')
      setReorderPoint(material ? String(material.reorderPoint) : '')
      setCostPerUnit(material ? String(material.costPerUnit) : '')
      setSupplierId(material?.supplierId ?? '')
    }
  }, [open, material])

  const stockNum = Number(stock)
  const reorderNum = Number(reorderPoint)
  const costNum = Number(costPerUnit)
  const valid =
    name.trim().length > 0 &&
    sku.trim().length > 0 &&
    stock !== '' &&
    Number.isFinite(stockNum) &&
    stockNum >= 0 &&
    reorderPoint !== '' &&
    Number.isFinite(reorderNum) &&
    reorderNum >= 0 &&
    costPerUnit !== '' &&
    Number.isFinite(costNum) &&
    costNum >= 0

  const submit = () => {
    if (!valid) return
    const patch = {
      name: name.trim(),
      sku: sku.trim(),
      category,
      unit,
      stock: stockNum,
      reorderPoint: reorderNum,
      costPerUnit: costNum,
      supplierId: supplierId || undefined,
    }
    if (material) {
      updateItem('materials', material.id, patch)
      toast('Material updated', { description: `${patch.name} saved.`, tone: 'success' })
    } else {
      addItem('materials', { id: uid('mat'), createdAt: new Date().toISOString(), ...patch })
      toast('Material added', { description: `${patch.name} is now in inventory.`, tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={material ? 'Edit material' : 'Add material'}
      description={material ? material.sku : 'Track a new raw material or supply.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {material ? 'Save changes' : 'Add material'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PLA Filament — Galaxy Purple" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" required>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="MAT-PLA-014" />
          </Field>
          <Field label="Category" required>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as MaterialCategory)}
              options={CATEGORIES}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unit" required>
            <Select value={unit} onChange={(e) => setUnit(e.target.value as MaterialUnit)} options={UNITS} />
          </Field>
          <Field label="Cost per unit" required>
            <Input
              type="number"
              min={0}
              step="any"
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(e.target.value)}
              placeholder="0.02"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock on hand" required>
            <Input type="number" min={0} step="any" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Reorder at" required hint="Alert when stock falls to this level">
            <Input
              type="number"
              min={0}
              step="any"
              value={reorderPoint}
              onChange={(e) => setReorderPoint(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <Field label="Supplier">
          <Select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            placeholder="No supplier"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
      </div>
    </Modal>
  )
}
