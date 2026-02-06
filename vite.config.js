import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Force exclude libraw-wasm from optimization to ensure we get the latest code from node_modules
  // and not a cached pre-bundled version (since version number 1.1.2 is same for both original and fork)
  optimizeDeps: {
    exclude: ['libraw-wasm']
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 20000000
      },
      includeAssets: ['favicon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png', 'libraw.wasm', 'magick.wasm'],
      manifest: {
        name: 'Nitrate Grain',
        short_name: 'Nitrate Grain',
        description: 'Shadows with a pulse',
        // theme_color removed to allow dynamic meta tag to take precedence for status bar
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [
            {
                src: 'screenshot-desktop.png',
                sizes: '1920x1080',
                type: 'image/png',
                form_factor: 'wide',
                label: 'Desktop Interface'
            },
            {
                src: 'screenshot-mobile.png',
                sizes: '375x812',
                type: 'image/png',
                form_factor: 'narrow',
                label: 'Mobile Interface'
            }
        ],
        share_target: {
            action: '/_share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: {
                title: 'name',
                text: 'description',
                url: 'link',
                files: [
                    {
                        name: 'file',
                        accept: ['.dng', '.raf', '.cr2', '.arw', '.nef', '.orf', '.rw2', 'image/*', 'application/octet-stream']
                    }
                ]
            }
        },
        file_handlers: [
          {
            action: '/',
            accept: {
              'image/tiff': ['.dng', '.arw', '.cr2', '.cr3', '.nef', '.orf', '.raf', '.rw2'],
              'image/x-adobe-dng': ['.dng'],
              'image/x-sony-arw': ['.arw'],
              'image/x-canon-cr2': ['.cr2'],
              'image/x-canon-cr3': ['.cr3'],
              'image/x-nikon-nef': ['.nef'],
              'image/x-olympus-orf': ['.orf'],
              'image/x-fuji-raf': ['.raf'],
              'image/x-panasonic-rw2': ['.rw2'],
              'application/octet-stream': ['.dng', '.arw', '.cr2', '.cr3', '.nef', '.orf', '.raf', '.rw2']
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    })
  ],
})
