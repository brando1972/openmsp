/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        dispatch: {
          purple: '#d946ef',
          purpleLight: '#fae8ff',
          green: '#22c55e',
          greenLight: '#dcfce7',
          cyan: '#06b6d4',
          cyanLight: '#cffafe',
          coral: '#f87171',
          coralLight: '#fee2e2',
          yellow: '#facc15',
          yellowLight: '#fef9c3',
          gray: '#94a3b8',
          grayLight: '#f1f5f9'
        }
      }
    },
  },
  plugins: [],
}
