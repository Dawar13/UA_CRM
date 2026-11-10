import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { expandedRow, focusGrid, grid, gridRow, ids, openSheet, reloadApp, toast } from './helpers'

// Quick add and the duplicate check (Phase 1 M1.6), in Dawar · Customers.

async function quickAdd(page: Page, text: string): Promise<void> {
  await focusGrid(page)
  await page.keyboard.press('/')
  const box = page.getByLabel('Quick add')
  await expect(box).toBeFocused()
  await box.fill(text)
  await box.press('Enter')
  await expect(page.getByTestId('quick-add-preview')).toBeVisible()
}

function previewField(page: Page, label: string) {
  return page
    .getByTestId('quick-add-preview')
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]')
}

test.describe('quick add', () => {
  test('a contact typed in the quick-add language is previewed, then saved', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await quickAdd(
      page,
      'Asha Rao / Plant Head @ Kovai Pumps, Coimbatore\nwhy: two lines idle every week\n#warm #pilot_candidate stage: first call\nnext: fri send ROI note',
    )
    await expect(previewField(page, 'Name')).toHaveText('Asha Rao')
    await expect(previewField(page, 'Company')).toHaveText('Kovai Pumps')
    await expect(previewField(page, 'Plant location')).toHaveText('Coimbatore')
    await expect(previewField(page, 'Stage')).toHaveText('First call')
    await expect(previewField(page, 'Next action')).toContainText('send ROI note')
    await page.keyboard.press('Enter')
    await expect(toast(page, 'Added Asha Rao')).toBeVisible()
    const row = grid(page).locator('[role="row"][data-row-id]').filter({ hasText: 'Asha Rao' })
    await expect(row).toContainText('Warm')
    await expect(row).toContainText('First call')
    await expect(row).toContainText('pilot candidate')
  })

  test('the draft survives a reload', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    await page.keyboard.press('/')
    await page.getByLabel('Quick add').fill('Half typed / CEO')
    await page.keyboard.press('Escape')
    await reloadApp(page)
    await expect(page.getByTestId('quick-add')).toContainText('draft kept')
    await focusGrid(page)
    await page.keyboard.press('/')
    await expect(page.getByLabel('Quick add')).toHaveValue('Half typed / CEO')
  })

  test('the same phone in your tab blocks saving until you choose', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await quickAdd(page, 'R. Mehta\n98450 12345')
    const duplicate = page.getByTestId('duplicate')
    await expect(duplicate).toHaveAttribute('data-level', 'hard')
    await expect(duplicate).toContainText('Same phone as Rohan Mehta')
    await expect(duplicate.getByRole('button', { name: 'Merge' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Save/ })).toBeDisabled()

    await duplicate.getByRole('button', { name: 'Merge' }).click()
    await page.getByRole('button', { name: /^Save/ }).click()
    // Merged: no new row.
    await expect(grid(page).getByText('R. Mehta')).toHaveCount(0)
  })

  test("a match in another member's tab offers no merge", async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await quickAdd(page, 'Kiran Sethi')
    const duplicate = page.getByTestId('duplicate')
    await expect(duplicate).toContainText("Dhruv's Investors")
    await expect(duplicate.getByRole('button', { name: 'Merge' })).toHaveCount(0)
    await expect(duplicate.getByRole('button', { name: 'Open their row' })).toBeVisible()
    await duplicate.getByRole('button', { name: 'Keep both, linked' }).click()
    await page.getByRole('button', { name: /^Save/ }).click()
    await expect(toast(page, 'Added Kiran Sethi')).toBeVisible()
  })

  test('> logs a touch on the selected row and sets its next action', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.hiteshPatel)
    await quickAdd(page, '> called, wants a pilot, quote by 15 nov')
    await expect(page.getByTestId('quick-add-preview')).toContainText('Log on Hitesh Patel')
    await page.keyboard.press('Enter')
    await expect(toast(page, 'Logged on Hitesh Patel')).toBeVisible()
    await expect(
      expandedRow(page).getByTestId('history-entry').filter({ hasText: 'Called, wants a pilot' }),
    ).toBeVisible()
    await expect(gridRow(page, ids.hiteshPatel).locator('[data-col="nextAction"]')).toContainText(
      '15 Nov',
    )
  })

  test('a signature pasted into the grid opens in quick add', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await grid(page).evaluate((el) => {
      const data = new DataTransfer()
      data.setData(
        'text/plain',
        'Meera Iyer\nCOO | Lakshmi Textiles\nM: +91 98765 43210 | meera@lakshmitex.in',
      )
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
    })
    await expect(previewField(page, 'Name')).toHaveText('Meera Iyer')
    await expect(previewField(page, 'Company')).toHaveText('Lakshmi Textiles')
    await expect(previewField(page, 'Phone')).toHaveText('+91 98765 43210')
  })

  test('a row added with N is checked for duplicates', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    await page.keyboard.press('n')
    await page.keyboard.type('Sunita Kulkarni')
    await page.keyboard.press('Enter')
    const review = page.getByRole('dialog', { name: 'This may already be in the CRM' })
    await expect(review).toBeVisible()
    await review.getByRole('button', { name: 'Remove the new row' }).click()
    await review.getByRole('button', { name: 'Done' }).click()
    await expect(
      grid(page).locator('[role="row"][data-row-id]').filter({ hasText: 'Sunita Kulkarni' }),
    ).toHaveCount(1)
  })
})

test.describe('reading with AI (D-055; sample mode stands in for the AI)', () => {
  test('Read with AI fills quick add, previews, and Restore brings back the typing', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    await page.keyboard.press('/')
    const box = page.getByLabel('Quick add', { exact: true })
    await box.fill('Kavita Iyer\nruns quality at Nashik Gears')
    await box.press('Control+Enter')
    await expect(page.getByTestId('quick-add-preview')).toContainText('Read by AI from your text')
    await expect(previewField(page, 'Name')).toHaveText('Kavita Iyer')
    await expect(previewField(page, 'Notes')).toHaveText('runs quality at Nashik Gears')

    await page.keyboard.press('Escape')
    await expect(box).toHaveValue('Kavita Iyer\nnote: runs quality at Nashik Gears')
    await page.getByRole('button', { name: 'Restore what I typed' }).click()
    await expect(box).toHaveValue('Kavita Iyer\nruns quality at Nashik Gears')
  })

  test('an uploaded file is read into a contact and saved', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    await page.keyboard.press('/')
    await page.getByTestId('quick-add-file').setInputFiles({
      name: 'visiting-card.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 sample'),
    })
    await expect(page.getByTestId('quick-add-preview')).toContainText(
      'Read by AI from visiting-card.pdf',
    )
    await expect(previewField(page, 'Name')).toHaveText('Asha Rao')
    await page.getByRole('button', { name: /^Save/ }).click()
    await expect(toast(page, 'Added Asha Rao')).toBeVisible()
  })

  test('a file it cannot read says so', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    await page.keyboard.press('/')
    await page.getByTestId('quick-add-file').setInputFiles({
      name: 'notes.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('PK'),
    })
    await expect(
      toast(page, /can’t be read\. Use a PDF, a photo, a CSV or a text file/),
    ).toBeVisible()
  })
})
