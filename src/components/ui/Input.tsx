import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const baseField =
  'w-full rounded-xl border border-edge bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ' +
  'transition-shadow duration-150 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-transparent ' +
  'disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(baseField, 'h-9', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(baseField, 'py-2 resize-none', className)} {...rest} />
  },
)

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string } | string>
  /** Optional first row like "All statuses" mapped to empty string */
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(baseField, 'h-9 appearance-none pr-8 cursor-pointer')} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
    </div>
  )
})

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string
}

/** Text input with a leading search glyph — the standard table filter box */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, containerClassName, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input ref={ref} type="search" className={cn(baseField, 'h-9 pl-9', className)} {...rest} />
    </div>
  )
})

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}

/** Label + control + hint/error wrapper for forms */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-critical">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-critical">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-3">{hint}</span>
      ) : null}
    </label>
  )
}
