import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, gotoApp, setTheme, test } from '../support/fixtures'

/** Zero serious or critical violations on every main screen, in light and dark (WCAG 2.2 AA). */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }))
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme)
    })

    test('main screen', async ({ page }) => {
      await gotoApp(page, '/m/dawar/customers', { waitForReady: true })
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await seriousViolations(page)).toEqual([])
    })

    test('main screen with a row expanded', async ({ page }) => {
      await gotoApp(page, '/m/dawar/customers?row=r-dawar-customers-02', { waitForReady: true })
      await expect(page.getByTestId('expanded-row')).toBeVisible()
      expect(await seriousViolations(page)).toEqual([])
    })

    test('command palette with results', async ({ page }) => {
      await gotoApp(page, '/m/dawar/customers', { waitForReady: true })
      await page.keyboard.press('ControlOrMeta+k')
      await page.keyboard.type('menon')
      await expect(page.getByTestId('palette-result')).toHaveCount(2)
      expect(await seriousViolations(page)).toEqual([])
    })

    test('design showcase', async ({ page }) => {
      await gotoApp(page, '/design')
      // /design is a large lazy chunk behind the first-launch seed; allow for a slow first load.
      await expect(page.getByRole('heading', { name: 'Design system' })).toBeVisible({
        timeout: 15_000,
      })
      expect(await seriousViolations(page)).toEqual([])
    })
  })
}
