// Color math for the custom accent theme: hex↔HSL conversion, WCAG contrast,
// and a generator that turns any picked color into a full accent token set for
// light AND dark mode, auto-adjusted until contrast passes.

export interface AccentTokens {
  accent: string
  'accent-strong': string
  'accent-soft': string
  'accent-wash': string
  /** Text color used ON the accent (buttons) — white or near-black, whichever reads */
  'accent-fg': string
  pop: string
  'pop-soft': string
}

export interface CustomAccent {
  /** The color the user picked */
  base: string
  /** True when the base had to be shifted to keep button text readable */
  adjusted: boolean
  light: AccentTokens
  dark: AccentTokens
}

// ── Conversions ──────────────────────────────────────────────────────────────

export function isValidHex(hex: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(hex.trim())
}

export function normalizeHex(hex: string): string {
  const h = hex.trim().replace(/^#/, '').toLowerCase()
  return `#${h}`
}

function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

interface Hsl {
  h: number
  s: number
  l: number
}

function hexToHsl(hex: string): Hsl {
  let [r, g, b] = hexToRgb(hex)
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360
  const ss = Math.min(100, Math.max(0, s)) / 100
  const ll = Math.min(100, Math.max(0, l)) / 100
  const c = (1 - Math.abs(2 * ll - 1)) * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = ll - c / 2
  let rgb: [number, number, number]
  if (hh < 60) rgb = [c, x, 0]
  else if (hh < 120) rgb = [x, c, 0]
  else if (hh < 180) rgb = [0, c, x]
  else if (hh < 240) rgb = [0, x, c]
  else if (hh < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255)
}

// ── Contrast (WCAG 2.x) ──────────────────────────────────────────────────────

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** White or near-black ink, whichever reads better on the given color */
export function bestTextOn(hex: string): string {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#0b0b0b') ? '#ffffff' : '#0b0b0b'
}

/**
 * Walk lightness up or down until the color clears `target` contrast against
 * `bg`. Returns the original color unchanged if it already passes.
 */
function ensureContrast(hex: string, bg: string, target: number, direction: 'darken' | 'lighten'): { hex: string; adjusted: boolean } {
  if (contrastRatio(hex, bg) >= target) return { hex, adjusted: false }
  const { h, s, l } = hexToHsl(hex)
  const step = direction === 'darken' ? -1.5 : 1.5
  let next = l
  for (let i = 0; i < 60; i++) {
    next += step
    if (next <= 2 || next >= 98) break
    const candidate = hslToHex(h, s, next)
    if (contrastRatio(candidate, bg) >= target) return { hex: candidate, adjusted: true }
  }
  return { hex: hslToHex(h, s, Math.min(96, Math.max(4, next))), adjusted: true }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

// ── Theme generation ─────────────────────────────────────────────────────────

const LIGHT_SURFACE = '#fcfcfb'
const DARK_SURFACE = '#1a1a19'

/**
 * Build a full light+dark accent theme from one picked color.
 * Light accent is darkened until button text passes 4.5:1; dark accent is
 * lightened until it clears 3:1 against the dark surface. Soft/wash steps stay
 * on the same hue; the gradient partner ("pop") sits 42° around the wheel.
 */
export function generateAccentTheme(baseHex: string): CustomAccent {
  const base = normalizeHex(baseHex)
  const { h, s } = hexToHsl(base)
  const popH = (h + 42) % 360

  // Light mode: accent must carry readable button text
  const lightAccent = ensureContrast(base, '#ffffff', 4.5, 'darken')
  const lightFg = '#ffffff'
  const lightStrong = ensureContrast(
    hslToHex(h, clamp(s, 20, 95), clamp(hexToHsl(lightAccent.hex).l - 9, 8, 90)),
    '#ffffff',
    4.5,
    'darken',
  ).hex
  const light: AccentTokens = {
    accent: lightAccent.hex,
    'accent-strong': lightStrong,
    'accent-soft': hslToHex(h, clamp(s, 30, 75), 86),
    'accent-wash': hslToHex(h, clamp(s, 20, 60), 95),
    'accent-fg': lightFg,
    pop: hslToHex(popH, clamp(s, 45, 80), 52),
    'pop-soft': hslToHex(popH, clamp(s, 30, 60), 93),
  }

  // Dark mode: accent must stand off the dark surface; button text follows
  // whichever ink reads better on the resulting tone
  const darkAccent = ensureContrast(base, DARK_SURFACE, 3.2, 'lighten')
  const dark: AccentTokens = {
    accent: darkAccent.hex,
    'accent-strong': hslToHex(h, clamp(s, 25, 90), clamp(hexToHsl(darkAccent.hex).l + 9, 20, 88)),
    'accent-soft': hslToHex(h, clamp(s, 25, 55), 26),
    'accent-wash': hslToHex(h, clamp(s, 25, 50), 16),
    'accent-fg': bestTextOn(darkAccent.hex),
    pop: ensureContrast(hslToHex(popH, clamp(s, 40, 75), 60), DARK_SURFACE, 3, 'lighten').hex,
    'pop-soft': hslToHex(popH, clamp(s, 25, 50), 18),
  }

  return {
    base,
    adjusted: lightAccent.adjusted,
    light,
    dark,
  }
}

// ── Applying the theme ───────────────────────────────────────────────────────

const STYLE_ID = 'tms-custom-accent'

function tokensToCss(selector: string, tokens: AccentTokens): string {
  const body = Object.entries(tokens)
    .map(([k, v]) => `--${k}:${v};`)
    .join('')
  return `${selector}{${body}}`
}

/** CSS rules for a custom accent — mirrors the preset [data-accent] blocks */
export function customAccentCss(custom: CustomAccent): string {
  return (
    tokensToCss("html[data-accent='custom']", custom.light) +
    tokensToCss("html.dark[data-accent='custom']", custom.dark)
  )
}

/** Create or update the injected <style> tag carrying the custom accent */
export function applyCustomAccentStyle(custom: CustomAccent | null): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!custom) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = customAccentCss(custom)
}

/** Sanity check used by the validator surface: does the light surface read? */
export function lightSurfaceContrast(custom: CustomAccent): number {
  return contrastRatio(custom.light.accent, LIGHT_SURFACE)
}
