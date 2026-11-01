import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves the site from /<repo>/, so production builds need
// that prefix; the dev server keeps serving from the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/wanikani-no-srs/' : '/',
  plugins: [react(), tailwindcss()],
}))
