import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/utils'

export type Theme = 'light' | 'dark' | 'system'

export interface Toast {
  id: string
  title: string
  description?: string
  tone: 'default' | 'success' | 'error'
}

interface UIState {
  theme: Theme
  sidebarCollapsed: boolean
  /** Mobile slide-over nav */
  mobileNavOpen: boolean
  paletteOpen: boolean
  toasts: Toast[]
  setTheme: (t: Theme) => void
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
      sidebarCollapsed: false,
      mobileNavOpen: false,
      paletteOpen: false,
      toasts: [],
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      setPalette: (paletteOpen) => set({ paletteOpen }),
      pushToast: (t) => set((s) => ({ toasts: [...s.toasts, { ...t, id: uid('toast') }] })),
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
    }),
    {
      name: 'tinybiz-ui',
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed }) as UIState,
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
