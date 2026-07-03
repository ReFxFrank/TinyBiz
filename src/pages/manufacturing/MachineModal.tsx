import { useEffect, useState } from 'react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { toast } from '@/store/useUI'
import type { Machine } from '@/data/types'
import { uid } from '@/lib/utils'

const STATUSES: Machine['status'][] = ['Idle', 'Printing', 'Maintenance']

/** Create or edit a machine (printer). */
export function MachineModal({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing: Machine | null
}) {
  const addItem = useStore((s) => s.addItem)
  const updateItem = useStore((s) => s.updateItem)

  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [status, setStatus] = useState<Machine['status']>('Idle')
  const [hours, setHours] = useState('0')
  const [syncId, setSyncId] = useState('')

  useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setModel(editing.model)
      setStatus(editing.status)
      setHours(String(Math.round(editing.hoursLogged)))
      setSyncId(editing.syncId ?? '')
    } else {
      setName('')
      setModel('')
      setStatus('Idle')
      setHours('0')
      setSyncId('')
    }
  }, [open, editing])

  const valid = name.trim().length > 0 && model.trim().length > 0

  const submit = () => {
    if (!valid) return
    const patch = {
      name: name.trim(),
      model: model.trim(),
      status,
      hoursLogged: Math.max(0, Number(hours) || 0),
      syncId: syncId.trim() || undefined,
    }
    if (editing) {
      updateItem('machines', editing.id, patch)
      toast('Machine updated', { tone: 'success' })
    } else {
      addItem('machines', { id: uid('mac'), ...patch })
      toast('Machine added', { tone: 'success' })
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit machine' : 'Add machine'}
      description={editing ? undefined : 'Add a printer or machine to your shop floor.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid}>
            {editing ? 'Save changes' : 'Add machine'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. Printer D — "Speedy"' autoFocus />
        </Field>
        <Field label="Model" required>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Bambu Lab P1S" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Machine['status'])} options={STATUSES} />
          </Field>
          <Field label="Hours logged" hint="Lifetime print hours.">
            <Input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
        </div>
        <Field
          label="Live sync ID"
          hint="Printer serial from your bridge — enables live status sync. Leave blank for manual only."
        >
          <Input value={syncId} onChange={(e) => setSyncId(e.target.value)} placeholder="e.g. 01P00A1234567890" className="font-mono" />
        </Field>
      </div>
    </Modal>
  )
}
