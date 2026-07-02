/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        page: 'var(--page)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        sunken: 'var(--sunken)',
        // Ink
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
        },
        // Lines
        hairline: 'var(--hairline)',
        edge: 'var(--edge)',
        // Brand accent (chart series-1 blue, stepped per mode)
        accent: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          soft: 'var(--accent-soft)',
          wash: 'var(--accent-wash)',
        },
        // Secondary brand hue for gradients / playful touches
        pop: {
          DEFAULT: 'var(--pop)',
          soft: 'var(--pop-soft)',
        },
        // Status (fixed, never themed)
        good: { DEFAULT: 'var(--good)', wash: 'var(--good-wash)' },
        warn: { DEFAULT: 'var(--warn)', wash: 'var(--warn-wash)' },
        serious: { DEFAULT: 'var(--serious)', wash: 'var(--serious-wash)' },
        critical: { DEFAULT: 'var(--critical)', wash: 'var(--critical-wash)' },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        // Var-driven so the user's corner-style setting reshapes every component
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
        '3xl': 'var(--r-3xl)',
        xl2: 'var(--r-2xl)',
        xl3: 'var(--r-3xl)',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,11,11,0.04), 0 4px 16px rgba(11,11,11,0.05)',
        lifted: '0 2px 4px rgba(11,11,11,0.06), 0 12px 32px rgba(11,11,11,0.10)',
        pop: '0 8px 30px rgba(42,120,214,0.18)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
}
