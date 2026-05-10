import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['log.svg'],
      manifest: {
        name: 'BarakahFund',
        short_name: 'BarakahFund',
        description: 'Crowdfunding platform for meaningful causes.',
        theme_color: '#059669',
        background_color: '#fafaf9',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'log.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gfonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gfonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
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
            return;
          }

          if (id.includes('react-router')) {
            return 'router';
          }

          if (
            id.includes('framer-motion') ||
            id.includes('motion-dom') ||
            id.includes('motion-utils')
          ) {
            return 'motion';
          }

          if (id.includes('lucide-react')) {
            return 'icons';
          }

          if (
            id.includes('\\react\\') ||
            id.includes('\\react-dom\\') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor';
          }
        }
      }
    }
  }
});
