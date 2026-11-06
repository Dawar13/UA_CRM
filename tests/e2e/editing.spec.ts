import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { focusGrid, grid, gridRow, ids, openSheet, reloadApp, toast } from './helpers'

// Signed in as Dawar, editing Dawar · Customers (CLAUDE.md §3.1, Phase 1 M1.3).

function cell(row: Locator, key: string): Locator {
  return row.locator(`[data-col="${key}"]`)
}

function editor(page: Page): Locator {
  return page.getByTestId('cell-editor')
}

/** Clicks a cell to make it the active one (a click on a cell other than Name picks it). */
async function pick(row: Locator, key: string): Promise<void> {
  await cell(row, key).click()
}

async function paste(page: Page, text: string): Promise<void> {
  await grid(page).evaluate((el, value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, text)
}

test.describe('editing the grid', () => {
  test('typing replaces a cell; Enter saves; the value persists', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await pick(row, 'title')
    await page.keyboard.type('Head of Plant')
    await expect(editor(page)).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(editor(page)).toHaveCount(0)
    await expect(cell(row, 'title')).toHaveText('Head of Plant')

    await reloadApp(page)
    await expect(cell(gridRow(page, ids.rohanMehta), 'title')).toHaveText('Head of Plant')
  })

  test('Esc cancels an edit', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await pick(row, 'company')
    await page.keyboard.press('Enter')
    await page.keyboard.type(' and Sons')
    await page.keyboard.press('Escape')
    await expect(editor(page)).toHaveCount(0)
    await expect(cell(row, 'company')).toHaveText('Hosur Precision Forge')
  })

  test('amounts accept lakh and crore shorthands, and wrong values are explained', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await pick(row, 'ticketEstimate')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('lots')
    await page.keyboard.press('Enter')
    await expect(editor(page).getByRole('alert')).toHaveText(
      'Type an amount, like 25L, 1.2cr or 45,000',
    )
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('1.2cr')
    await expect(editor(page)).toContainText('₹1.2 Cr')
    await page.keyboard.press('Enter')
    await expect(cell(row, 'ticketEstimate')).toHaveText('₹1.2 Cr')
  })

  test('a next action takes its date from the start of the line', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await pick(row, 'nextAction')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('mid Nov plant visit')
    await page.keyboard.press('Enter')
    await expect(cell(row, 'nextAction')).toContainText('Mid Nov')
    await expect(cell(row, 'nextAction')).toContainText('plant visit')
  })

  test('dropdowns filter as you type', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await pick(row, 'archetype')
    await page.keyboard.press('Enter')
    await page.keyboard.type('pharm')
    await expect(editor(page).getByRole('option')).toHaveText(['Pharma'])
    await page.keyboard.press('Enter')
    await expect(cell(row, 'archetype')).toHaveText('Pharma')
  })

  test('N adds a row and its name is typed straight in', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    await page.keyboard.press('n')
    await expect(editor(page)).toBeVisible()
    await page.keyboard.type('Asha Rao')
    await page.keyboard.press('Enter')
    await expect(grid(page).getByText('Asha Rao')).toBeVisible()

    await reloadApp(page)
    await expect(grid(page).getByText('Asha Rao')).toBeVisible()
    await expect(page.getByRole('tab', { name: /Customers/ })).toContainText('13')
  })

  test('selected rows move to Trash with Undo, and come back from Trash', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const hitesh = gridRow(page, ids.hiteshPatel)
    await pick(hitesh, 'company')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(page.locator('[role="row"][data-selected]')).toHaveCount(2)
    await page.keyboard.press('Delete')
    const moved = toast(page, 'Moved 2 rows to Trash')
    await expect(moved).toBeVisible()
    await expect(hitesh).toHaveCount(0)

    await moved.getByRole('button', { name: 'Undo' }).click()
    await expect(gridRow(page, ids.hiteshPatel)).toBeVisible()

    // Delete one row and restore it from the Trash panel.
    await pick(gridRow(page, ids.hiteshPatel), 'company')
    await page.keyboard.press('ControlOrMeta+Delete')
    await expect(gridRow(page, ids.hiteshPatel)).toHaveCount(0)
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Trash' }).click()
    const trash = page.getByTestId('trash-panel')
    const item = trash.getByTestId('trash-item').filter({ hasText: 'Hitesh Patel' })
    await expect(item).toContainText('Row · Customers')
    await item.getByRole('button', { name: 'Restore' }).click()
    await expect(gridRow(page, ids.hiteshPatel)).toBeVisible()
    await expect(trash.getByTestId('trash-item')).toHaveCount(0)
  })

  test('a block pasted from a spreadsheet fills cells from the active one', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await pick(row, 'title')
    // Title, then Phone (the next visible column).
    await paste(page, 'COO\t098450 99999')
    await expect(toast(page, 'Pasted into 1 row')).toBeVisible()
    await expect(cell(row, 'title')).toHaveText('COO')
    await expect(cell(row, 'phone')).toHaveText('+91 98450 99999')

    // From the add line, pasted rows are added.
    await focusGrid(page)
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('ArrowDown')
    await paste(page, 'Meera Iyer\nKabir Shah')
    await expect(grid(page).getByText('Meera Iyer')).toBeVisible()
    await expect(grid(page).getByText('Kabir Shah')).toBeVisible()
  })

  test('Ctrl+Z undoes the last edit and Ctrl+Shift+Z redoes it', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await pick(row, 'title')
    await page.keyboard.type('CEO')
    await page.keyboard.press('Enter')
    await expect(cell(row, 'title')).toHaveText('CEO')

    await page.keyboard.press('ControlOrMeta+z')
    await expect(cell(row, 'title')).toHaveText('Plant Head')
    await expect(toast(page, 'Undone: Edit Title')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(cell(row, 'title')).toHaveText('CEO')
  })

  test("another member's tab refuses typing, Delete and paste", async ({ page }) => {
    await openSheet(page, 'dhruv', 'investors')
    await focusGrid(page)
    const before = (await grid(page).textContent()) ?? ''
    await page.keyboard.type('x')
    await expect(toast(page, "Dhruv's sheets are view only")).toBeVisible()
    await page.keyboard.press('Delete')
    await paste(page, 'Someone')
    await expect(editor(page)).toHaveCount(0)
    await expect(page.getByTestId('add-row')).toHaveCount(0)
    await expect(grid(page)).toHaveText(before)
  })
})
