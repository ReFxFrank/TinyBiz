import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/utils'
import { generateAccentTheme, type CustomAccent } from '@/lib/color'
import { migrateKey } from '@/lib/legacyStorage'

// Carry saved appearance over from the pre-rename key
migrateKey('tinybiz-ui', 'tms-ui')

export type Theme = 'light' | 'dark' | 'system'

/** Preset accent themes the user can pick in Settings → Appearance */
export const ACCENTS = ['nova', 'tinymagic', 'violet', 'emerald', 'rose', 'amber', 'teal'] as const
export type PresetAccent = (typeof ACCENTS)[number]
/** 'custom' carries a user-picked brand color with generated shade steps */
export type Accent = PresetAccent | 'custom'

export const ACCENT_META: Record<PresetAccent, { label: string; swatch: string }> = {
  nova: { label: 'Nova Blue', swatch: '#2a78d6' },
  tinymagic: { label: 'Tiny Magic', swatch: '#8a9c48' },
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
  /** Generated tokens for the user's own brand color (accent === 'custom') */
  customAccent: CustomAccent | null
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
  /** Generate + activate a custom accent from any hex color */
  setCustomAccent: (hex: string) => void
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
      theme: 'dark',
      accent: 'tinymagic',
      customAccent: null,
      radius: 'soft',
      scale: 'cozy',
      reduceMotion: false,
      sidebarCollapsed: false,
      mobileNavOpen: false,
      paletteOpen: false,
      toasts: [],
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setCustomAccent: (hex) => set({ customAccent: generateAccentTheme(hex), accent: 'custom' }),
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
      name: 'tms-ui',
      // v2: the app adopted the Tiny Magic brand — dark workspace, sage accent.
      // One-time flip for existing browsers; custom brand colors are kept, and
      // everything stays changeable in Settings → Appearance.
      version: 2,
      migrate: (persisted) => {
        const p = persisted as Partial<UIState>
        return {
          ...p,
          theme: 'dark',
          accent: p.accent === 'custom' ? 'custom' : 'tinymagic',
        } as UIState
      },
      partialize: (s) =>
        ({
          theme: s.theme,
          accent: s.accent,
          customAccent: s.customAccent,
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
