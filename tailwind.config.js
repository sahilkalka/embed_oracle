/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./src/**/*.js",
    "./public/**/*.js"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      transitionTimingFunction: {
        'spring-bouncy': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spring-snappy': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'out-smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      colors: {
        brand: {
          50: 'var(--brand-50, #E6F0EE)',
          100: 'var(--brand-100, #d0e5e0)',
          200: 'var(--brand-200, #a3cdc3)',
          300: 'var(--brand-300, #72b0a3)',
          400: 'var(--brand-400, #489484)',
          500: 'var(--accent-primary, var(--primary-color, #007f5f))',
          600: 'var(--primary-hover, #007255)',
          700: 'var(--primary-active, #00664c)',
          800: 'var(--brand-800, #00543e)',
          900: 'var(--brand-900, #192c27)',
          dark: 'var(--bg-primary, var(--bg-dark, #0d1715))',
          surface: 'var(--bg-surface, var(--surface-color, #182c27))',
          border: 'var(--border-color, #27443d)'
        },
        accent: {
          light: 'var(--accent-light, #80b918)',
          DEFAULT: 'var(--secondary-color, #55a630)',
          dark: 'var(--accent-dark, #387322)'
        }
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Roboto Slab"', 'Georgia', 'serif'],
        mono: ['"Fira Code"', 'Consolas', 'Monaco', 'monospace']
      }
      
    },
  },
  plugins: [],
}
