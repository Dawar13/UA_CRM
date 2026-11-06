import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { FAVICON_PATH } from './src/assets/brand/brandMark.ts'

const faviconDataUri = `data:image/png;base64,${readFileSync(
  fileURLToPath(new URL(`./${FAVICON_PATH}`, import.meta.url)),
).toString('base64')}`

/**
 * Injects the favicon: the founders' UA mark (D-044), inlined so it needs no extra request.
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
            attrs: { rel: 'icon', type: 'image/png', href: faviconDataUri },
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
