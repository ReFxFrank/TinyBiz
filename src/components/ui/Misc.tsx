import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Keyboard shortcut chip */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-edge bg-sunken px-1.5',
        'font-sans text-[11px] font-medium text-ink-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export interface AvatarProps {
  name: string
  /** Hue 0–360 for the tile background; derived from name when omitted */
  hue?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** Initials avatar on a soft hue tile */
export function Avatar({ name, hue, size = 'md', className }: AvatarProps) {
  const h = hue ?? [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
        size === 'sm' && 'h-7 w-7 text-[11px]',
        size === 'md' && 'h-9 w-9 text-[13px]',
        size === 'lg' && 'h-12 w-12 text-base',
        className,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${h} 65% 88%), hsl(${(h + 40) % 360} 60% 82%))`,
        color: `hsl(${h} 55% 30%)`,
      }}
    >
      {initials}
    </span>
  )
}

/** Emoji product artwork on a soft gradient tile */
export function ProductTile({
  emoji,
  hue,
  size = 'md',
  className,
}: {
  emoji: string
  hue: number
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-xl',
        size === 'sm' && 'h-8 w-8 text-base',
        size === 'md' && 'h-10 w-10 text-xl',
        size === 'lg' && 'h-14 w-14 text-3xl',
        size === 'xl' && 'h-24 w-24 text-5xl rounded-2xl',
        className,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 92%), hsl(${(hue + 45) % 360} 65% 85%))`,
      }}
    >
      {emoji}
    </span>
  )
}

const RANK_MEDALS = ['👑', '🥈', '🥉']
const RANK_TITLES = ['Top seller', '2nd best seller', '3rd best seller']

/** Crown / medal for the top three ranks (0-indexed). Renders nothing past #3. */
export function RankMedal({ rank, className }: { rank: number; className?: string }) {
  if (rank < 0 || rank > 2) return null
  return (
    <span className={cn('select-none leading-none', className)} title={RANK_TITLES[rank]} role="img" aria-label={RANK_TITLES[rank]}>
      {RANK_MEDALS[rank]}
    </span>
  )
}

/** Product artwork tile with a crown/medal overlay for top-ranked sellers */
export function RankedProductTile({
  emoji,
  hue,
  rank,
  size = 'sm',
}: {
  emoji: string
  hue: number
  rank: number
  size?: 'sm' | 'md' | 'lg'
}) {
  if (rank < 0 || rank > 2) return <ProductTile emoji={emoji} hue={hue} size={size} />
  return (
    <span className="relative inline-flex shrink-0">
      <ProductTile emoji={emoji} hue={hue} size={size} />
      <RankMedal
        rank={rank}
        className="absolute -right-1.5 -top-1.5 text-[13px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
      />
    </span>
  )
}

/** Section label used inside drawers/detail views */
export function DetailLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{children}</div>
}

/** Definition row: label left, value right */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  )
}
