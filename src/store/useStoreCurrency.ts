// The visitor's chosen display currency for the storefront. Prices convert
// at the day's rate (served with the catalog); the shop still charges in its
// own currency, so checkout spells out the real amount. Persisted per browser.

import { create } from 'zustand'
import { DISPLAY_CURRENCIES, type DisplayCurrencyCode } from '@/data/types'

const KEY = 'tms-store-currency'

const initial = (): DisplayCurrencyCode | null => {
  try {
    const v = localStorage.getItem(KEY)
    if (v && (DISPLAY_CURRENCIES as readonly string[]).includes(v)) return v as DisplayCurrencyCode
  } catch {
    /* private mode */
  }
  return null // null = the shop's own currency
}

export const useStoreCurrency = create<{
  selected: DisplayCurrencyCode | null
  setSelected: (c: DisplayCurrencyCode) => void
}>((set) => ({
  selected: initial(),
  setSelected: (c) => {
    try {
      localStorage.setItem(KEY, c)
    } catch {
      /* private mode */
    }
    set({ selected: c })
  },
}))
