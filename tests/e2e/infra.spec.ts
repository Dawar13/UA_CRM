import { expect, gotoApp, test } from '../support/fixtures'

// Infrastructure check: the production build serves, the head is branded and the console is clean.
// Feature specs (branding, navigation, stage, and so on) arrive with the app shell in M0.4 and M0.5.
test('the app loads with its title, favicon and a clean console', { tag: '@smoke' }, async ({
  page,
  consoleIssues,
}) => {
  await gotoApp(page, '/')

  await expect(page).toHaveTitle('UA · Internal CRM')
  await expect(page.locator('head link[rel="icon"]')).toHaveCount(1)
  await expect(page.locator('head link[rel="icon"]')).toHaveAttribute(
    'href',
    /^data:image\/png;base64,/,
  )
  // The clock fixture is in place before the app's first script runs.
  expect(await page.evaluate(() => new Date().toISOString())).toBe('2026-11-05T04:30:00.000Z')

  await page.waitForLoadState('networkidle')
  expect(consoleIssues).toEqual([])
})
