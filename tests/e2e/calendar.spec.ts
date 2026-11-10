import type { Page } from '@playwright/test'
import { expect, gotoApp, test } from '../support/fixtures'
import {
  expandedRow,
  gridRow,
  ids,
  memberTab,
  nameCell,
  openSheet,
  reloadApp,
  rowUrl,
  toast,
  undoToast,
} from './helpers'

// Sample mode (Phase 2): the sample calendars start connected, with no Google behind them.
// Today is Thu 5 Nov 2026; its week runs Mon 2 to Sun 8 Nov.

function panel(page: Page) {
  return page.getByTestId('right-panel')
}

function day(page: Page, label: string) {
  return page.getByTestId('calendar-page').getByRole('list', { name: label, exact: true })
}

test.describe('the calendar page', () => {
  test('opens from the member switch with the week, and the arrows move it', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await memberTab(page, 'Calendar').click()
    await expect(page).toHaveURL(/\/calendar$/)
    await expect(page.getByRole('heading', { name: 'Dawar’s calendar', level: 1 })).toBeVisible()
    await expect(page.getByText('2–8 Nov', { exact: true })).toBeVisible()
    await expect(page.getByTestId('member-tabs-divider')).toHaveCount(1)

    const thursday = day(page, 'Thu 5 Nov')
    await expect(thursday.getByTestId('week-event')).toHaveCount(2)
    const call = thursday.getByTestId('week-event').filter({ hasText: 'Call with Rohan Mehta' })
    await expect(call.getByTestId('week-event-contact')).toHaveText('Rohan Mehta')
    await expect(day(page, 'Fri 6 Nov')).toContainText('Plant walk: Deccan Castings')
    await expect(page.getByTestId('week-now')).toHaveCount(1)

    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/calendar\?week=2026-11-09$/)
    await expect(day(page, 'Mon 9 Nov')).toContainText('Pitch practice')
    await expect(page.getByTestId('week-now')).toHaveCount(0)
    await page.getByRole('button', { name: 'This week' }).click()
    await expect(page).toHaveURL(/\/calendar$/)

    // A contact on an event jumps to their row.
    await call.getByTestId('week-event-contact').click()
    await expect(page).toHaveURL(rowUrl('dawar', 'customers', ids.rohanMehta))
    await expect(nameCell(gridRow(page, ids.rohanMehta))).toHaveAttribute('aria-expanded', 'true')
  })

  test('opens from the side panel', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await panel(page).getByRole('button', { name: 'Open the calendar' }).click()
    await expect(page).toHaveURL(/\/calendar$/)
    await expect(day(page, 'Thu 5 Nov')).toContainText('Founders sync')
  })

  test('shows another member’s week, view only (D-054)', async ({ page }) => {
    await openSheet(page, 'dhruv', 'investors')
    await panel(page).getByRole('button', { name: 'Open the calendar' }).click()
    await expect(page).toHaveURL(/\/calendar\?member=dhruv$/)
    await expect(page.getByRole('heading', { name: 'Dhruv’s calendar', level: 1 })).toBeVisible()
    await expect(page.getByTestId('calendar-owner-dhruv')).toHaveAttribute('aria-selected', 'true')
    await expect(day(page, 'Thu 5 Nov')).toContainText('Coffee with Arvind Menon')
    await expect(day(page, 'Thu 5 Nov')).not.toContainText('Call with Rohan Mehta')
    await expect(page.getByTestId('calendar-sync-status')).toContainText(
      'Dhruv’s calendar, view only',
    )
    await expect(page.getByRole('button', { name: 'Sync now' })).toHaveCount(0)

    // The week moves and stays on Dhruv's calendar; the switch goes back to yours.
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/calendar\?member=dhruv&week=2026-11-09$/)
    await page.getByTestId('calendar-owner-dawar').click()
    await expect(page).toHaveURL(/\/calendar\?week=2026-11-09$/)
    await expect(page.getByRole('heading', { name: 'Dawar’s calendar', level: 1 })).toBeVisible()
    await expect(day(page, 'Mon 9 Nov')).toContainText('Pitch practice')
  })
})

