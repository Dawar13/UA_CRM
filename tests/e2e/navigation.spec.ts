import type { Page } from '@playwright/test'
import { expect, gotoApp, test } from '../support/fixtures'
import {
  expandedRow,
  grid,
  gridRow,
  ids,
  memberTab,
  nameCell,
  openSheet,
  reloadApp,
  rowUrl,
  sheetNames,
  sheetTab,
} from './helpers'

/** The open member's sheet tabs, by accessible name (the visual row count is not part of it). */
async function expectSheetTabs(page: Page, names: readonly string[]) {
  const tabs = page.getByRole('tablist', { name: 'Sheets' }).getByRole('tab')
  await expect(tabs).toHaveCount(names.length)
  for (const [i, name] of names.entries()) {
    await expect(tabs.nth(i)).toHaveAccessibleName(name)
  }
}

test.describe('navigation', () => {
  test('/ opens Dawar · Customers, and switching to Dhruv shows his sheets', {
    tag: '@smoke',
  }, async ({ page }) => {
    await gotoApp(page, '/', { waitForReady: true })
    await expect(page).toHaveURL(/\/m\/dawar\/customers$/)
    await expect(memberTab(page, 'Dawar')).toHaveAttribute('aria-selected', 'true')
    await expectSheetTabs(page, sheetNames.dawar)
    // Each tab shows a subtle row count.
    await expect(sheetTab(page, 'Customers')).toContainText('12')
    await expect(grid(page)).toHaveAttribute('aria-label', 'Customers')
    await expect(gridRow(page, ids.rohanMehta)).toContainText('Rohan Mehta')

    await memberTab(page, 'Dhruv').click()

    await expect(page).toHaveURL(/\/m\/dhruv\/customers$/)
    await expect(memberTab(page, 'Dhruv')).toHaveAttribute('aria-selected', 'true')
    await expect(memberTab(page, 'Dawar')).toHaveAttribute('aria-selected', 'false')
    await expectSheetTabs(page, sheetNames.dhruv)
    await expect(grid(page).locator('[role="row"][data-row-id]')).toHaveCount(5)
    await expect(gridRow(page, 'r-dhruv-customers-01')).toContainText('Naveen Gowda')
    await expect(gridRow(page, ids.rohanMehta)).toHaveCount(0)
  })

  test('switching sheets updates the URL and the grid', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await expect(grid(page).locator('[role="row"][data-row-id]')).toHaveCount(12)

    await sheetTab(page, 'Investors').click()
    await expect(page).toHaveURL(/\/m\/dawar\/investors$/)
    await expect(sheetTab(page, 'Investors')).toHaveAttribute('aria-selected', 'true')
    await expect(grid(page)).toHaveAttribute('aria-label', 'Investors')
    await expect(grid(page).locator('[role="row"][data-row-id]')).toHaveCount(6)
    await expect(gridRow(page, 'r-dawar-investors-01')).toContainText('Ananya Krishnan')
    // Investors has its own columns.
    await expect(grid(page).getByRole('columnheader', { name: 'Investor type' })).toBeVisible()

    await sheetTab(page, 'Service providers').click()
    await expect(page).toHaveURL(/\/m\/dawar\/service-providers$/)
    await expect(grid(page)).toHaveAttribute('aria-label', 'Service providers')
    await expect(grid(page).locator('[role="row"][data-row-id]')).toHaveCount(4)

    // Arrow keys move along the sheet tabs and follow the selection.
    await sheetTab(page, 'Service providers').press('ArrowLeft')
    await expect(page).toHaveURL(/\/m\/dawar\/connectors$/)
    await expect(sheetTab(page, 'Connectors')).toBeFocused()
    await expect(grid(page)).toHaveAttribute('aria-label', 'Connectors')
  })

  test('the last sheet per member is restored after a reload', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await sheetTab(page, 'Connectors').click()
    await expect(page).toHaveURL(/\/m\/dawar\/connectors$/)

    await memberTab(page, 'Dhruv').click()
    await expect(page).toHaveURL(/\/m\/dhruv\/customers$/)
    await sheetTab(page, 'Investors').click()
    await expect(page).toHaveURL(/\/m\/dhruv\/investors$/)

    // A reload keeps the tab and sheet on screen.
    await reloadApp(page)
    await expect(page).toHaveURL(/\/m\/dhruv\/investors$/)
    await expect(grid(page)).toHaveAttribute('aria-label', 'Investors')

    // The root always lands on the signed-in member's own tab, at their last sheet (Phase 1:
    // the signed-in member's tab is the landing tab).
    await gotoApp(page, '/', { waitForReady: true })
    await expect(page).toHaveURL(/\/m\/dawar\/connectors$/)

    // Each member keeps their own last sheet.
    await memberTab(page, 'Dawar').click()
    await expect(page).toHaveURL(/\/m\/dawar\/connectors$/)
    await expect(grid(page)).toHaveAttribute('aria-label', 'Connectors')
    await memberTab(page, 'Dhruv').click()
    await expect(page).toHaveURL(/\/m\/dhruv\/investors$/)
  })

  test('clicking the open sheet tab folds its front, and the fold is remembered', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers')
    const summary = () => page.getByRole('region', { name: 'Customers summary' })
    // With no saved choice the front starts open on tall screens and folded on short ones.
    const tall = (page.viewportSize()?.height ?? 0) >= 820
    await expect(summary()).toHaveAttribute('data-state', tall ? 'open' : 'closed')
    if (!tall) await sheetTab(page, 'Customers').click()
    await expect(summary()).toHaveAttribute('data-state', 'open')
    await expect(
      summary().getByRole('button', { name: 'Collapse the sheet summary' }),
    ).toHaveAttribute('aria-expanded', 'true')

    await sheetTab(page, 'Customers').click()
    await expect(summary()).toHaveAttribute('data-state', 'closed')
    await expect(summary()).toContainText('12 people')
    await expect(page).toHaveURL(/\/m\/dawar\/customers$/)

    await reloadApp(page)
    await expect(summary()).toHaveAttribute('data-state', 'closed')

    // Enter on the open tab unfolds it again.
    await sheetTab(page, 'Customers').press('Enter')
    await expect(summary()).toHaveAttribute('data-state', 'open')
    await expect(summary()).toContainText('Owned by Dawar · 7 stages', { ignoreCase: true })
  })

  test('a deep-linked row opens from its top, even when its details are taller than the view', async ({
    page,
  }) => {
    // Regression: with the folder front open the details no longer fit, and the grid used to
    // land at a timing-dependent offset that cut off the row and the stage tracker.
    await openSheet(page, 'dawar', 'customers', ids.sunitaKulkarni)
    await expect(expandedRow(page)).toBeVisible()
    const view = await grid(page).boundingBox()
    const row = await gridRow(page, ids.sunitaKulkarni).boundingBox()
    if (!view || !row) throw new Error('Expected the grid and the row to be on screen')
    // Just under the 32px header, never above it.
    expect(row.y).toBeGreaterThanOrEqual(view.y + 31)
    expect(row.y).toBeLessThanOrEqual(view.y + 32 + 36)
    await expect(
      expandedRow(page).getByRole('button', { name: 'Move to Pilot scoped' }),
    ).toBeInViewport()
  })

  test('a deep link with ?row= opens that row expanded', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.karthikSubramanian)

    const row = gridRow(page, ids.karthikSubramanian)
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'true')
    await expect(expandedRow(page)).toHaveCount(1)
    await expect(expandedRow(page)).toBeVisible()
    await expect(expandedRow(page).getByTestId('stage-tracker')).toBeVisible()
    // The details sit in the row directly after Karthik's.
    await expect(
      row.locator('xpath=following-sibling::*[1]').getByTestId('expanded-row'),
    ).toBeVisible()

    // Clicking the row collapses it and drops the parameter.
    await row.getByRole('gridcell').first().click()
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'false')
    await expect(expandedRow(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/m\/dawar\/customers$/)
  })

  test('an Introduced by chip jumps to the linked row in another member’s tab', async ({
    page,
  }) => {
    await openSheet(page, 'dhruv', 'investors', ids.kiranSethi)
    await expect(nameCell(gridRow(page, ids.kiranSethi))).toHaveAttribute('aria-expanded', 'true')

    const chip = expandedRow(page).getByRole('button', {
      name: 'Divya Kapoor Dawar · Connectors',
    })
    await expect(chip).toBeVisible()
    await chip.click()

    await expect(page).toHaveURL(rowUrl('dawar', 'connectors', ids.divyaKapoor))
    await expect(memberTab(page, 'Dawar')).toHaveAttribute('aria-selected', 'true')
    await expect(grid(page)).toHaveAttribute('aria-label', 'Connectors')
    await expect(nameCell(gridRow(page, ids.divyaKapoor))).toHaveAttribute('aria-expanded', 'true')
    await expect(
      gridRow(page, ids.divyaKapoor)
        .locator('xpath=following-sibling::*[1]')
        .getByTestId('expanded-row'),
    ).toBeVisible()
  })

  test('an unknown path shows a friendly page with a link home', async ({ page }) => {
    await gotoApp(page, '/no/such/page')
    await expect(page.getByTestId('not-found')).toBeVisible()
    await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible()

    await page.getByRole('link', { name: 'Go to your sheets' }).click()
    await expect(page).toHaveURL(/\/m\/dawar\/customers$/)
    await expect(grid(page)).toBeVisible()
  })

  test('an unknown sheet falls back to the member’s first sheet', async ({ page }) => {
    await gotoApp(page, '/m/dhruv/no-such-sheet', { waitForReady: true })
    await expect(page).toHaveURL(/\/m\/dhruv\/customers$/)
    await expect(grid(page)).toHaveAttribute('aria-label', 'Customers')
  })
})
