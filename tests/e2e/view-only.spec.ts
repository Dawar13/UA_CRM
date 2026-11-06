import { expect, test } from '../support/fixtures'
import { expandedRow, focusGrid, grid, gridRow, ids, openSheet, toast } from './helpers'

// Signed in as Dawar (the local default). Dhruv's tab is view only (CLAUDE.md §2.14).

test.describe('view only', () => {
  test("another member's tab says so and has no editing controls", async ({ page }) => {
    await openSheet(page, 'dhruv', 'investors', ids.kiranSethi)
    await expect(page.getByTestId('view-only-note')).toHaveText("Dhruv's tab, view only")

    // Warmth reads in the grid but is not a control.
    await expect(grid(page).getByRole('button', { name: /^Warmth: / })).toHaveCount(0)

    const details = expandedRow(page)
    await expect(details).toBeVisible()
    await expect(details.getByTestId('stage-tracker')).toBeVisible()
    await expect(details.getByRole('radio')).toHaveCount(0)
    await expect(details.getByRole('button', { name: /^Move (back )?to / })).toHaveCount(0)
    await expect(details.getByRole('button', { name: 'Mark lost' })).toHaveCount(0)
    await expect(details.getByRole('button', { name: 'Copy to my sheet' })).toBeVisible()
  })

  test('edit keys do nothing, and only the first attempt says why', async ({ page }) => {
    await openSheet(page, 'dhruv', 'investors')
    const first = page.locator('[role="row"][data-row-id]').first()
    const before = (await first.textContent()) ?? ''
    await focusGrid(page)

    await page.keyboard.press('w')
    const notice = toast(page, "Dhruv's sheets are view only")
    await expect(notice).toBeVisible()
    await page.keyboard.press(']')
    await page.keyboard.press('[')
    await page.keyboard.press('w')
    await expect(notice).toHaveCount(1)
    await expect(first).toHaveText(before)
  })

  test('your own tab keeps every control', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    await expect(page.getByTestId('view-only-note')).toHaveCount(0)
    const details = expandedRow(page)
    await expect(details.getByRole('radio').first()).toBeVisible()
    await expect(details.getByRole('button', { name: 'Mark lost' })).toBeVisible()
    await expect(details.getByRole('button', { name: 'Copy to my sheet' })).toHaveCount(0)
  })

  test('Copy to my sheet makes a linked row in your tab', async ({ page }) => {
    await openSheet(page, 'dhruv', 'investors', ids.kiranSethi)
    const name =
      (
        await gridRow(page, ids.kiranSethi).locator('[role="gridcell"]').first().textContent()
      )?.trim() ?? ''

    await expandedRow(page).getByRole('button', { name: 'Copy to my sheet' }).click()
    await page.getByRole('menuitem', { name: 'Connectors' }).click()
    const copied = toast(page, 'Copied to Connectors')
    await expect(copied).toBeVisible()
    await copied.getByRole('button', { name: 'Open' }).click()

    await expect(page).toHaveURL(/\/m\/dawar\/connectors\?row=/)
    const details = expandedRow(page)
    await expect(details).toBeVisible()
    await expect(details.getByText('Same person')).toBeVisible()
    await expect(details.getByTestId('link-chip').filter({ hasText: name })).toBeVisible()
    await expect(page.getByTestId('view-only-note')).toHaveCount(0)
  })
})
