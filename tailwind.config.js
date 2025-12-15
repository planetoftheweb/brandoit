/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Mona Sans"', 'Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          teal: '#00A9A5',
          orange: '#FF7F50',
          red: '#B93135',
          dark: '#0B4F6C'
        },
        dark: {
          bg: '#0d1117',
          card: '#161b22',
          border: '#30363d',
          hover: '#21262d'
        }
      }
    },
  },
  plugins: [],
}

