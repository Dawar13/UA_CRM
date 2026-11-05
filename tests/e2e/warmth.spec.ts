import { expect, test } from '../support/fixtures'
import {
  expandedRow,
  focusGrid,
  grid,
  gridRow,
  ids,
  nameCell,
  openSheet,
  reloadApp,
  toast,
  undoToast,
  warmthChip,
} from './helpers'

// Hitesh Patel (Dawar · Customers, row 4) has no warmth; Rohan Mehta (row 1) is Warm.

test.describe('warmth', () => {
  test('choosing from the menu sets warmth and persists across reload', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.hiteshPatel)
    await expect(warmthChip(row)).toHaveAccessibleName('Warmth: none, set warmth')

    await row.hover()
    await warmthChip(row).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitemradio')).toHaveText([/Warm/, /Waiting/, /Cold/])
    await menu.getByRole('menuitemradio', { name: /Cold/ }).click()

    await expect(menu).toBeHidden()
    await expect(warmthChip(row)).toHaveAccessibleName('Warmth: Cold')
    await expect(warmthChip(row)).toHaveAttribute('data-warmth', 'cold')
    await expect(toast(page, 'Warmth set to Cold')).toBeVisible()
    // Choosing from the menu does not expand the row.
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'false')

    await reloadApp(page)
    await expect(warmthChip(gridRow(page, ids.hiteshPatel))).toHaveAccessibleName('Warmth: Cold')
  })

  test('Undo reverts a warmth change, and the revert persists', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await expect(warmthChip(row)).toHaveAccessibleName('Warmth: Warm')

    await warmthChip(row).click()
    await page
      .getByRole('menu')
      .getByRole('menuitemradio', { name: /Waiting/ })
      .click()
    await expect(warmthChip(row)).toHaveAccessibleName('Warmth: Waiting')

    await undoToast(page, 'Warmth set to Waiting')
    await expect(warmthChip(row)).toHaveAccessibleName('Warmth: Warm')

    await reloadApp(page)
    await expect(warmthChip(gridRow(page, ids.rohanMehta))).toHaveAccessibleName('Warmth: Warm')
  })

  test('the menu digits and Clear work in the expanded row', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    const chip = warmthChip(expandedRow(page))
    await expect(chip).toHaveAccessibleName('Warmth: Warm')

    await chip.click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('2')
    await expect(page.getByRole('menu')).toBeHidden()
    await expect(chip).toHaveAccessibleName('Warmth: Waiting')
    // The grid row shows the same value.
    await expect(warmthChip(gridRow(page, ids.rohanMehta))).toHaveAccessibleName('Warmth: Waiting')

    await chip.click()
    await page.getByRole('menu').getByRole('menuitem', { name: /Clear/ }).click()
    await expect(chip).toHaveAccessibleName('Warmth: none, set warmth')
    await expect(toast(page, 'Warmth cleared')).toBeVisible()
    // The history records each change.
    const history = expandedRow(page).getByTestId('history-entry')
    await expect(history.filter({ hasText: 'Warmth: Warm → Waiting' })).toHaveCount(1)
    await expect(history.filter({ hasText: 'Warmth cleared' })).toHaveCount(1)

    await reloadApp(page)
    await expect(warmthChip(expandedRow(page))).toHaveAccessibleName('Warmth: none, set warmth')
  })

  test('W cycles warmth on the active row and persists across reload', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
    const row = gridRow(page, ids.hiteshPatel)
    await expect(row).toHaveAttribute('aria-selected', 'true')
    const chip = warmthChip(row)

    // empty → warm → waiting → cold → empty
    await page.keyboard.press('w')
    await expect(chip).toHaveAccessibleName('Warmth: Warm')
    await page.keyboard.press('w')
    await expect(chip).toHaveAccessibleName('Warmth: Waiting')
    await page.keyboard.press('w')
    await expect(chip).toHaveAccessibleName('Warmth: Cold')
    await page.keyboard.press('w')
    await expect(chip).toHaveAccessibleName('Warmth: none, set warmth')
    await page.keyboard.press('Shift+W')
    await expect(chip).toHaveAccessibleName('Warmth: Warm')
    await expect(grid(page)).toBeFocused()

    await reloadApp(page)
    await expect(warmthChip(gridRow(page, ids.hiteshPatel))).toHaveAccessibleName('Warmth: Warm')

    // Undo after W restores the previous value.
    await focusGrid(page)
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
    await page.keyboard.press('w')
    await expect(warmthChip(gridRow(page, ids.hiteshPatel))).toHaveAccessibleName('Warmth: Waiting')
    await undoToast(page, 'Warmth set to Waiting')
    await expect(warmthChip(gridRow(page, ids.hiteshPatel))).toHaveAccessibleName('Warmth: Warm')
    await reloadApp(page)
    await expect(warmthChip(gridRow(page, ids.hiteshPatel))).toHaveAccessibleName('Warmth: Warm')
  })
})
