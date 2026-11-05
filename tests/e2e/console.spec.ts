import type { Page } from '@playwright/test'
import { expect, gotoApp, setTheme, test } from '../support/fixtures'
import {
  expandedRow,
  grid,
  ids,
  memberTab,
  openSheet,
  sheetNames,
  sheetTab,
  toast,
  undoToast,
  warmthChip,
} from './helpers'

// The console guard in tests/support/fixtures.ts already fails any test that logs a console error
// or warning or throws. These tests visit every main screen, in both themes, and also assert the
// list is empty once the screen has settled, so a failure names the screen it came from.

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`console (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme)
    })

    test('the root redirect and every sheet of both members', async ({ page, consoleIssues }) => {
      await gotoApp(page, '/', { waitForReady: true })
      await expect(page).toHaveURL(/\/m\/dawar\/customers$/)
      for (const [member, sheets] of [
        ['Dawar', sheetNames.dawar],
        ['Dhruv', sheetNames.dhruv],
      ] as const) {
        await memberTab(page, member).click()
        for (const name of sheets) {
          await sheetTab(page, name).click()
          await expect(grid(page)).toHaveAttribute('aria-label', name)
          await expect(grid(page).locator('[role="row"][data-row-id]').first()).toBeVisible()
        }
      }
      await settle(page)
      expect(consoleIssues).toEqual([])
    })

    test('expanded rows, link chips, stage and warmth changes, and the full history', async ({
      page,
      consoleIssues,
    }) => {
      await openSheet(page, 'dhruv', 'investors', ids.kiranSethi)
      await expect(expandedRow(page)).toBeVisible()
      await expandedRow(page).getByTestId('link-chip').first().click()
      await expect(page).toHaveURL(new RegExp(`row=${ids.divyaKapoor}`))
      await expect(expandedRow(page)).toBeVisible()

      await openSheet(page, 'dawar', 'customers', ids.rohanMehta)
      await expandedRow(page).getByRole('button', { name: 'Move to Plant visit' }).click()
      await undoToast(page, 'Moved to Plant visit')
      await expandedRow(page).getByRole('button', { name: 'Move to Plant visit' }).click()
      await expandedRow(page).getByRole('button', { name: 'Mark lost' }).click()
      await expandedRow(page).getByRole('button', { name: 'Reopen' }).click()
      await warmthChip(expandedRow(page)).click()
      await page.getByRole('menu').getByRole('menuitemradio', { name: /Cold/ }).click()
      await expect(toast(page, 'Warmth set to Cold')).toBeVisible()
      await expandedRow(page)
        .getByRole('button', { name: /^Show all/ })
        .click()
      await expect(page.getByTestId('history-panel')).toBeVisible()
      await page.getByRole('button', { name: 'Back to this week' }).click()
      await expect(page.getByTestId('calendar-panel')).toBeVisible()
      await settle(page)
      expect(consoleIssues).toEqual([])
    })

    test('the palette, shortcut sheet, overflow menu and side panel', async ({
      page,
      consoleIssues,
    }) => {
      await openSheet(page, 'dawar', 'customers')
      await page.keyboard.press('ControlOrMeta+k')
      await page.getByTestId('command-palette').getByRole('combobox').fill('menon')
      await expect(page.getByTestId('palette-result')).toHaveCount(2)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('command-palette')).toBeHidden()
      await expect(expandedRow(page)).toBeVisible()

      await grid(page).focus()
      await page.keyboard.press('?')
      await expect(page.getByTestId('shortcut-sheet')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('shortcut-sheet')).toBeHidden()

      await page.getByRole('button', { name: 'More' }).click()
      await expect(page.getByRole('menu')).toBeVisible()
      await page.getByRole('menuitem', { name: /^Keyboard shortcuts/ }).click()
      await expect(page.getByTestId('shortcut-sheet')).toBeVisible()
      await page.keyboard.press('Escape')

      await page.keyboard.press('ControlOrMeta+.')
      await expect(page.getByTestId('right-panel')).toHaveCount(0)
      await page.keyboard.press('ControlOrMeta+.')
      await expect(page.getByTestId('right-panel')).toBeVisible()
      await settle(page)
      expect(consoleIssues).toEqual([])
    })

    test('the not-found page and /design', async ({ page, consoleIssues }) => {
      await gotoApp(page, '/no/such/page')
      await expect(page.getByTestId('not-found')).toBeVisible()

      // Directly, on a fresh database, then again once it is seeded (the faster path).
      await gotoApp(page, '/design')
      await expect(page.getByRole('heading').first()).toBeVisible()
      await page.reload()
      await expect(page.getByRole('heading').first()).toBeVisible()
      await settle(page)
      expect(consoleIssues).toEqual([])
    })
  })
}
