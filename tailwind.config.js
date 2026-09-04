/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#2F80ED',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
      },
      boxShadow: { card: '0 4px 18px rgba(17, 24, 39, 0.05)' }
    }
  },
  plugins: []
}
