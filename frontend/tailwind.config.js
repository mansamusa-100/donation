export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669', // Primary Green
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        gambia: {
          red: '#CE1126',
          blue: '#0C1C8C',
          green: '#059669',
        },
        surface: {
          50: '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          800: '#292524',
          900: '#1c1917',
        }
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'warm': '0 4px 20px -2px rgba(120, 113, 108, 0.1)',
        'warm-lg': '0 10px 25px -3px rgba(120, 113, 108, 0.15)',
      }
    },
  },
  plugins: [],
}
