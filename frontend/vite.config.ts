import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('react-router')) {
            return 'router'
          }

          if (
            id.includes('framer-motion') ||
            id.includes('motion-dom') ||
            id.includes('motion-utils')
          ) {
            return 'motion'
          }

          if (id.includes('lucide-react')) {
            return 'icons'
          }

          if (
            id.includes('\\react\\') ||
            id.includes('\\react-dom\\') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor'
          }
        }
      }
    }
  }
})
