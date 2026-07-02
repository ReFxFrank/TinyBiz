import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

/** Grid of stat-tile placeholders */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-2.5 h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Chart-card placeholder */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn('card p-5', className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-1.5 h-3 w-24" />
      <Skeleton className="mt-5 h-[220px] w-full rounded-xl" />
    </div>
  )
}

/** Table placeholder */
export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-edge bg-sunken/50 px-4 py-3">
        <Skeleton className="h-3.5 w-full max-w-md" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 border-b border-hairline px-4 py-3.5 last:border-0">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="hidden h-4 w-1/5 sm:block" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
