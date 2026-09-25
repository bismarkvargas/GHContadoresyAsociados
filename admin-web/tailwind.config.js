/** @type {import('tailwindcss').Config} */
/**
 * Los colores de marca se exponen como variables CSS en canal RGB (`--gh-primary-rgb`)
 * para que Tailwind pueda aplicar modificadores de opacidad (bg-primary/10) y para que
 * el cambio de tema claro/oscuro funcione sin reconstruir el bundle.
 */
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: withOpacity('--gh-primary-rgb'),
          600: withOpacity('--gh-primary-600-rgb'),
          50: withOpacity('--gh-primary-50-rgb'),
        },
        ink: {
          DEFAULT: withOpacity('--gh-ink-rgb'),
          700: withOpacity('--gh-ink-700-rgb'),
        },
        muted: withOpacity('--gh-muted-rgb'),
        surface: {
          DEFAULT: withOpacity('--gh-surface-rgb'),
          2: withOpacity('--gh-surface-2-rgb'),
        },
        line: withOpacity('--gh-border-rgb'),
        success: withOpacity('--gh-success-rgb'),
        warning: withOpacity('--gh-warning-rgb'),
        danger: withOpacity('--gh-danger-rgb'),
        info: withOpacity('--gh-info-rgb'),
        card: withOpacity('--gh-card-rgb'),
        page: withOpacity('--gh-page-rgb'),
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
