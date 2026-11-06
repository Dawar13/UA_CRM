import { expect, test } from '../support/fixtures'
import { expandedRow, grid, gridRow, ids, openSheet, reloadApp, toast } from './helpers'

// Contact essentials (Phase 1 M1.5): history, next action, contact buttons, files, tags.

test.describe('contact essentials', () => {
  test('a touch is logged, edited and deleted with Undo', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.hiteshPatel)
    const details = expandedRow(page)
    const form = details.getByRole('form', { name: 'Log' })
    await form.getByLabel('Kind').selectOption('call')
    await form.getByLabel('What happened').fill('Wants a pilot on line 3')
    await form.getByRole('button', { name: 'Log' }).click()
    const entry = details
      .getByTestId('history-entry')
      .filter({ hasText: 'Wants a pilot on line 3' })
    await expect(entry).toBeVisible()
    // Last touch follows.
    await expect(gridRow(page, ids.hiteshPatel).locator('[data-col="lastTouch"]')).toHaveText(
      '5 Nov',
    )

    await entry.hover()
    await entry.getByRole('button', { name: 'Edit this touch' }).click()
    const edit = details.getByRole('form', { name: 'Save' })
    await edit.getByLabel('What happened').fill('Wants a pilot on line 4')
    await edit.getByRole('button', { name: 'Save' }).click()
    const edited = details.getByTestId('history-entry').filter({ hasText: 'line 4' })
    await expect(edited).toBeVisible()

    await edited.hover()
    await edited.getByRole('button', { name: 'Delete this touch' }).click()
    await expect(edited).toHaveCount(0)
    await toast(page, 'Touch deleted').getByRole('button', { name: 'Undo' }).click()
    await expect(details.getByTestId('history-entry').filter({ hasText: 'line 4' })).toBeVisible()
  })

  test('the next action is edited in place, date first', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.hiteshPatel)
    await expandedRow(page).getByTestId('edit-next-action').click()
    const input = expandedRow(page).getByLabel('Next action')
    await input.fill('mid Nov plant visit')
    await expect(expandedRow(page)).toContainText('Mid Nov · plant visit')
    await input.press('Enter')
    await expect(gridRow(page, ids.hiteshPatel).locator('[data-col="nextAction"]')).toContainText(
      'plant visit',
    )
    await reloadApp(page)
    await expect(gridRow(page, ids.hiteshPatel).locator('[data-col="nextAction"]')).toContainText(
      'Mid Nov',
    )
  })

  test('call, WhatsApp and email open the right links and offer to log the touch', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    const buttons = expandedRow(page).getByTestId('contact-buttons')
    await expect(buttons.getByRole('link', { name: 'Call' })).toHaveAttribute(
      'href',
      'tel:+919845012345',
    )
    await expect(buttons.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/919845012345',
    )
    await expect(buttons.getByRole('link', { name: 'Email' })).toHaveAttribute(
      'href',
      'mailto:rohan@hosurprecisionforge.example',
    )
    // Follow the call link without leaving the page.
    await buttons.getByRole('link', { name: 'Call' }).evaluate((a) => {
      a.addEventListener('click', (e) => e.preventDefault(), { once: true })
      ;(a as HTMLAnchorElement).click()
    })
    await toast(page, 'Log this call?').getByRole('button', { name: 'Log it' }).click()
    await expect(
      expandedRow(page).getByTestId('history-entry').filter({ hasText: 'Called' }),
    ).toBeVisible()
  })

  test('files are attached, persist, and are removed', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.hiteshPatel)
    await expandedRow(page)
      .locator('input[type="file"]')
      .setInputFiles({ name: 'proposal.txt', mimeType: 'text/plain', buffer: Buffer.from('ROI') })
    const files = expandedRow(page).getByTestId('files')
    await expect(files.getByRole('button', { name: /^proposal\.txt/ })).toBeVisible()
    await reloadApp(page)
    await expect(expandedRow(page).getByTestId('files')).toContainText('proposal.txt')
    await expandedRow(page).getByRole('button', { name: 'Remove proposal.txt' }).click()
    await expect(expandedRow(page).getByTestId('files')).not.toContainText('proposal.txt')
  })

  test('tags are renamed by their creator, but not while others use them', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Tags' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tags' })

    const ev = dialog.getByLabel('Name of EV')
    await ev.fill('electric vehicles')
    await ev.press('Enter')
    await expect(dialog.getByLabel('Name of electric vehicles')).toBeVisible()

    const foundry = dialog.getByLabel('Name of foundry')
    await foundry.fill('forging')
    await foundry.press('Enter')
    await expect(toast(page, "This tag is used on Dhruv's rows")).toBeVisible()
    await expect(dialog.getByLabel('Name of foundry')).toBeVisible()
  })

  test('a sheet is filtered by tag', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.getByRole('button', { name: 'Filter by tag' }).click()
    await page.getByRole('menuitem', { name: /foundry/ }).click()
    await expect(page.getByTestId('tag-filter')).toContainText('foundry')
    const rows = grid(page).locator('[role="row"][data-row-id]')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(12)
    await page.getByRole('button', { name: 'Stop filtering by foundry' }).click()
    await expect(rows).toHaveCount(12)
  })
})
