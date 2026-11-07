import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
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

/**
 * Serves the calendar functions in api/ during `pnpm dev`: the same files Vercel deploys, loaded
 * through Vite so their TypeScript runs as is. Server settings come from .env.local; only VITE_
 * settings ever reach the browser, so the secret ones stay on the server side.
 */
function apiDev(): Plugin {
  return {
    name: 'ua-api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [name, value] of Object.entries(env)) {
        if (!name.startsWith('VITE_') && process.env[name] === undefined) process.env[name] = value
      }
      server.middlewares.use(async (req, res, next) => {
        const path = /^\/api\/((?:calendar|cron)\/[a-z-]+)(?:\?|$)/.exec(req.url ?? '')?.[1]
        if (!path) return next()
        if (!existsSync(fileURLToPath(new URL(`./api/${path}.ts`, import.meta.url)))) {
          res.statusCode = 404
          res.end()
          return
        }
        try {
          const module = await server.ssrLoadModule(`/api/${path}.ts`)
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) {
            if (value !== undefined)
              headers.set(name, Array.isArray(value) ? value.join(', ') : value)
          }
          const method = req.method ?? 'GET'
          const response: Response = await module.default.fetch(
            new Request(`http://${req.headers.host}${req.url}`, {
              method,
              headers,
              body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
            }),
          )
          res.statusCode = response.status
          response.headers.forEach((value, name) => {
            res.setHeader(name, value)
          })
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), brandHead(), apiDev()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Phase 1 and 2 libraries (pdfjs, OCR, ExcelJS) are lazy-loaded and large by nature.
    chunkSizeWarningLimit: 1500,
  },
})
