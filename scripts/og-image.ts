/**
 * Draws the link preview, public/og.png (1200 × 630): the picture WhatsApp, Slack, LinkedIn and
 * email show when the CRM's link is shared (D-058). It has the sign-in screen's look: the soft
 * wash, then the founders' mark, the wordmark and the Internal CRM label, centred so that a
 * square crop (WhatsApp's small preview) still shows the mark.
 *
 * Run with `pnpm og-image` after the logo in src/assets/brand/ changes.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { softGradient, themes } from '../src/styles/tokens'

const root = new URL('../', import.meta.url)
const dataUri = (path: string, type: string) =>
  `data:${type};base64,${readFileSync(new URL(path, root)).toString('base64')}`

const mark = dataUri('src/assets/brand/ua-mark.png', 'image/png')
const geist = dataUri(
  'node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  'font/woff2',
)
const mono = dataUri(
  'node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
  'font/woff2',
)
const light = themes.light

const html = `<!doctype html>
<html><head><style>
  @font-face { font-family: Geist; src: url(${geist}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: 'Geist Mono'; src: url(${mono}) format('woff2'); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; background: ${light.bg}; }
  body { position: relative; display: grid; place-items: center; font-family: Geist; }
  .wash { position: absolute; inset: -60px -60px auto; height: 64%; background: ${softGradient.css};
    opacity: 0.5; filter: blur(64px); }
  .lockup { position: relative; display: flex; flex-direction: column; align-items: center; }
  /* The mark file is 112px, so it is drawn at its own size. */
  .mark { width: 112px; height: 112px; border-radius: 28px; }
  .name { margin-top: 36px; font-size: 64px; line-height: 1; font-weight: 600;
    letter-spacing: -0.02em; color: ${light.text}; }
  .label { margin-top: 26px; height: 44px; padding: 0 14px; display: inline-flex;
    align-items: center; border: 2px solid ${light.brandTintStrong}; border-radius: 8px;
    background: ${light.bg}; font: 600 21px/1 'Geist Mono'; letter-spacing: 0.1em;
    text-transform: uppercase; color: ${light.brandTintFg}; }
</style></head>
<body>
  <div class="wash"></div>
  <div class="lockup">
    <img class="mark" src="${mark}" alt="">
    <div class="name">Utopian Autonomy</div>
    <div class="label">Internal CRM</div>
  </div>
</body></html>`

const target = fileURLToPath(new URL('public/og.png', root))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: target })
await browser.close()
console.log(`Wrote ${target}`)
