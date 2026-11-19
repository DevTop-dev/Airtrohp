/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Strictly monochrome palette: black, charcoal, dark gray, silver, white.
      colors: {
        ink: {
          950: '#050505',
          900: '#0a0a0a',
          850: '#101010',
          800: '#161616',
          700: '#1f1f1f',
          600: '#2a2a2a',
          500: '#3a3a3a',
          400: '#5c5c5c',
          300: '#8a8a8a',
          200: '#b5b5b5',
          100: '#dcdcdc',
          50: '#f4f4f4',
        },
      },
      // Softer, rounder corners everywhere (each Tailwind step is one notch rounder).
      borderRadius: {
        DEFAULT: '0.5rem',
        sm: '0.5rem',
        md: '0.75rem',
        lg: '0.875rem',
        xl: '1.125rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.05), 0 24px 70px -24px rgba(0,0,0,0.95)',
        soft: '0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 36px -16px rgba(0,0,0,0.85)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
        sheen: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'fade-up': 'fadeUp .6s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fadeIn .4s ease both',
        blink: 'blink 1.2s ease-in-out infinite',
        sheen: 'sheen 3s linear infinite',
      },
    },
  },
  plugins: [],
};
