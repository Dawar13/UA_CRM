import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import {
  expandedRow,
  grid,
  gridRow,
  ids,
  nameCell,
  openSheet,
  stageDots,
  warmthChip,
} from './helpers'

/** Fails if focus has fallen back to <body> (or nowhere). */
async function expectFocusKept(page: Page) {
  const tag = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE')
  expect(tag, 'focus must never fall back to the page body').not.toMatch(/^(BODY|HTML|NONE)$/)
}

/** The 1-based aria-colindex of the active cell (aria-activedescendant). */
async function activeColIndex(page: Page): Promise<number> {
  const id = await grid(page).getAttribute('aria-activedescendant')
  if (!id) return Number.NaN
  return Number(await page.locator(`[id="${id}"]`).getAttribute('aria-colindex'))
}

async function expectActiveRow(page: Page, rowId: string) {
  await expect(grid(page).locator('[role="row"][data-active]')).toHaveAttribute(
    'data-row-id',
    rowId,
  )
}

async function expectActiveCol(page: Page, colIndex: number) {
  await expect.poll(() => activeColIndex(page)).toBe(colIndex)
}

test.describe('keyboard', () => {
  test('a keyboard-only journey never needs the mouse and never loses focus', async ({ page }) => {
    // A long journey of many steps: give it the slow-test budget.
    test.slow()
    await openSheet(page, 'dawar', 'customers')

    // Tab from the top of the page to the grid, which is a single tab stop.
    let reached = false
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press('Tab')
      reached = await grid(page).evaluate((el) => el === document.activeElement)
    }
    expect(reached, 'Tab reaches the grid').toBe(true)
    await expect(grid(page)).toHaveAttribute('aria-activedescendant', /.+/)
    await expectActiveRow(page, ids.rohanMehta)

    // Arrows move the active cell.
    await page.keyboard.press('ArrowDown')
    await expectActiveRow(page, ids.sunitaKulkarni)
    await expect(gridRow(page, ids.sunitaKulkarni)).toHaveAttribute('aria-selected', 'true')
    await expect(gridRow(page, ids.rohanMehta)).toHaveAttribute('aria-selected', 'false')
    await page.keyboard.press('ArrowRight')
    await expectActiveCol(page, 2)
    await page.keyboard.press('End')
    const lastCol = Number(await grid(page).getAttribute('aria-colcount'))
    await expectActiveCol(page, lastCol)
    await page.keyboard.press('Home')
    await expectActiveCol(page, 1)
    await page.keyboard.press('ControlOrMeta+End')
    await expectActiveRow(page, ids.gauravBansal)
    await page.keyboard.press('ControlOrMeta+Home')
    await expectActiveRow(page, ids.rohanMehta)
    await page.keyboard.press('PageDown')
    await expect(gridRow(page, ids.rohanMehta)).toHaveAttribute('aria-selected', 'false')
    await page.keyboard.press('PageUp')
    await expectActiveRow(page, ids.rohanMehta)
    await page.keyboard.press('ArrowDown')
    await expectActiveRow(page, ids.sunitaKulkarni)
    await expect(grid(page)).toBeFocused()

    // Enter expands the active row; focus stays on the grid.
    await page.keyboard.press('Enter')
    const row = gridRow(page, ids.sunitaKulkarni)
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'true')
    await expect(expandedRow(page)).toBeVisible()
    await expect(grid(page)).toBeFocused()

    // W cycles warmth (Waiting → Cold) and ] moves the stage (Plant visit → Pilot scoped).
    await expect(warmthChip(row)).toHaveAccessibleName('Warmth: Waiting')
    await page.keyboard.press('w')
    await expect(warmthChip(row)).toHaveAccessibleName('Warmth: Cold')
    await expect(stageDots(row)).toHaveAccessibleName('Stage 4 of 7: Plant visit')
    await page.keyboard.press(']')
    await expect(stageDots(row)).toHaveAccessibleName('Stage 5 of 7: Pilot scoped')
    await expect(grid(page)).toBeFocused()

    // Esc collapses.
    await page.keyboard.press('Escape')
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'false')
    await expect(expandedRow(page)).toHaveCount(0)
    await expect(grid(page)).toBeFocused()

    // ? opens the shortcut sheet; Esc closes it and focus returns to the grid.
    await page.keyboard.press('?')
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByTestId('shortcut-sheet')).toContainText(
      'Cycle warmth on the active row',
    )
    await expectFocusKept(page)
    await expect(sheet).toContainText('Toggle the side panel')
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(grid(page)).toBeFocused()

    // Ctrl/Cmd+. hides and shows the side panel without moving focus.
    await expect(page.getByTestId('right-panel')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+.')
    await expect(page.getByTestId('right-panel')).toHaveCount(0)
    await expect(grid(page)).toBeFocused()
    await page.keyboard.press('ControlOrMeta+.')
    await expect(page.getByTestId('right-panel')).toBeVisible()
    await expect(grid(page)).toBeFocused()

    // Ctrl/Cmd+K opens search; Esc returns to the grid.
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.getByTestId('command-palette')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('command-palette')).toBeHidden()
    await expect(grid(page)).toBeFocused()
    await expectFocusKept(page)
  })

  test('Esc inside the expanded row collapses it and returns focus to the grid', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    // Tab into the expanded row's controls.
    await grid(page).focus()
    await page.keyboard.press('Tab')
    const focusedInside = await expandedRow(page).evaluate((el) =>
      el.contains(document.activeElement),
    )
    expect(focusedInside, 'Tab from the grid moves into the expanded row').toBe(true)

    await page.keyboard.press('Escape')
    await expect(nameCell(gridRow(page, ids.rohanMehta))).toHaveAttribute('aria-expanded', 'false')
    await expect(grid(page)).toBeFocused()
  })

  test('the stage tracker and the Undo toast work from the keyboard', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    const move = expandedRow(page).getByRole('button', { name: 'Move to Plant visit' })
    await move.focus()
    await expect(move).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(stageDots(gridRow(page, ids.rohanMehta))).toHaveAccessibleName(
      'Stage 4 of 7: Plant visit',
    )

    // The Undo action in the toast is reachable without the mouse too.
    const undo = page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' })
    await undo.focus()
    await page.keyboard.press('Enter')
    await expect(stageDots(gridRow(page, ids.rohanMehta))).toHaveAccessibleName(
      'Stage 3 of 7: First call',
    )

    // Mark lost and Reopen by keyboard.
    await expandedRow(page).getByRole('button', { name: 'Mark lost' }).focus()
    await page.keyboard.press('Enter')
    await expect(expandedRow(page).getByTestId('lost-line')).toBeVisible()
    await expandedRow(page).getByRole('button', { name: 'Reopen' }).focus()
    await page.keyboard.press('Space')
    await expect(expandedRow(page).getByTestId('lost-line')).toHaveCount(0)
  })

  test('focus stays in the stage tracker after a keyboard move, Mark lost and Reopen', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    const tracker = expandedRow(page).getByTestId('stage-tracker')

    await tracker.getByRole('button', { name: 'Move to Plant visit' }).focus()
    await page.keyboard.press('Enter')
    await expect(stageDots(gridRow(page, ids.rohanMehta))).toHaveAccessibleName(
      'Stage 4 of 7: Plant visit',
    )
    await expectFocusKept(page)
    expect(await tracker.evaluate((el) => el.contains(document.activeElement))).toBe(true)

    await tracker.getByRole('button', { name: 'Mark lost' }).focus()
    await page.keyboard.press('Enter')
    await expect(tracker.getByTestId('lost-line')).toBeVisible()
    await expectFocusKept(page)
    expect(await tracker.evaluate((el) => el.contains(document.activeElement))).toBe(true)

    await tracker.getByRole('button', { name: 'Reopen' }).focus()
    await page.keyboard.press('Enter')
    await expect(tracker.getByTestId('lost-line')).toHaveCount(0)
    await expectFocusKept(page)
    expect(await tracker.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  })
})
