import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton } from '@/components/ui/Button'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  /** Footer actions; when omitted the body controls its own buttons */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

/** Centered dialog on Radix (focus trap, ARIA, Esc/outside-close) with Framer Motion enter/exit */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <motion.div
                  className={cn(
                    'pointer-events-auto flex max-h-[90vh] w-full flex-col rounded-2xl border border-edge bg-raised shadow-lifted',
                    size === 'sm' && 'max-w-sm',
                    size === 'md' && 'max-w-lg',
                    size === 'lg' && 'max-w-2xl',
                  )}
                  initial={{ y: 16, scale: 0.98 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: 8, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-4">
                    <div>
                      <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
                      {description && (
                        <Dialog.Description className="mt-0.5 text-[13px] text-ink-3">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    <Dialog.Close asChild>
                      <IconButton label="Close" size="sm">
                        <X />
                      </IconButton>
                    </Dialog.Close>
                  </div>
                  <div className="overflow-y-auto px-5 py-4">{children}</div>
                  {footer && <div className="flex justify-end gap-2 border-t border-edge px-5 py-3.5">{footer}</div>}
                </motion.div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{description ?? 'Are you sure? This cannot be undone.'}</p>
    </Modal>
  )
}
