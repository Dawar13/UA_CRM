/**
 * Exports read back (Phase 1 M1.8): the .xlsx with ExcelJS (values and fills), the PDF with
 * pdfjs (text and page count).
 */
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { newRow } from '@/domain/rows'
import { buildSheetSchema } from '@/domain/templates'
import type { Sheet, Tag } from '@/domain/types'
import { visibleColumns } from '@/features/grid/columnModel'
import {
  buildPdf,
  buildXlsx,
  type ExportView,
  worksheetName,
} from '@/features/import-export/workbook'

const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const newId = () => `id-${++n}`
const { columns, stages } = buildSheetSchema('customers', newId)
const sheet: Sheet = {
  id: 's1',
  memberId: 'm1',
  slug: 'customers',
  name: 'Customers',
  template: 'customers',
  position: 0,
  columns,
  stages,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  deletedAt: null,
}
const foundry: Tag = { id: 't1', name: 'foundry', colour: 'amber', createdBy: null, createdAt: '' }

function view(count: number): ExportView {
  const rows = Array.from(
    { length: count },
    (_, i) =>
      newRow(
        sheet,
        {
          name: i === 0 ? 'Rohan Mehta' : `Person ${i}`,
          company: 'Hosur Precision Forge',
          phone: '+91 98450 12345',
          warmth: i === 0 ? 'warm' : null,
          stageIndex: 2,
          tagIds: ['t1'],
          fields: { ticketEstimate: 2_500_000 },
        },
        { id: `r${i}`, position: i },
        { now: NOW, actorId: 'm1', newId },
      ).row,
  )
  return {
    title: 'Dawar · Customers',
    columns: visibleColumns(sheet),
    rows,
    ctx: {
      now: NOW,
      tagMap: new Map([['t1', foundry]]),
      rowName: () => undefined,
      stageNames: sheet.stages.map((s) => s.name),
    },
  }
}

describe('Excel export', () => {
  it('writes the visible columns with values as on screen, warmth fills and tag colours', async () => {
    const bytes = await buildXlsx([view(3)])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    const ws = workbook.getWorksheet('Dawar · Customers')
    if (!ws) throw new Error('no worksheet')
    const header = (ws.getRow(1).values as unknown[]).slice(1)
    expect(header.slice(0, 3)).toEqual(['Name', 'Warmth', 'Stage'])
    const col = (label: string) => header.indexOf(label) + 1
    const rohan = ws.getRow(2)
    expect(rohan.getCell(col('Name')).value).toBe('Rohan Mehta')
    expect(rohan.getCell(col('Stage')).value).toBe('First call')
    expect(rohan.getCell(col('Phone')).value).toBe('+91 98450 12345')
    expect(rohan.getCell(col('Ticket estimate (₹ L/yr)')).value).toBe('₹25 L')
    const warmth = rohan.getCell(col('Warmth'))
    expect(warmth.value).toBe('Warm')
    expect((warmth.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFE3EFD3')
    const tags = rohan.getCell(col('Tags')).value as ExcelJS.CellRichTextValue
    expect(tags.richText.map((r) => r.text).join('')).toBe('■ foundry')
    expect(ws.rowCount).toBe(4)
  })

  it('Export everything: one tab per sheet, with names Excel accepts', async () => {
    const bytes = await buildXlsx([
      { ...view(1), title: 'Dawar · Customers' },
      { ...view(1), title: 'Dhruv · Customers' },
    ])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes)
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      'Dawar · Customers',
      'Dhruv · Customers',
    ])
    const taken = new Set<string>()
    expect(worksheetName('A very long sheet name that goes on: and on', taken)).toBe(
      'A very long sheet name that goe',
    )
    expect(worksheetName('A very long sheet name that goes on: and on', taken)).toBe(
      'A very long sheet name that 2',
    )
  })
})

describe('PDF export', () => {
  it('is A4 landscape with the rows as text, over as many pages as it needs', async () => {
    const bytes = await buildPdf(view(60))
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
    expect(doc.numPages).toBeGreaterThan(1)
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    expect(Math.round(viewport.width)).toBe(842)
    expect(Math.round(viewport.height)).toBe(595)
    const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
    expect(text).toContain('Rohan Mehta')
    expect(text).toContain('Rs 25 L')
  })
})
