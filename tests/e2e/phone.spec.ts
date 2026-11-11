import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, gotoApp, setTheme, test } from '../support/fixtures'
import { grid, gridRow, ids, openSheet } from './helpers'

// The phone layout (D-056), on a touch phone (the `phone` project: Pixel 7, 412 × 915). Tests here
// carry @phone and run only in that project.

test.use({ startWithPanel: false })

/** How far the page scrolls sideways; 0 when everything fits. */
async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

function cell(row: Locator, key: string): Locator {
  return row.locator(`[data-col="${key}"]`)
}

/** Fully inside the window, left to right. */
async function expectWithinWidth(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox()
  const width = page.viewportSize()?.width ?? 0
  expect(box).not.toBeNull()
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width)
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }))
}

test.describe('on a phone @phone', () => {
  test('the sheet fits: the header keeps search and the menu, the front starts folded', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers')
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0)
    await expectWithinWidth(page, page.getByTestId('search-trigger'))
    await expectWithinWidth(page, page.getByRole('button', { name: 'More' }))
    // The theme lives in the ⋯ menu on a phone.
    await expect(page.getByRole('button', { name: /^Theme:/ })).toBeHidden()
    await expect(page.getByTestId('sheet-summary')).toHaveAttribute('data-state', 'closed')
    await expect(grid(page)).toBeVisible()

    // The other member's tab is a tap away.
    await page.getByRole('tab', { name: 'Dhruv' }).tap()
    await expect(page).toHaveURL(/\/m\/dhruv\//)
    await expect(page.getByTestId('view-only-note')).toBeVisible()
  })

  test('a tap picks a cell and a second tap edits it; a tap on a name opens the row', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    // (The warmth chip is its own button: a tap on it opens the warmth picker at once.)
    await cell(row, 'title').tap()
    await expect(cell(row, 'title')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('cell-editor')).toHaveCount(0)
    await cell(row, 'title').tap()
    await expect(page.getByTestId('cell-editor')).toBeVisible()
    await page.keyboard.insertText(' (Hosur)')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('cell-editor')).toHaveCount(0)
    await expect(cell(row, 'title')).toHaveText('Plant Head (Hosur)')

    await cell(row, 'name').tap()
    const expanded = page.getByTestId('expanded-row')
    await expect(expanded).toBeVisible()
    await expectWithinWidth(page, expanded.getByTestId('move-to-trash'))
    await expectWithinWidth(page, expanded.getByRole('radio', { name: 'Cold' }))
  })

  test('quick add: Enter starts a new line, Preview previews, Save saves', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.getByTestId('quick-add').getByRole('button').first().tap()
    const box = page.getByLabel('Quick add', { exact: true })
    await box.fill('Kavita Iyer / Quality Head @ Nashik Gears')
    await box.press('End')
    await box.press('Enter')
    await box.pressSequentially('+91 98220 11111')
    await expect(box).toHaveValue('Kavita Iyer / Quality Head @ Nashik Gears\n+91 98220 11111')
    await page.getByRole('button', { name: 'Preview' }).tap()
    await expect(page.getByTestId('quick-add-preview')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).tap()
    await expect(grid(page).getByText('Kavita Iyer')).toBeVisible()

    // Close leaves without saving and keeps nothing behind.
    await page.getByTestId('quick-add').getByRole('button').first().tap()
    await page.getByRole('button', { name: 'Close' }).tap()
    await expect(page.getByLabel('Quick add', { exact: true })).toHaveCount(0)
  })

  test('the side panel covers the screen and closes', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.getByRole('button', { name: 'Show side panel' }).tap()
    const panel = page.getByTestId('right-panel')
    await expect(panel).toBeVisible()
    const box = await panel.boundingBox()
    expect(box?.width).toBe(page.viewportSize()?.width)
    await page.getByRole('button', { name: 'Close side panel' }).tap()
    await expect(panel).toHaveCount(0)
  })

  test('Today stacks each follow-up; the week opens at today with the hours pinned', async ({
    page,
  }) => {
    await gotoApp(page, '/today', { waitForReady: true })
    await expect(page.getByTestId('today-item').first()).toBeVisible()
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0)

    await gotoApp(page, '/calendar')
    const scroller = page.getByTestId('week-scroller')
    await expect(scroller).toBeVisible()
    // Thu 5 Nov is today: the week has scrolled to it, and its name is on screen.
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    await expectWithinWidth(page, page.locator('[aria-current="date"]'))
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`no serious accessibility issues, ${theme}`, async ({ page }) => {
      await setTheme(page, theme)
      await openSheet(page, 'dawar', 'customers')
      expect(await seriousViolations(page)).toEqual([])
      await gotoApp(page, '/today', { waitForReady: true })
      expect(await seriousViolations(page)).toEqual([])
    })
  }
})
