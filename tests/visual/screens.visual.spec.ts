import { expect, gotoApp, setTheme, test } from '../support/fixtures'

/**
 * Visual regression. Baselines exist only for Linux: they are generated in the official
 * Playwright Docker image (`pnpm test:visual:update`) or by the "Visual baselines" workflow, so
 * fonts render identically locally and in CI. On other platforms these tests are skipped rather
 * than compared against Linux pixels.
 */
test.skip(process.platform !== 'linux', 'Visual baselines are Linux-only (Docker or CI).')

const designSections = [
  'design-colours',
  'design-type',
  'design-stages',
  'design-field',
  'design-activity',
  'design-shape',
  'design-brand',
  'design-buttons',
  'design-inputs',
  'design-menus',
  'design-feedback',
  'design-warmth',
  'design-tags',
  'design-stage-dots',
  'design-stage-tracker',
  'design-dates',
  'design-avatars',
  'design-tabs',
  'design-empty',
]

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme)
    })

    test('main screen', async ({ page }) => {
      await gotoApp(page, '/m/dawar/customers', { waitForReady: true })
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`main-${theme}.png`)
    })

    test('row expanded', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Desktop only')
      await gotoApp(page, '/m/dawar/customers?row=r-dawar-customers-02', { waitForReady: true })
      await expect(page.getByTestId('expanded-row')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`expanded-${theme}.png`)
    })

    test('command palette with results', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Desktop only')
      await gotoApp(page, '/m/dawar/customers', { waitForReady: true })
      await page.keyboard.press('ControlOrMeta+k')
      await page.keyboard.type('menon')
      await expect(page.getByTestId('palette-result')).toHaveCount(2)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`palette-${theme}.png`)
    })

    test('design showcase, section by section', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Desktop only')
      await gotoApp(page, '/design')
      await page.evaluate(() => document.fonts.ready)
      for (const id of designSections) {
        const section = page.getByTestId(id)
        await section.scrollIntoViewIfNeeded()
        await expect(section).toHaveScreenshot(`${id}-${theme}.png`)
      }
    })
  })
}
