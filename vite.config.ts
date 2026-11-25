import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset URLs: the build works at any sub-path (e.g. https://<user>.github.io/<repo>/).
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5288, strictPort: true },
})
