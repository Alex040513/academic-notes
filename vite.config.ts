import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base 用相对路径，才能直接部署在 GitHub Pages 的 /<仓库名>/ 子路径下
export default defineConfig({
  plugins: [react()],
  base: './',
})
