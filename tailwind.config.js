/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
        serif: [
          '"Songti SC"',
          '"Source Han Serif SC"',
          'Georgia',
          '"Times New Roman"',
          'serif',
        ],
      },
      colors: {
        paper: '#f7f5f0',
        ink: '#1c1917',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,25,23,0.04), 0 10px 30px -18px rgba(28,25,23,0.35)',
      },
      maxWidth: {
        reading: '46rem',
      },
    },
  },
  plugins: [],
}
