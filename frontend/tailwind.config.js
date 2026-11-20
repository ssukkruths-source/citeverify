/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          bg: '#FAF9F5',
          surface: '#FFFFFF',
          card: '#FFFFFF',
          border: '#E8E7E1',
          subtle: '#F4F5F2',
        },
        ink: {
          primary: '#14233F',
          secondary: '#687387',
          muted: '#9CA3AF',
          light: '#D1D5DB'
        },
        brand: {
          cobalt: '#3268BB',
          lime: '#FFF3D8',
          coral: '#C87672',
          lavender: '#EAE9FA',
          teal: '#DFF3E8',
          emerald: '#63A982',
          amber: '#D6A548',
          rose: '#D8847E',
        },
        verdict: {
          supported: {
            bg: '#DFF3E8',
            text: '#397552',
            border: '#C2E7D2',
            badge: '#63A982',
          },
          partial: {
            bg: '#FFF3D8',
            text: '#936B21',
            border: '#F0D9A7',
            badge: '#F59E0B',
          },
          contradicted: {
            bg: '#F9E3E1',
            text: '#A75D58',
            border: '#EFC5C1',
            badge: '#D8847E',
          },
          insufficient: {
            bg: '#EAE9FA',
            text: '#625E98',
            border: '#D4D3EF',
            badge: '#64748B',
          },
          unverified: {
            bg: '#EAF1FC',
            text: '#3268BB',
            border: '#CADAF1',
            badge: '#3B82F6',
          }
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        serif: ['Newsreader', 'Georgia', 'serif'],
      },
      boxShadow: {
        'subtle': '0 2px 10px rgba(20, 35, 63, 0.045)',
        'editorial': '0 9px 28px -8px rgba(20, 35, 63, 0.085), 0 2px 7px rgba(20, 35, 63, 0.035)',
        'floating': '0 18px 38px -12px rgba(20, 35, 63, 0.14)',
      }
    },
  },
  plugins: [],
}
