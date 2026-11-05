/**
 * Shared locators and steps for the end-to-end specs. Seed ids come from src/data/local/seed.ts
 * (`seedIds`); they are repeated here as plain strings so the specs read without the app's types.
 */
import type { Locator, Page } from '@playwright/test'
import { expect, gotoApp } from '../support/fixtures'

export const ids = {
  rohanMehta: 'r-dawar-customers-01',
  sunitaKulkarni: 'r-dawar-customers-02',
  karthikSubramanian: 'r-dawar-customers-03',
  hiteshPatel: 'r-dawar-customers-04',
  priyaNair: 'r-dawar-customers-08',
  gauravBansal: 'r-dawar-customers-12',
  divyaKapoor: 'r-dawar-connectors-06',
  arvindMenonDawar: 'r-dawar-connectors-02',
  arvindMenonDhruv: 'r-dhruv-investors-01',
  kiranSethi: 'r-dhruv-investors-02',
} as const

/** Sheet names per member, in tab order. */
export const sheetNames = {
  dawar: ['Customers', 'Investors', 'Advisors and experts', 'Connectors', 'Service providers'],
  dhruv: ['Customers', 'Investors', 'Connectors'],
} as const

/** Opens a member's sheet (optionally with a row expanded) and waits for the rows to load. */
export async function openSheet(
  page: Page,
  memberSlug: string,
  sheetSlug: string,
  rowId?: string,
): Promise<void> {
  const query = rowId ? `?row=${encodeURIComponent(rowId)}` : ''
  await gotoApp(page, `/m/${memberSlug}/${sheetSlug}${query}`, { waitForReady: true })
  await expect(grid(page)).toBeVisible()
}

/** Matches a URL ending in /m/<member>/<sheet>?row=<rowId>. */
export function rowUrl(memberSlug: string, sheetSlug: string, rowId: string): RegExp {
  return new RegExp(`/m/${memberSlug}/${sheetSlug}\\?row=${rowId}$`)
}

export function grid(page: Page): Locator {
  return page.getByTestId('sheet-grid')
}

/** The grid row for a row id (the row itself, not its expanded details). */
/** The row's first cell, which carries aria-expanded (a plain grid's rows cannot). */
export function nameCell(row: Locator): Locator {
  return row.locator('[role="gridcell"]').first()
}

export function gridRow(page: Page, rowId: string): Locator {
  return page.locator(`[role="row"][data-row-id="${rowId}"]`)
}

export function expandedRow(page: Page): Locator {
  return page.getByTestId('expanded-row')
}

/** The compact stage dots in a grid row (role img named "Stage 4 of 7: Plant visit"). */
export function stageDots(row: Locator): Locator {
  return row.getByRole('img', { name: /^(Stage \d+ of \d+|Won|Lost after|Not started)/ })
}

/** The warmth chip in a grid row or the expanded row ("Warmth: Cold", "Warmth: none, …"). */
export function warmthChip(scope: Locator): Locator {
  return scope.getByRole('button', { name: /^Warmth: / })
}

export function memberTab(page: Page, name: string): Locator {
  return page.getByRole('tablist', { name: 'Team members' }).getByRole('tab', { name })
}

export function sheetTab(page: Page, name: string): Locator {
  return page.getByRole('tablist', { name: 'Sheets' }).getByRole('tab', { name, exact: true })
}

/** A sonner toast containing `text`. */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-sonner-toast]').filter({ hasText: text })
}

/** Clicks Undo on the toast that contains `text`. */
export async function undoToast(page: Page, text: string | RegExp): Promise<void> {
  const item = toast(page, text)
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Undo' }).click()
}

/** Puts keyboard focus on the grid (its single tab stop) without clicking a row. */
export async function focusGrid(page: Page): Promise<void> {
  await grid(page).focus()
  await expect(grid(page)).toBeFocused()
}

/** Reloads and waits for the rows to load again. */
export async function reloadApp(page: Page): Promise<void> {
  await page.reload()
  await expect(page.locator('html[data-app-ready="true"]')).toBeAttached()
  await expect(grid(page)).toBeVisible()
}
