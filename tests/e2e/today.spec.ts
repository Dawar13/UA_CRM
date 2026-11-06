import { expect, gotoApp, test } from '../support/fixtures'
import { memberTab, openSheet } from './helpers'

// Today (Phase 1 M1.7), signed in as Dawar on Thu 5 Nov 2026.

test.describe('today', () => {
  test('Today lists overdue and due next actions, and opens a row in place', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await memberTab(page, 'Today').click()
    await expect(page).toHaveURL(/\/today$/)
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()

    const overdue = page.getByTestId('today-overdue')
    const due = page.getByTestId('today-due')
    await expect(overdue.getByTestId('today-item').filter({ hasText: 'Meera Desai' })).toBeVisible()
    await expect(due.getByTestId('today-item').filter({ hasText: 'Sunita Kulkarni' })).toBeVisible()
    // Dhruv's rows never show in Dawar's day.
    await expect(page.getByTestId('today-item').filter({ hasText: 'Kiran Sethi' })).toHaveCount(0)

    const sunita = due.getByTestId('today-item').filter({ hasText: 'Sunita Kulkarni' })
    await sunita.getByRole('button', { name: /Sunita Kulkarni/ }).click()
    await expect(sunita.getByTestId('expanded-row')).toBeVisible()

    await overdue.getByRole('button', { name: /^Overdue \d/ }).click()
    await expect(overdue.getByTestId('today-item')).toHaveCount(0)
  })

  test('Today opens straight from its address', async ({ page }) => {
    await gotoApp(page, '/today', { waitForReady: true })
    await expect(memberTab(page, 'Today')).toHaveAttribute('aria-selected', 'true')
  })
})
