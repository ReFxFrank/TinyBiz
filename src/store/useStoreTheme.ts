// Visitor-facing storefront theme. Independent of the owner's admin theme:
// customers get a soft cream look by default and can flip to the dark look
// with the header toggle. Persisted per browser.

import { create } from 'zustand'

export type StoreTheme = 'light' | 'dark'

const KEY = 'tms-store-theme'

const initial = (): StoreTheme => {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* private mode */
  }
  return 'light'
}

export const useStoreTheme = create<{ theme: StoreTheme; toggle: () => void }>((set) => ({
  theme: initial(),
  toggle: () =>
    set((s) => {
      const theme: StoreTheme = s.theme === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(KEY, theme)
      } catch {
        /* private mode */
      }
      return { theme }
    }),
}))
