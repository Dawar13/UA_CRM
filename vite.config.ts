import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { brandMarkDataUri } from './src/assets/brand/brandMark'

/**
 * Injects the favicon (generated from the same SVG as the in-app brand mark) and, in builds,
 * preloads the Latin Geist variable fonts so the first paint uses the right metrics.
 */
function brandHead(): Plugin {
  return {
    name: 'ua-brand-head',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const tags: {
          tag: string
          attrs: Record<string, string | boolean>
          injectTo: 'head' | 'head-prepend'
        }[] = [
          {
            tag: 'link',
            attrs: { rel: 'icon', type: 'image/svg+xml', href: brandMarkDataUri },
            injectTo: 'head',
          },
        ]
        const bundle = ctx.bundle ?? {}
        for (const file of Object.keys(bundle)) {
          if (/geist(-mono)?-latin-wght-normal-[\w-]+\.woff2$/.test(file)) {
            tags.push({
              tag: 'link',
              attrs: {
                rel: 'preload',
                as: 'font',
                type: 'font/woff2',
                href: `/${file}`,
                crossorigin: true,
              },
              injectTo: 'head',
            })
          }
        }
        return tags
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), brandHead()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Phase 1 and 2 libraries (pdfjs, OCR, ExcelJS) are lazy-loaded and large by nature.
    chunkSizeWarningLimit: 1500,
  },
})
