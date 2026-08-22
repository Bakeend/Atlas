/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: '#27C47D', ink: '#111827', muted: '#6B7280', canvas: '#F7F8FA' },
      boxShadow: { card: '0 4px 18px rgba(17, 24, 39, 0.05)' }
    }
  },
  plugins: []
}
