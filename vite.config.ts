import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { brandMarkDataUri } from './src/assets/brand/brandMark.ts'

/**
 * Injects the favicon, generated from the same SVG as the in-app brand mark.
 *
 * Fonts are deliberately not preloaded: WebKit logs "preloaded but not used" for the Geist
 * preloads (and Geist Mono is not on the main screens), which breaks the no-console-warnings
 * rule. The self-hosted Latin files are ~30 KB from the same origin. See docs/DECISIONS.md.
 */
function brandHead(): Plugin {
  return {
    name: 'ua-brand-head',
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [
          {
            tag: 'link',
            attrs: { rel: 'icon', type: 'image/svg+xml', href: brandMarkDataUri },
            injectTo: 'head',
          },
        ]
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
