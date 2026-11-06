/**
 * Spreadsheets in and out, in the browser (ExcelJS for .xlsx, jsPDF for PDF; both load only when
 * used). Export is the current view: the visible columns, the filter and the sort.
 */
import type { CellTextContext } from '@/domain/cellInput'
import { cellText } from '@/domain/cellInput'
import type { WorkbookTab } from '@/domain/importer/founders'
import { parseCsv } from '@/domain/importer/table'
import { tagColourHex } from '@/domain/tags'
import type { ColumnDef, Row } from '@/domain/types'
import { themes } from '@/styles/tokens'

// ---------- Reading ----------

type ExcelCell = { value: unknown; text?: string }

function excelCellText(cell: ExcelCell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    return v.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }
  if (typeof v === 'object') {
    const o = v as {
      richText?: { text: string }[]
      text?: string
      result?: unknown
      hyperlink?: string
    }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.text !== undefined) return String(o.text)
    if (o.result !== undefined) return String(o.result)
    if (o.hyperlink) return o.hyperlink
  }
  return String(v)
}

/** Every tab of an .xlsx file, or the one table of a .csv file, as rows of text cells. */
export async function readTable(file: File): Promise<WorkbookTab[]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') {
    return [{ name: file.name.replace(/\.csv$/i, ''), rows: parseCsv(await file.text()) }]
  }
  const { Workbook } = (await import('exceljs')).default
  const workbook = new Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = []
    sheet.eachRow({ includeEmpty: true }, (row, number) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = excelCellText(cell as unknown as ExcelCell).trim()
      })
      rows[number - 1] = Array.from(cells, (c) => c ?? '')
    })
    return { name: sheet.name, rows: Array.from(rows, (r) => r ?? []) }
  })
}

// ---------- Writing ----------

export interface ExportView {
  /** "Customers", or "Dawar · Customers" in Export everything. */
  title: string
  columns: readonly ColumnDef[]
  rows: readonly Row[]
  ctx: CellTextContext
}

const light = themes.light
const WARMTH_FILL: Record<string, { fill: string; font: string }> = {
  Warm: { fill: light.warmBg, font: light.warm },
  Waiting: { fill: light.waitingBg, font: light.waiting },
  Cold: { fill: light.coldBg, font: light.cold },
}

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`

/** A worksheet name Excel accepts: 31 characters, none of [ ] : * ? / \. */
export function worksheetName(title: string, taken: Set<string>): string {
  const base =
    title
      .replace(/[[\]:*?/\\]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet'
  let name = base
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 28).trim()} ${n}`
  taken.add(name.toLowerCase())
  return name
}

/** One .xlsx with a worksheet per view: header row, values as on screen, warmth and tag colours. */
export async function buildXlsx(views: readonly ExportView[]): Promise<ArrayBuffer> {
  const { Workbook } = (await import('exceljs')).default
  const workbook = new Workbook()
  workbook.creator = 'UA Internal CRM'
  const taken = new Set<string>()
  for (const view of views) {
    const sheet = workbook.addWorksheet(worksheetName(view.title, taken), {
      views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }],
    })
    sheet.columns = view.columns.map((c) => ({
      header: c.label,
      key: c.id,
      width: Math.max(10, Math.round(c.width / 7)),
    }))
    const header = sheet.getRow(1)
    header.font = { bold: true, color: { argb: argb(light.text) } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(light.gridHeader) } }
    for (const row of view.rows) {
      const added = sheet.addRow(view.columns.map((c) => cellText(c, row, view.ctx)))
      view.columns.forEach((column, i) => {
        const cell = added.getCell(i + 1)
        if (column.system && column.key === 'warmth') {
          const style = WARMTH_FILL[String(cell.value ?? '')]
          if (style) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(style.fill) } }
            cell.font = { bold: true, color: { argb: argb(style.font) } }
          }
        }
        if (column.system && column.key === 'tags' && row.tagIds.length > 0) {
          // Each tag in its own colour.
          const parts = row.tagIds
            .map((id) => view.ctx.tagMap.get(id))
            .filter((t): t is NonNullable<typeof t> => t !== undefined)
            .flatMap((tag, j) => [
              ...(j > 0 ? [{ text: ', ' }] : []),
              { text: '■ ', font: { color: { argb: argb(tagColourHex(tag.colour)) } } },
              { text: tag.name },
            ])
          if (parts.length > 0) cell.value = { richText: parts }
        }
      })
    }
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}

/** The current view as an A4 landscape PDF table. */
export async function buildPdf(view: ExportView): Promise<ArrayBuffer> {
  const { jsPDF } = await import('jspdf')
  const { autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  // The PDF's built-in fonts have no rupee sign.
  const pdfText = (s: string) => s.replace(/₹/g, 'Rs ').replace(/[–—]/g, '-').replace(/·/g, '-')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(pdfText(view.title), 40, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(
    `${view.rows.length} rows · exported ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`.replace(
      /·/g,
      '-',
    ),
    40,
    56,
  )
  const warmthIndex = view.columns.findIndex((c) => c.system && c.key === 'warmth')
  autoTable(doc, {
    startY: 68,
    head: [view.columns.map((c) => pdfText(c.label))],
    body: view.rows.map((row) => view.columns.map((c) => pdfText(cellText(c, row, view.ctx)))),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [235, 240, 244], textColor: [14, 26, 34], fontStyle: 'bold' },
    margin: { left: 40, right: 40 },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== warmthIndex) return
      const style = WARMTH_FILL[String(data.cell.raw ?? '')]
      if (!style) return
      const hex = (h: string) =>
        [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
      data.cell.styles.fillColor = hex(style.fill)
      data.cell.styles.textColor = hex(style.font)
      data.cell.styles.fontStyle = 'bold'
    },
  })
  return doc.output('arraybuffer')
}

/** Saves bytes as a file. */
export function download(bytes: ArrayBuffer, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** "UA CRM · Dawar · Customers · 5 Nov 2026.xlsx" */
export function exportFileName(title: string, extension: string, now: Date): string {
  const day = now.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
  return `UA CRM · ${title} · ${day}.${extension}`.replace(/[\\/:*?"<>|]/g, '-')
}
