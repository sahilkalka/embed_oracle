/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0b0f19',        // Deep obsidian background
          surface: '#111827',   // Crisp slate surface for panels
          card: '#1e293b',      // Elevated cards
          cardHover: '#263349', // Hover state
          border: '#334155',    // Crisp high-contrast border
          text: '#f8fafc',      // Ultra crisp text
          muted: '#94a3b8',     // High legibility secondary text
        },
        outlook: {
          blue: '#0078d4',
          hover: '#106ebe',
          light: '#eff6fc',
          border: '#edebe9',
          sidebar: '#f3f2f1',
          text: '#323130',
          muted: '#605e5c',
        }
      },
      keyframes: {
        springPop: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '60%': { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        microBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)' },
          '70%': { transform: 'scale(1)', boxShadow: '0 0 0 6px rgba(16, 185, 129, 0)' },
          '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
        },
        badgeBump: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.35)' },
          '100%': { transform: 'scale(1)' },
        }
      },
      animation: {
        'spring-pop': 'springPop 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        'micro-bounce': 'microBounce 0.3s ease-in-out',
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'badge-bump': 'badgeBump 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      }
    },
  },
  plugins: [],
}
