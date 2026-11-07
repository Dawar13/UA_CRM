import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { focusGrid, grid, gridRow, ids, openSheet, reloadApp } from './helpers'

// Cell formatting (D-049) in Dawar · Customers: fill colours, wrapped columns, row heights.

function cell(row: Locator, key: string): Locator {
  return row.locator(`[data-col="${key}"]`)
}

async function rowHeight(row: Locator): Promise<number> {
  return Math.round((await row.boundingBox())?.height ?? 0)
}

async function fill(page: Page, target: Locator, name: string): Promise<void> {
  await target.click({ button: 'right' })
  await page.getByTestId('cell-menu').getByRole('menuitem', { name }).click()
}

test.describe('cell formatting', () => {
  test('a cell takes a fill colour from the right-click menu, and keeps it', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await fill(page, cell(gridRow(page, ids.rohanMehta), 'company'), 'Fill Teal')
    await expect(cell(gridRow(page, ids.rohanMehta), 'company')).toHaveAttribute(
      'data-fill',
      'teal',
    )

    await reloadApp(page)
    const company = cell(gridRow(page, ids.rohanMehta), 'company')
    await expect(company).toHaveAttribute('data-fill', 'teal')

    await fill(page, company, 'No fill')
    await expect(company).not.toHaveAttribute('data-fill')
  })

  test('several selected rows are filled at once', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await cell(gridRow(page, ids.rohanMehta), 'title').click()
    await focusGrid(page)
    await page.keyboard.press('Shift+ArrowDown')
    await fill(page, cell(gridRow(page, ids.sunitaKulkarni), 'title'), 'Fill Amber')
    await expect(cell(gridRow(page, ids.rohanMehta), 'title')).toHaveAttribute('data-fill', 'amber')
    await expect(cell(gridRow(page, ids.sunitaKulkarni), 'title')).toHaveAttribute(
      'data-fill',
      'amber',
    )
  })

  test('a wrapped column shows its whole text and the row grows to fit', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await cell(row, 'company').click()
    await page.keyboard.type('Hosur Precision Forge and Allied Castings Private Limited, Unit Two')
    await page.keyboard.press('Enter')
    expect(await rowHeight(row)).toBe(36)

    await grid(page)
      .getByRole('columnheader', { name: /^Company/ })
      .hover()
    await page.getByRole('button', { name: 'Company column options' }).click()
    await page.getByRole('menuitem', { name: 'Wrap text' }).click()
    await expect.poll(() => rowHeight(gridRow(page, ids.rohanMehta))).toBeGreaterThan(40)

    await reloadApp(page)
    await expect.poll(() => rowHeight(gridRow(page, ids.rohanMehta))).toBeGreaterThan(40)
  })

  test("dragging a row's edge makes it taller; a double-click resets it", async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    const handle = row.locator('[data-row-resize]')
    const box = await handle.boundingBox()
    if (!box) throw new Error('No resize handle')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => rowHeight(gridRow(page, ids.rohanMehta))).toBeGreaterThanOrEqual(74)

    await reloadApp(page)
    await expect.poll(() => rowHeight(gridRow(page, ids.rohanMehta))).toBeGreaterThanOrEqual(74)

    await gridRow(page, ids.rohanMehta).locator('[data-row-resize]').dblclick()
    await expect.poll(() => rowHeight(gridRow(page, ids.rohanMehta))).toBe(36)
  })

  test("another member's tab has no format menu and no row handles", async ({ page }) => {
    await openSheet(page, 'dhruv', 'customers')
    const first = grid(page).locator('[role="row"][data-row-id]').first()
    await expect(first.locator('[data-row-resize]')).toHaveCount(0)
    await first.locator('[role="gridcell"]').nth(1).click({ button: 'right' })
    await expect(page.getByTestId('cell-menu')).toHaveCount(0)
  })
})
