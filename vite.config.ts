import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    // never inline fonts as data: URLs — the CSP only allows font-src 'self'
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
  },
})