test.describe('next actions in the calendar', () => {
  test('Add to calendar puts it in, edits move it, and Remove can be undone', async ({ page }) => {
    // Rohan Mehta's next action: "Send ROI note", Fri 6 Nov.
    await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
    const row = expandedRow(page)
    await row.getByRole('button', { name: 'Add to calendar' }).click()
    const form = page.getByTestId('next-action-event-form')
    await expect(form.getByLabel('Day', { exact: true })).toHaveValue('2026-11-06')
    await form.getByLabel('All day').uncheck()
    await form.getByLabel('Time (IST)').fill('16:00')
    // Inviting is off unless asked.
    await expect(form.getByLabel(/^Invite Rohan Mehta/)).not.toBeChecked()
    await form.getByRole('button', { name: 'Add to calendar' }).click()

    await expect(toast(page, 'Added to your calendar')).toBeVisible()
    await expect(row.getByTestId('next-action-event')).toContainText('In your calendar · 4:00 pm')
    const tomorrow = panel(page).getByRole('region', { name: 'Tomorrow · Fri 6 Nov' })
    await expect(tomorrow).toContainText('Send ROI note · Rohan Mehta')
    await expect(tomorrow).toContainText('4:00 pm')

    // A new day for the next action moves the event, at the same time.
    await row.getByTestId('edit-next-action').click()
    await row.getByRole('textbox', { name: 'Next action' }).fill('mon Send ROI note')
    await page.keyboard.press('Enter')
    const monday = panel(page).getByRole('region', { name: 'Mon 9 Nov' })
    await expect(monday).toContainText('Send ROI note · Rohan Mehta')
    await expect(tomorrow).not.toContainText('Send ROI note')

    await reloadApp(page)
    await expect(expandedRow(page).getByTestId('next-action-event')).toContainText(
      'In your calendar · 4:00 pm',
    )

    await expandedRow(page).getByRole('button', { name: 'Remove' }).click()
    await expect(expandedRow(page).getByRole('button', { name: 'Add to calendar' })).toBeVisible()
    await expect(panel(page)).not.toContainText('Send ROI note · Rohan Mehta')
    await undoToast(page, 'Removed from your calendar')
    await expect(expandedRow(page).getByTestId('next-action-event')).toContainText(
      'In your calendar · 4:00 pm',
    )
    await expect(panel(page).getByRole('region', { name: 'Mon 9 Nov' })).toContainText(
      'Send ROI note · Rohan Mehta',
    )
  })

  test('another member’s row offers no calendar controls', async ({ page }) => {
    await openSheet(page, 'dhruv', 'investors', ids.arvindMenonDhruv)
    await expect(expandedRow(page)).toBeVisible()
    await expect(expandedRow(page).getByRole('button', { name: 'Add to calendar' })).toHaveCount(0)
    await expect(expandedRow(page).getByTestId('next-action-event')).toHaveCount(0)
  })
})

test.describe('connecting', () => {
  test('disconnect from the More menu, then connect again', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await expect(panel(page).getByTestId('calendar-event')).toHaveCount(5)

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Disconnect calendar' }).click()
    const dialog = page.getByRole('dialog', { name: 'Disconnect Google Calendar?' })
    await dialog.getByRole('button', { name: 'Disconnect' }).click()
    await expect(toast(page, 'Google Calendar disconnected')).toBeVisible()
    await expect(panel(page).getByTestId('calendar-event')).toHaveCount(0)

    // Sample mode has no Google: connecting comes straight back, the way Google's redirect does.
    await panel(page).getByRole('button', { name: 'Connect Google Calendar' }).click()
    await expect(toast(page, 'Google Calendar connected')).toBeVisible()
    await expect(page).toHaveURL(/\/m\/dawar\/customers$/)
    await expect(panel(page).getByTestId('calendar-event')).toHaveCount(5)
  })

  test('says why connecting failed', async ({ page }) => {
    await gotoApp(page, '/m/dawar/customers?calendar=error&reason=denied', { waitForReady: true })
    await expect(
      toast(page, 'Google Calendar was not connected: access was declined.'),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/m\/dawar\/customers$/)
  })
})

test('Today lists today’s meetings', async ({ page }) => {
  await gotoApp(page, '/today', { waitForReady: true })
  const meetings = page.getByTestId('today-meetings')
  await expect(meetings.getByTestId('today-meeting')).toHaveCount(2)
  await expect(meetings).toContainText('Call with Rohan Mehta')
  await expect(meetings.getByRole('button', { name: 'Rohan Mehta' })).toBeVisible()
  await expect(meetings).toContainText('Founders sync')
})
