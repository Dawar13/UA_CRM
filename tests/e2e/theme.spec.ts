import type { Page } from '@playwright/test'
import { expect, gotoApp, setTheme, THEME_STORAGE_KEY, test } from '../support/fixtures'
import { reloadApp } from './helpers'

const LIGHT_BG = 'rgb(255, 255, 255)'
const DARK_BG = 'rgb(7, 17, 23)'

interface ThemeProbe {
  /** data-theme when the first animation frame ran. */
  firstFrame?: string | null
  /** data-theme when <body>, the first painted content, was parsed. */
  atBody?: string | null
  /** Every value data-theme was set to, in order. */
  values: (string | null)[]
}

declare global {
  interface Window {
    __themeProbe?: ThemeProbe
  }
}

/** The page background actually painted. */
function bodyBackground(page: Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
}

function themeToggle(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: /^Theme: / })
}

/**
 * Installs a probe before any page script runs. It records data-theme when the first animation
 * frame runs, when <body> is parsed (nothing visible exists before it), and every later change.
 */
async function probeTheme(page: Page) {
  await page.addInitScript(() => {
    const probe: ThemeProbe = { values: [] }
    window.__themeProbe = probe
    const read = () => document.documentElement?.getAttribute('data-theme') ?? null
    const onFrame = () => {
      // The first frame can come before the parser has created <html>; wait for it.
      if (!document.documentElement) requestAnimationFrame(onFrame)
      else probe.firstFrame = read()
    }
    requestAnimationFrame(onFrame)
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') probe.values.push(read())
        if (probe.atBody === undefined && document.body) probe.atBody = read()
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  })
}

async function readProbe(page: Page): Promise<ThemeProbe> {
  await expect.poll(() => page.evaluate(() => window.__themeProbe?.firstFrame)).toBeDefined()
  const probe = await page.evaluate(() => window.__themeProbe)
  if (!probe) throw new Error('theme probe missing')
  return probe
}

/** The stored mode was in place before the first frame and before anything was parsed into view. */
async function expectNoFlash(page: Page, mode: string) {
  const probe = await readProbe(page)
  expect(probe.firstFrame, 'data-theme at the first animation frame').toBe(mode)
  expect(probe.atBody, 'data-theme when <body> was parsed').toBe(mode)
  expect(probe.values.length, 'the inline script set data-theme').toBeGreaterThan(0)
  expect(new Set(probe.values), 'data-theme never took another value').toEqual(new Set([mode]))
}

test.describe('theme', () => {
  test.describe('system default, light', () => {
    test.use({ colorScheme: 'light' })

    test('follows a light system setting', async ({ page }) => {
      await gotoApp(page, '/', { waitForReady: true })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'system')
      await expect(themeToggle(page)).toHaveAccessibleName('Theme: System')
      expect(await bodyBackground(page)).toBe(LIGHT_BG)
    })
  })

  test.describe('system default, dark', () => {
    test.use({ colorScheme: 'dark' })

    test('follows a dark system setting, and live changes to it', async ({ page }) => {
      await gotoApp(page, '/', { waitForReady: true })
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'system')
      await expect(themeToggle(page)).toHaveAccessibleName('Theme: System')
      expect(await bodyBackground(page)).toBe(DARK_BG)

      // The system switching to light while the app is open is followed without a reload.
      await page.emulateMedia({ colorScheme: 'light' })
      await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG)
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect.poll(() => bodyBackground(page)).toBe(DARK_BG)
    })
  })

  test('the toggle cycles system → light → dark → system, and the choice persists', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await gotoApp(page, '/', { waitForReady: true })
    const html = page.locator('html')
    await expect(themeToggle(page)).toHaveAccessibleName('Theme: System')

    await themeToggle(page).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await expect(themeToggle(page)).toHaveAccessibleName('Theme: Light')
    expect(await bodyBackground(page)).toBe(LIGHT_BG)

    await themeToggle(page).click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect(themeToggle(page)).toHaveAccessibleName('Theme: Dark')
    await expect.poll(() => bodyBackground(page)).toBe(DARK_BG)
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe('dark')

    await reloadApp(page)
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await expect(themeToggle(page)).toHaveAccessibleName('Theme: Dark')
    expect(await bodyBackground(page)).toBe(DARK_BG)

    await themeToggle(page).click()
    await expect(html).toHaveAttribute('data-theme', 'system')
    await expect(themeToggle(page)).toHaveAccessibleName('Theme: System')
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_BG)

    await reloadApp(page)
    await expect(html).toHaveAttribute('data-theme', 'system')
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe(
      'system',
    )
  })

  test('the palette can set the theme', async ({ page }) => {
    await gotoApp(page, '/', { waitForReady: true })
    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByTestId('command-palette')
    await palette.getByRole('combobox').fill('theme dark')
    await palette.getByRole('option', { name: 'Theme: Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(themeToggle(page)).toHaveAccessibleName('Theme: Dark')
  })

  test.describe('no flash of the wrong theme', () => {
    test.use({ colorScheme: 'light' })

    test('a stored dark choice is applied before the first frame', async ({ page }) => {
      await setTheme(page, 'dark')
      await probeTheme(page)
      await gotoApp(page, '/', { waitForReady: true })
      await expectNoFlash(page, 'dark')
      expect(await bodyBackground(page)).toBe(DARK_BG)

      // And again on a reload, from what the app stored.
      await reloadApp(page)
      await expectNoFlash(page, 'dark')
      expect(await bodyBackground(page)).toBe(DARK_BG)
    })

    test('a stored light choice beats a dark system before the first frame', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await setTheme(page, 'light')
      await probeTheme(page)
      await gotoApp(page, '/', { waitForReady: true })
      await expectNoFlash(page, 'light')
      expect(await bodyBackground(page)).toBe(LIGHT_BG)
    })
  })
})
