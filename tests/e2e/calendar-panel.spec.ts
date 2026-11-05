import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
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
} from './helpers'

function panel(page: Page) {
  return page.getByTestId('right-panel')
}

function events(page: Page) {
  return panel(page).getByTestId('calendar-event')
}

// The panel shows today (Thu 5 Nov 2026) and the six days after it, for the open member's tab.

test.describe('calendar panel', () => {
  test('Dawar’s tab shows Dawar’s week', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await expect(panel(page).getByRole('heading', { name: 'This week' })).toBeVisible()

    await expect(events(page)).toHaveCount(5)
    const today = panel(page).getByRole('region', { name: 'Today' })
    await expect(today.getByTestId('calendar-event')).toHaveCount(2)
    const call = today.getByTestId('calendar-event').filter({ hasText: 'Call with Rohan Mehta' })
    await expect(call).toContainText('11:30 am')
    await expect(call.getByTestId('event-contact')).toHaveAccessibleName('Rohan Mehta')
    await expect(call.getByTestId('event-contact')).toHaveAccessibleDescription('Dawar · Customers')
    await expect(panel(page).getByRole('region', { name: 'Tomorrow' })).toContainText(
      'Plant walk: Deccan Castings',
    )
    await expect(panel(page).getByRole('region', { name: 'Mon 9 Nov' })).toContainText(
      'Pitch practice',
    )
    // Nothing from Dhruv's calendar, and nothing past the seven days (Thu 12 Nov).
    await expect(panel(page)).not.toContainText('Coffee with Arvind Menon')
    await expect(panel(page)).not.toContainText('GST registration checklist')
  })

  test('Dhruv’s tab shows Dhruv’s week', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await memberTab(page, 'Dhruv').click()
    await expect(page).toHaveURL(/\/m\/dhruv\//)

    await expect(events(page)).toHaveCount(4)
    const coffee = events(page).filter({ hasText: 'Coffee with Arvind Menon' })
    await expect(coffee).toContainText('12:00 pm')
    await expect(panel(page).getByRole('region', { name: 'Today' })).toContainText(
      'Coffee with Arvind Menon',
    )
    await expect(panel(page)).not.toContainText('Call with Rohan Mehta')
    await expect(panel(page)).not.toContainText('Pitch practice')
  })

  test('a matched event’s chip jumps to the contact', async ({ page }) => {
    // Start on another sheet so the jump has to change sheet as well.
    await openSheet(page, 'dawar', 'investors')
    const chip = events(page)
      .filter({ hasText: 'Call with Rohan Mehta' })
      .getByRole('button', { name: 'Rohan Mehta' })
    await chip.click()

    await expect(page).toHaveURL(rowUrl('dawar', 'customers', ids.rohanMehta))
    await expect(grid(page)).toHaveAttribute('aria-label', 'Customers')
    await expect(nameCell(gridRow(page, ids.rohanMehta))).toHaveAttribute('aria-expanded', 'true')
    await expect(expandedRow(page)).toBeVisible()

    // Dhruv's matched event jumps within his tab.
    await memberTab(page, 'Dhruv').click()
    await events(page)
      .filter({ hasText: 'Coffee with Arvind Menon' })
      .getByTestId('event-contact')
      .click()
    await expect(page).toHaveURL(rowUrl('dhruv', 'investors', ids.arvindMenonDhruv))
    await expect(nameCell(gridRow(page, ids.arvindMenonDhruv))).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  test('the panel toggle is remembered across reloads', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await expect(panel(page)).toBeVisible()

    await page.getByRole('button', { name: 'Hide side panel' }).click()
    await expect(panel(page)).toHaveCount(0)
    await reloadApp(page)
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Show side panel' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await page.keyboard.press('ControlOrMeta+.')
    await expect(panel(page)).toBeVisible()
    await reloadApp(page)
    await expect(panel(page)).toBeVisible()
  })

  test('Show all opens a row’s full history in the panel', async ({ page }) => {
    // Rohan Mehta starts with 4 history entries; two stage moves make 6, one more than the
    // expanded row shows.
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    const entries = expandedRow(page).getByTestId('history-entry')
    await expect(entries).toHaveCount(4)
    await expect(expandedRow(page).getByRole('button', { name: /^Show all/ })).toHaveCount(0)
    await expandedRow(page).getByRole('button', { name: 'Move to Plant visit' }).click()
    await expect(entries).toHaveCount(5)
    await expandedRow(page).getByRole('button', { name: 'Move back to First call' }).click()
    await expect(entries).toHaveCount(5)

    const showAll = expandedRow(page).getByRole('button', { name: 'Show all 6' })
    await expect(showAll).toBeVisible()
    await showAll.click()

    await expect(panel(page).getByRole('heading', { name: 'History · Rohan Mehta' })).toBeVisible()
    const history = panel(page).getByTestId('history-panel').getByTestId('history-entry')
    await expect(history).toHaveCount(6)
    // Newest first.
    await expect(history.first()).toContainText('Stage: Plant visit → First call')

    await panel(page).getByRole('button', { name: 'Back to this week' }).click()
    await expect(panel(page).getByRole('heading', { name: 'This week' })).toBeVisible()
  })
})
