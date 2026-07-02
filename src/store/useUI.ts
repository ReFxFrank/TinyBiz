import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/utils'

export type Theme = 'light' | 'dark' | 'system'

/** Accent color themes the user can pick in Settings → Appearance */
export const ACCENTS = ['nova', 'violet', 'emerald', 'rose', 'amber', 'teal'] as const
export type Accent = (typeof ACCENTS)[number]

export const ACCENT_META: Record<Accent, { label: string; swatch: string }> = {
  nova: { label: 'Nova Blue', swatch: '#2a78d6' },
  violet: { label: 'Violet', swatch: '#7c3aed' },
  emerald: { label: 'Emerald', swatch: '#047857' },
  rose: { label: 'Rose', swatch: '#e11d48' },
  amber: { label: 'Amber', swatch: '#b45309' },
  teal: { label: 'Teal', swatch: '#0f766e' },
}

/** Corner rounding character */
export type Radius = 'sharp' | 'soft' | 'round'
/** Global interface scale */
export type UIScale = 'compact' | 'cozy' | 'large'

export interface Toast {
  id: string
  title: string
  description?: string
  tone: 'default' | 'success' | 'error'
}

interface UIState {
  theme: Theme
  accent: Accent
  radius: Radius
  scale: UIScale
  reduceMotion: boolean
  sidebarCollapsed: boolean
  /** Mobile slide-over nav */
  mobileNavOpen: boolean
  paletteOpen: boolean
  toasts: Toast[]
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
  setRadius: (r: Radius) => void
  setScale: (s: UIScale) => void
  setReduceMotion: (v: boolean) => void
  toggleSidebar: () => void
  setMobileNav: (open: boolean) => void
  setPalette: (open: boolean) => void
  pushToast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      accent: 'nova',
      radius: 'soft',
      scale: 'cozy',
      reduceMotion: false,
      sidebarCollapsed: false,
      mobileNavOpen: false,
      paletteOpen: false,
      toasts: [],
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setRadius: (radius) => set({ radius }),
      setScale: (scale) => set({ scale }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      setPalette: (paletteOpen) => set({ paletteOpen }),
      pushToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: uid('toast') }] })),
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
    }),
    {
      name: 'tinybiz-ui',
      partialize: (s) =>
        ({
          theme: s.theme,
          accent: s.accent,
          radius: s.radius,
          scale: s.scale,
          reduceMotion: s.reduceMotion,
          sidebarCollapsed: s.sidebarCollapsed,
        }) as UIState,
    },
  ),
)

/** Fire-and-forget toast from anywhere (components or store actions) */
export function toast(title: string, options?: { description?: string; tone?: Toast['tone'] }): void {
  useUI.getState().pushToast({ title, description: options?.description, tone: options?.tone ?? 'default' })
}

export function isDark(theme: Theme): boolean {
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches
  return theme === 'dark'
}
