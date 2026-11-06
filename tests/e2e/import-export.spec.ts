import ExcelJS from 'exceljs'
import { expect, test } from '../support/fixtures'
import { expandedRow, grid, openSheet, toast } from './helpers'

// Import and export (Phase 1 M1.8). Files are invented here; real files never enter the repo.

test.describe('import and export', () => {
  test("a sheet exports to Excel from another member's tab, as the current view", async ({
    page,
  }) => {
    await openSheet(page, 'dhruv', 'investors')
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'Excel (.xlsx)' }).click()
    const file = await downloading
    expect(file.suggestedFilename()).toMatch(/^UA CRM · Dhruv · Investors · 5 Nov 2026\.xlsx$/)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(await file.path())
    const sheet = workbook.worksheets[0]
    expect(sheet?.name).toBe('Dhruv · Investors')
    expect(sheet?.getRow(1).getCell(1).value).toBe('Name')
    expect(sheet?.rowCount).toBe(6)
  })

  test('a sheet exports to PDF', async ({ page }) => {
    await openSheet(page, 'dawar', 'customers')
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'PDF (A4 landscape)' }).click()
    const file = await downloading
    expect(file.suggestedFilename()).toMatch(/\.pdf$/)
  })

  test('a CSV imports into your sheet through the column mapping', async ({ page }) => {
    await openSheet(page, 'dawar', 'connectors')
    await page.getByRole('button', { name: 'Sheet options' }).click()
    await page.getByRole('menuitem', { name: 'Import from a file' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import into Connectors' })
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'people.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Full name,Organisation,Mobile,Relationship\nNisha Verma,Verma Steels,98450 77777,Alumni\nOm Prakash,,,\n',
      ),
    })
    const mapping = dialog.getByTestId('import-mapping')
    await expect(mapping.getByLabel('Where Full name goes')).toHaveValue(/.+/)
    await dialog.getByRole('button', { name: 'Import 2 rows' }).click()
    await expect(toast(page, 'Imported 2 rows into Connectors')).toBeVisible()
    const nisha = grid(page).locator('[role="row"][data-row-id]').filter({ hasText: 'Nisha Verma' })
    await expect(nisha).toContainText('Verma Steels')
  })

  test("the founders' old spreadsheet imports your block and the Common rows you pick", async ({
    page,
  }) => {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Contacts')
    const header = ['Name', 'Company', 'Type', 'Spl mentions', 'Date']
    ws.addRows([
      ['Dawar'],
      header,
      ['Tara Kapoor', 'Kapoor Ventures', 'VC', 'Knows two foundry owners', 'Mid oct'],
      ['Dhruv'],
      header,
      ['Not Mine', 'X', 'Angel', '', ''],
      ['Common'],
      header,
      ['Neel Bose', '', 'Friend', '', 'early nov'],
    ])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    await openSheet(page, 'dawar', 'investors')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Import the old spreadsheet' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import the old spreadsheet' })
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'old.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    })
    const rows = dialog.getByTestId('founders-row')
    // Dawar's block and Common; Dhruv's block is not offered.
    await expect(rows).toHaveCount(2)
    await expect(dialog.getByLabel('Import Tara Kapoor')).toBeChecked()
    await expect(dialog.getByLabel('Import Neel Bose')).not.toBeChecked()
    await expect(dialog.getByLabel('Sheet for Tara Kapoor')).toHaveValue('investors')
    await dialog.getByLabel('Import Neel Bose').check()
    await dialog.getByRole('button', { name: 'Import 2 people' }).click()
    await expect(toast(page, 'Imported 2 people')).toBeVisible()

    const tara = grid(page).locator('[role="row"][data-row-id]').filter({ hasText: 'Tara Kapoor' })
    await tara.locator('[role="gridcell"]').first().click()
    await expect(
      expandedRow(page)
        .getByTestId('history-entry')
        .filter({ hasText: 'Imported from the old spreadsheet' }),
    ).toContainText('Mid Oct')
  })
})
