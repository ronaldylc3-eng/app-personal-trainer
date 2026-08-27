/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#FF5A1F',
          light: '#FF7A3D',
          dark: '#C24310',
        },
        plate: '#8A2A0A',
        ink: '#0A0A0B',
        panel: '#151517',
        'panel-2': '#1C1C20',
        line: '#28282D',
        bone: '#F3F2EF',
        'muted-steel': '#8E8E96',
        ok: '#3DBE6C',
        surface: '#151619',
        base: '#08090A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Anton', 'sans-serif'],
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(255,90,31,0.18)',
        'glow-sm': '0 0 10px rgba(255,90,31,0.12)',
        'plate': 'inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -10px 14px rgba(0,0,0,0.35), 0 10px 24px -8px rgba(255,90,31,0.55)',
        'card': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
