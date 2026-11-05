import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { expandedRow, grid, gridRow, ids, memberTab, nameCell, openSheet, rowUrl } from './helpers'

function palette(page: Page) {
  return page.getByTestId('command-palette')
}

function results(page: Page) {
  return palette(page).getByTestId('palette-result')
}

function searchInput(page: Page) {
  return palette(page).getByRole('combobox')
}

test.describe('search', () => {
  test('Ctrl/Cmd+K and "menon" finds both Arvind Menon rows, and Enter jumps across tabs', {
    tag: '@smoke',
  }, async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')

    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette(page)).toBeVisible()
    await expect(searchInput(page)).toBeFocused()

    await searchInput(page).fill('menon')
    await expect(results(page)).toHaveCount(2)

    const dawarResult = results(page).filter({ hasText: 'Dawar · Connectors' })
    const dhruvResult = results(page).filter({ hasText: 'Dhruv · Investors' })
    await expect(dawarResult).toContainText('Cdr Arvind Menon')
    await expect(dhruvResult).toContainText('Arvind Menon')
    await expect(dhruvResult).not.toContainText('Cdr')
    // Groups are labelled "Member · Sheet" and the match is highlighted.
    await expect(
      palette(page).getByText('Dawar · Connectors', { exact: true }).first(),
    ).toBeVisible()
    await expect(dawarResult.locator('mark').first()).toHaveText(/menon/i)

    // Move the selection to Dhruv's Arvind Menon and press Enter.
    for (let i = 0; i < 2 && (await dhruvResult.getAttribute('data-selected')) !== 'true'; i++) {
      await page.keyboard.press('ArrowDown')
    }
    await expect(dhruvResult).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Enter')

    await expect(palette(page)).toBeHidden()
    await expect(page).toHaveURL(rowUrl('dhruv', 'investors', ids.arvindMenonDhruv))
    await expect(memberTab(page, 'Dhruv')).toHaveAttribute('aria-selected', 'true')
    await expect(grid(page)).toHaveAttribute('aria-label', 'Investors')
    const row = gridRow(page, ids.arvindMenonDhruv)
    await expect(nameCell(row)).toHaveAttribute('aria-expanded', 'true')
    await expect(expandedRow(page)).toBeVisible()
    await expect(row).toBeInViewport()
    // Focus lands on the grid, with the jumped-to row active, so the keyboard carries on there.
    await expect(grid(page)).toBeFocused()
    await expect(row).toHaveAttribute('aria-selected', 'true')
  })

  test('Enter on the other match opens Dawar’s Connectors with the row expanded', async ({
    page,
  }) => {
    await openSheet(page, 'dhruv', 'customers')
    await page.getByTestId('search-trigger').click()
    await expect(palette(page)).toBeVisible()
    await searchInput(page).fill('menon')
    const dawarResult = results(page).filter({ hasText: 'Cdr Arvind Menon' })
    await expect(dawarResult).toBeVisible()

    await dawarResult.click()

    await expect(palette(page)).toBeHidden()
    await expect(page).toHaveURL(rowUrl('dawar', 'connectors', ids.arvindMenonDawar))
    await expect(memberTab(page, 'Dawar')).toHaveAttribute('aria-selected', 'true')
    await expect(nameCell(gridRow(page, ids.arvindMenonDawar))).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  test('Enter straight after typing opens the top match', async ({ page }) => {
    await openSheet(page, 'dawar', 'investors')
    await page.keyboard.press('ControlOrMeta+k')
    await page.keyboard.type('rohan')
    await expect(results(page).first()).toContainText('Rohan Mehta')
    await expect(results(page).first()).toHaveAttribute('data-selected', 'true')

    await page.keyboard.press('Enter')

    await expect(palette(page)).toBeHidden()
    await expect(page).toHaveURL(rowUrl('dawar', 'customers', ids.rohanMehta))
    await expect(nameCell(gridRow(page, ids.rohanMehta))).toHaveAttribute('aria-expanded', 'true')
    await expect(grid(page)).toBeFocused()
  })

  test('Esc closes the palette and returns focus', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await grid(page).focus()

    await page.keyboard.press('ControlOrMeta+k')
    await expect(palette(page)).toBeVisible()
    await searchInput(page).fill('rohan')
    await expect(results(page)).not.toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(palette(page)).toBeHidden()
    await expect(grid(page)).toBeFocused()
    await expect(page).toHaveURL(/\/m\/dawar\/customers$/)

    // It opens empty next time.
    await page.keyboard.press('ControlOrMeta+k')
    await expect(searchInput(page)).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(palette(page)).toBeHidden()
  })

  test('search matches company, tags and phone, and lists commands', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    await page.keyboard.press('ControlOrMeta+k')

    await searchInput(page).fill('hosur precision')
    await expect(results(page).filter({ hasText: 'Rohan Mehta' })).toBeVisible()

    await searchInput(page).fill('98450 12345')
    await expect(results(page).filter({ hasText: 'Rohan Mehta' })).toBeVisible()

    await searchInput(page).fill('foundry')
    await expect(results(page).filter({ hasText: 'Rohan Mehta' })).toBeVisible()

    await searchInput(page).fill('zzzz no match')
    await expect(results(page)).toHaveCount(0)
    await expect(palette(page)).toContainText('No matches for “zzzz no match”')

    // Commands: switch member and sheet from the palette.
    await searchInput(page).fill('dhruv investors')
    await palette(page).getByRole('option', { name: 'Go to Dhruv · Investors' }).click()
    await expect(page).toHaveURL(/\/m\/dhruv\/investors$/)
    await expect(palette(page)).toBeHidden()
  })
})
