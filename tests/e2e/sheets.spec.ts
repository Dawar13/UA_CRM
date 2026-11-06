import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { grid, gridRow, ids, memberTab, openSheet, reloadApp, sheetTab, toast } from './helpers'

// Sheets, columns, stages and the team (Phase 1 M1.4), signed in as Dawar.

async function sheetMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Sheet options' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.describe('sheets, columns, stages and the team', () => {
  test('a new sheet from a template, renamed, moved and deleted with Undo', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.getByTestId('new-sheet').click()
    const dialog = page.getByRole('dialog', { name: 'New sheet' })
    await dialog.getByRole('radio', { name: /Investors/ }).check()
    await dialog.getByLabel('Name').fill('Angels')
    await dialog.getByRole('button', { name: 'Create sheet' }).click()
    await expect(page).toHaveURL(/\/m\/dawar\/angels$/)
    await expect(sheetTab(page, 'Angels')).toHaveAttribute('aria-selected', 'true')

    await sheetMenu(page, 'Rename sheet')
    const rename = page.getByRole('dialog', { name: 'Rename sheet' })
    await rename.getByLabel('Name').fill('Angel investors')
    await rename.getByRole('button', { name: 'Rename' }).click()
    await expect(sheetTab(page, 'Angel investors')).toBeVisible()

    await sheetMenu(page, 'Move left')
    const tabs = page.getByRole('tablist', { name: 'Sheets' }).getByRole('tab')
    await expect(tabs.nth(4)).toHaveAccessibleName('Angel investors')

    await sheetMenu(page, 'Delete sheet')
    const moved = toast(page, 'Moved Angel investors to Trash')
    await expect(moved).toBeVisible()
    await expect(sheetTab(page, 'Angel investors')).toHaveCount(0)
    await moved.getByRole('button', { name: 'Undo' }).click()
    await expect(sheetTab(page, 'Angel investors')).toBeVisible()
  })

  test('stages are renamed, and removing one asks where its rows go', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.getByTestId('edit-stages').click()
    const dialog = page.getByRole('dialog', { name: 'Stages of Customers' })
    await dialog.getByLabel('Stage 1 name').fill('Spotted')
    // Remove First call, where Rohan Mehta is.
    await dialog.getByRole('button', { name: 'Remove First call' }).click()
    await dialog.getByRole('button', { name: 'Next' }).click()
    const moves = page.getByRole('dialog', { name: 'Where should those rows go?' })
    await moves.getByRole('combobox').first().selectOption({ label: 'Plant visit' })
    await moves.getByRole('button', { name: 'Save stages' }).click()
    await expect(toast(page, 'Stages saved')).toBeVisible()

    await reloadApp(page)
    await expect(page.getByTestId('edit-stages')).toHaveText('6 stages')
    await expect(gridRow(page, ids.rohanMehta).locator('[data-stage-label]')).toHaveText(
      'Plant visit',
    )
  })

  test('columns are added, hidden from the header, and change type with a preview', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers')
    await sheetMenu(page, 'Columns')
    const dialog = page.getByRole('dialog', { name: 'Columns of Customers' })
    const add = dialog.getByRole('form', { name: 'Add a column' })
    await add.getByLabel('New column').fill('Budget')
    await add.getByRole('button', { name: 'Add' }).click()
    await expect(dialog.getByLabel('Name of Budget')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(grid(page).getByRole('columnheader', { name: /Budget/ })).toBeVisible()

    // Type a value, then change the column to an amount: it converts.
    const row = gridRow(page, ids.rohanMehta)
    await row.locator('[data-col="budget"]').click()
    await page.keyboard.type('25L')
    await page.keyboard.press('Enter')
    await sheetMenu(page, 'Columns')
    await dialog.getByLabel('Type of Budget').selectOption({ label: 'Amount (₹)' })
    await expect(page.getByTestId('convert-preview')).toContainText('1 value convert')
    await page.getByRole('button', { name: 'Change to amount (₹)' }).click()
    await page.keyboard.press('Escape')
    await expect(row.locator('[data-col="budget"]')).toHaveText('₹25 L')

    // Hide it from the header menu.
    await grid(page)
      .getByRole('columnheader', { name: /Budget/ })
      .hover()
    await page.getByRole('button', { name: 'Budget column options' }).click()
    await page.getByRole('menuitem', { name: 'Hide column' }).click()
    await expect(grid(page).getByRole('columnheader', { name: /Budget/ })).toHaveCount(0)
  })

  test('an admin adds a member, whose tab starts with the UA templates', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Team' }).click()
    const team = page.getByRole('dialog', { name: 'Team' })
    const form = team.getByRole('form', { name: 'Add a member' })
    await form.getByLabel('Name').fill('Asha Raman')
    await form.getByLabel('Email').fill('asha@example.test')
    await form.getByRole('button', { name: 'Add' }).click()
    await expect(team.getByTestId('team-member').filter({ hasText: 'Asha Raman' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(memberTab(page, 'Asha Raman')).toBeVisible()

    // Asha's tab, seen by Dawar: view only, and empty.
    await memberTab(page, 'Asha Raman').click()
    await expect(page.getByText('Asha Raman has not made any sheets yet.')).toBeVisible()

    // Signed in as Asha: start with the templates.
    await page.evaluate(() => window.__uaTest?.signInAs('asha-raman'))
    await page.getByRole('button', { name: 'Start with the UA templates' }).click()
    await expect(sheetTab(page, 'Customers')).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Sheets' }).getByRole('tab')).toHaveCount(5)
  })
})
