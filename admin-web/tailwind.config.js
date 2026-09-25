/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--gh-primary)',
          600: 'var(--gh-primary-600)',
          50: 'var(--gh-primary-50)',
        },
        ink: {
          DEFAULT: 'var(--gh-ink)',
          700: 'var(--gh-ink-700)',
        },
        muted: 'var(--gh-muted)',
        surface: {
          DEFAULT: 'var(--gh-surface)',
          2: 'var(--gh-surface-2)',
        },
        line: 'var(--gh-border)',
        success: 'var(--gh-success)',
        warning: 'var(--gh-warning)',
        danger: 'var(--gh-danger)',
        info: 'var(--gh-info)',
        card: 'var(--gh-card)',
        page: 'var(--gh-page)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['20px', { lineHeight: '28px' }],
        xl: ['24px', { lineHeight: '32px' }],
        '2xl': ['32px', { lineHeight: '40px' }],
      },
      borderRadius: {
        control: '10px',
        card: '16px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.06), 0 4px 12px rgba(16, 24, 40, 0.06)',
        pop: '0 8px 28px rgba(16, 24, 40, 0.14)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-in': 'slide-in 180ms ease-out',
      },
    },
  },
  plugins: [],
}
