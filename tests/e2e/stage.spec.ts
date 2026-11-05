import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import {
  expandedRow,
  focusGrid,
  gridRow,
  ids,
  nameCell,
  openSheet,
  reloadApp,
  stageDots,
  toast,
  undoToast,
} from './helpers'

// Rohan Mehta (Dawar · Customers) is at First call: Identified 2 Oct, Intro asked 8 Oct,
// First call 21 Oct. The clock is frozen at 5 Nov 2026, 10:00 IST.

function tracker(page: Page): Locator {
  return expandedRow(page).getByTestId('stage-tracker')
}

function trackerStage(page: Page, name: string): Locator {
  return tracker(page).getByRole('listitem').filter({ hasText: name })
}

async function expectAtFirstCall(page: Page) {
  const row = gridRow(page, ids.rohanMehta)
  await expect(stageDots(row)).toHaveAccessibleName('Stage 3 of 7: First call')
  const dots = stageDots(row).locator('[data-state]')
  await expect(dots).toHaveCount(7)
  await expect(dots.nth(1)).toHaveAttribute('data-state', 'done')
  await expect(dots.nth(2)).toHaveAttribute('data-state', 'current')
  await expect(dots.nth(3)).toHaveAttribute('data-state', 'future')
}

async function expectAtPlantVisit(page: Page) {
  const row = gridRow(page, ids.rohanMehta)
  await expect(stageDots(row)).toHaveAccessibleName('Stage 4 of 7: Plant visit')
  const dots = stageDots(row).locator('[data-state]')
  await expect(dots.nth(2)).toHaveAttribute('data-state', 'done')
  await expect(dots.nth(3)).toHaveAttribute('data-state', 'current')
  await expect(dots.nth(4)).toHaveAttribute('data-state', 'future')
}

