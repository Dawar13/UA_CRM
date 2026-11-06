/**
 * The founders' old spreadsheet (CLAUDE.md §2.11): blocks for Dawar, Dhruv and Common, each with
 * the columns Name, Company, Type, Spl mentions and Date. The blocks may be separate tabs of the
 * workbook, or sections of one tab that each start with a row holding just the block's name.
 * Pure: cells in, rows out.
 */
import { parseDateInput } from '../cellInput'
import type { NewRowValues } from '../rows'
import type { FuzzyDate, TemplateKey } from '../types'

export type Block = string

export interface FounderRow {
  block: Block
  /** Line in the workbook, for the preview. */
  line: number
  name: string
  company: string
  type: string
  mentions: string
  /** The Date cell as written. */
  dateText: string
}

/** An imported, dated touch (a NewHistoryInput the repository takes). */
export interface ImportedTouch {
  kind: 'imported'
  at: string
  fuzzyDate?: FuzzyDate | null
  text: string
}

export interface WorkbookTab {
  name: string
  rows: string[][]
}

const HEADER = ['name', 'company', 'type', 'spl mentions', 'date']

function isHeader(cells: readonly string[]): boolean {
  const lower = cells.map((c) => c.trim().toLowerCase())
  return lower.includes('name') && (lower.includes('type') || lower.includes('company'))
}

function columnIndex(header: readonly string[], name: string): number {
  const lower = header.map((c) => c.trim().toLowerCase())
  if (name === 'spl mentions') {
    return lower.findIndex((c) => c.startsWith('spl') || c.includes('mention'))
  }
  return lower.indexOf(name)
}

/** A row holding only a block name ("Dawar", "Dhruv", "Common"), with an optional colon. */
function blockName(cells: readonly string[]): string | null {
  const filled = cells.map((c) => c.trim()).filter(Boolean)
  if (filled.length !== 1) return null
  const name = (filled[0] ?? '').replace(/:$/, '')
  return /^[A-Za-z][A-Za-z ]{1,30}$/.test(name) && !HEADER.includes(name.toLowerCase())
    ? name
    : null
}

/** Every person in the workbook, by block. */
export function readFoundersWorkbook(tabs: readonly WorkbookTab[]): FounderRow[] {
  const out: FounderRow[] = []
  for (const tab of tabs) {
    let block: string = tab.name.trim()
    let header: string[] | null = null
    tab.rows.forEach((cells, i) => {
      if (cells.every((c) => c.trim() === '')) return
      const named = blockName(cells)
      if (named && !isHeader(cells)) {
        block = named
        header = null
        return
      }
      if (isHeader(cells)) {
        header = cells
        return
      }
      if (!header) return
      const cell = (name: string) => {
        const index = columnIndex(header ?? [], name)
        return index >= 0 ? (cells[index] ?? '').trim() : ''
      }
      const name = cell('name')
      if (!name) return
      out.push({
        block,
        line: i + 1,
        name,
        company: cell('company'),
        type: cell('type'),
        mentions: cell('spl mentions'),
        dateText: cell('date'),
      })
    })
  }
  return out
}

/** Where a Type sends a person: VC and Angel to Investors, Advisor to Advisors, Friend to
 * Connectors; Industry (and anything else) is chosen in the preview. */
export interface TypeMapping {
  template: TemplateKey | null
  fields: Record<string, unknown>
}

export function mapFounderType(type: string): TypeMapping {
  const t = type.trim().toLowerCase()
  if (t === 'vc' || t === 'vcs') return { template: 'investors', fields: { investorType: 'VC' } }
  if (t === 'angel' || t === 'angels')
    return { template: 'investors', fields: { investorType: 'Angel' } }
  if (t.startsWith('advisor') || t.startsWith('adviser'))
    return { template: 'advisors', fields: {} }
  if (t === 'friend' || t === 'friends') {
    return { template: 'connectors', fields: { relationship: 'Friend' } }
  }
  return { template: null, fields: {} }
}

/** The new row and its imported history entry for one person. */
export function founderRowValues(
  row: FounderRow,
  template: TemplateKey,
  now: Date,
): { values: NewRowValues; history: ImportedTouch[] } {
  const mapping = mapFounderType(row.type)
  const values: NewRowValues = {
    name: row.name,
    company: row.company,
    ...(row.mentions ? { connectsTo: [{ kind: 'text' as const, text: row.mentions }] } : {}),
    ...(mapping.template === template && Object.keys(mapping.fields).length > 0
      ? { fields: mapping.fields }
      : {}),
  }
  const history: ImportedTouch[] = []
  const date: FuzzyDate | null = row.dateText ? parseDateInput(row.dateText, now) : null
  const text = [`Imported from the old spreadsheet (${row.block})`, row.type && `Type: ${row.type}`]
    .filter(Boolean)
    .join('. ')
  if (date) {
    history.push({
      kind: 'imported',
      at: new Date(`${date.date}T06:30:00.000Z`).toISOString(),
      fuzzyDate: date.precision === 'day' ? null : date,
      text,
    })
  } else {
    history.push({ kind: 'imported', at: now.toISOString(), text })
  }
  if (row.dateText && !date) {
    values.notes = `Date in the old sheet: ${row.dateText}`
  }
  return { values, history }
}
