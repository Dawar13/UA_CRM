import { expect, gotoApp, test } from '../support/fixtures'

// The founders' defaults (7 Nov 2026): light theme and the side panel closed, until someone
// chooses otherwise; each choice is then remembered.
test.describe('first visit', () => {
  test.use({ startWithPanel: false, colorScheme: 'dark' })

  test('opens in light with the side panel closed, and remembers opening it', async ({ page }) => {
    await gotoApp(page, '/m/dawar/customers', { waitForReady: true })
    // Light even when the computer is set to dark.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByTestId('right-panel')).toHaveCount(0)

    await page.getByRole('button', { name: 'Show side panel' }).click()
    await expect(page.getByTestId('right-panel')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('right-panel')).toBeVisible()
  })
})