test.describe('stage', () => {
  test('clicking a future stage moves the dots, stamps today, and Undo reverts it', {
    tag: '@smoke',
  }, async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const row = gridRow(page, ids.rohanMehta)
    await expectAtFirstCall(page)

    // Expand the row by clicking it.
    await row.getByRole('gridcell').first().click()
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'true')
    await expect(trackerStage(page, 'First call')).toHaveAttribute('aria-current', 'step')
    await expect(trackerStage(page, 'First call')).toContainText('21 Oct')

    await tracker(page).getByRole('button', { name: 'Move to Plant visit' }).click()

    await expectAtPlantVisit(page)
    await expect(trackerStage(page, 'Plant visit')).toHaveAttribute('aria-current', 'step')
    await expect(trackerStage(page, 'Plant visit')).toContainText('5 Nov')
    await expect(trackerStage(page, 'First call')).toHaveAttribute('data-state', 'done')
    await expect(
      tracker(page).getByRole('button', { name: 'Move back to First call' }),
    ).toBeVisible()
    // The change is in the history.
    await expect(
      expandedRow(page)
        .getByTestId('history-entry')
        .filter({ hasText: 'First call → Plant visit' }),
    ).toHaveCount(1)
    await expect(toast(page, 'Moved to Plant visit')).toBeVisible()

    await undoToast(page, 'Moved to Plant visit')

    await expectAtFirstCall(page)
    await expect(trackerStage(page, 'First call')).toHaveAttribute('aria-current', 'step')
    await expect(trackerStage(page, 'Plant visit')).toHaveAttribute('data-state', 'future')
    await expect(trackerStage(page, 'Plant visit')).not.toContainText('5 Nov')
    // Undo is recorded in the history too.
    await expect(
      expandedRow(page)
        .getByTestId('history-entry')
        .filter({ hasText: 'Stage restored to First call' }),
    ).toHaveCount(1)
  })

  test('a stage move persists across reload', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    await tracker(page).getByRole('button', { name: 'Move to Pilot scoped' }).click()
    await expect(stageDots(gridRow(page, ids.rohanMehta))).toHaveAccessibleName(
      'Stage 5 of 7: Pilot scoped',
    )
    await expect(toast(page, 'Moved to Pilot scoped')).toBeVisible()

    await reloadApp(page)

    const row = gridRow(page, ids.rohanMehta)
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'true')
    await expect(stageDots(row)).toHaveAccessibleName('Stage 5 of 7: Pilot scoped')
    await expect(trackerStage(page, 'Pilot scoped')).toHaveAttribute('aria-current', 'step')
    await expect(trackerStage(page, 'Pilot scoped')).toContainText('5 Nov')
    // The skipped Plant visit counts as done, with no date.
    await expect(trackerStage(page, 'Plant visit')).toHaveAttribute('data-state', 'done')
    await expect(trackerStage(page, 'Plant visit')).toContainText('no date')
    // Earlier dates are kept.
    await expect(trackerStage(page, 'First call')).toContainText('21 Oct')

    // Undo after a reload is gone with the toast, but moving back works and persists.
    await tracker(page).getByRole('button', { name: 'Move back to First call' }).click()
    await expectAtFirstCall(page)
    await reloadApp(page)
    await expectAtFirstCall(page)
    await expect(trackerStage(page, 'First call')).toContainText('21 Oct')
    await expect(trackerStage(page, 'Plant visit')).toHaveAttribute('data-state', 'future')
  })

  test('Mark lost shows the lost line and a red dot; Reopen clears it; both persist', async ({
    page,
  }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    const row = gridRow(page, ids.rohanMehta)

    await tracker(page).getByRole('button', { name: 'Mark lost' }).click()

    await expect(tracker(page).getByTestId('lost-line')).toHaveText('Lost after first call · 5 Nov')
    await expect(stageDots(row)).toHaveAccessibleName('Lost after First call')
    const lostDot = stageDots(row).locator('[data-state="lost-marker"]')
    await expect(lostDot).toHaveCount(1)
    // The red dot sits at the next stage position (Plant visit).
    await expect(stageDots(row).locator('[data-state]').nth(3)).toHaveAttribute(
      'data-state',
      'lost-marker',
    )
    const red = await lostDot.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(red).toBe('rgb(220, 38, 38)')
    await expect(toast(page, 'Marked lost')).toBeVisible()
    await expect(tracker(page).getByRole('button', { name: 'Mark lost' })).toHaveCount(0)

    await reloadApp(page)
    await expect(tracker(page).getByTestId('lost-line')).toHaveText('Lost after first call · 5 Nov')
    await expect(stageDots(gridRow(page, ids.rohanMehta))).toHaveAccessibleName(
      'Lost after First call',
    )

    await tracker(page).getByRole('button', { name: 'Reopen' }).click()

    await expect(tracker(page).getByTestId('lost-line')).toHaveCount(0)
    await expectAtFirstCall(page)
    await expect(stageDots(row).locator('[data-state="lost-marker"]')).toHaveCount(0)
    await expect(toast(page, 'Reopened')).toBeVisible()
    await expect(tracker(page).getByRole('button', { name: 'Mark lost' })).toBeVisible()

    await reloadApp(page)
    await expect(tracker(page).getByTestId('lost-line')).toHaveCount(0)
    await expectAtFirstCall(page)
  })

  test('Undo on Mark lost restores the open row', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    await tracker(page).getByRole('button', { name: 'Mark lost' }).click()
    await expect(tracker(page).getByTestId('lost-line')).toBeVisible()

    await undoToast(page, 'Marked lost')

    await expect(tracker(page).getByTestId('lost-line')).toHaveCount(0)
    await expectAtFirstCall(page)
    await reloadApp(page)
    await expectAtFirstCall(page)
  })

  test('] and [ on the active row move the stage forward and back', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)
    // The active cell starts on the first row: Rohan Mehta.
    await expect(gridRow(page, ids.rohanMehta)).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press(']')
    await expectAtPlantVisit(page)
    await expect(toast(page, 'Moved to Plant visit')).toBeVisible()
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)

    // The tracker shows the same result as a click would.
    await page.keyboard.press('Enter')
    await expect(trackerStage(page, 'Plant visit')).toHaveAttribute('aria-current', 'step')
    await expect(trackerStage(page, 'Plant visit')).toContainText('5 Nov')

    await reloadApp(page)
    await expectAtPlantVisit(page)

    await focusGrid(page)
    await page.keyboard.press('[')
    await expectAtFirstCall(page)
    await expect(toast(page, 'Moved to First call')).toBeVisible()
    await expect(trackerStage(page, 'First call')).toHaveAttribute('aria-current', 'step')
    await expect(trackerStage(page, 'First call')).toContainText('21 Oct')
    await expect(trackerStage(page, 'Plant visit')).not.toContainText('5 Nov')

    await reloadApp(page)
    await expectAtFirstCall(page)

    // Undo works for keyboard moves too.
    await focusGrid(page)
    await page.keyboard.press(']')
    await expectAtPlantVisit(page)
    await undoToast(page, 'Moved to Plant visit')
    await expectAtFirstCall(page)
  })

  test('] does nothing on a won row and [ does nothing on a lost row', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await focusGrid(page)

    // Vikram Joshi (row 7) is won at Paid.
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown')
    const won = gridRow(page, 'r-dawar-customers-07')
    await expect(won).toHaveAttribute('aria-selected', 'true')
    await expect(stageDots(won)).toHaveAccessibleName('Won: Paid')
    await page.keyboard.press(']')

    // Priya Nair (row 8) is lost after First call.
    await page.keyboard.press('ArrowDown')
    const lost = gridRow(page, ids.priyaNair)
    await expect(lost).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('[')
    await page.keyboard.press(']')

    // A move on an open row afterwards shows the only toast: the presses above did nothing.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const open = gridRow(page, 'r-dawar-customers-10')
    await expect(open).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press(']')
    await expect(stageDots(open)).toHaveAccessibleName('Stage 5 of 7: Pilot scoped')
    await expect(toast(page, 'Moved to Pilot scoped')).toBeVisible()
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)

    await expect(stageDots(won)).toHaveAccessibleName('Won: Paid')
    await expect(stageDots(lost)).toHaveAccessibleName('Lost after First call')
  })
})
