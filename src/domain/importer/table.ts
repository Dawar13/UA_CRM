/**
 * Importing any table (.xlsx or .csv) into a sheet: reading CSV, matching the file's columns to
 * the sheet's, and turning each line into a new row with any values that do not fit listed.
 * Pure.
 */
import { cellPatch, parsePastedCell } from '../cellInput'
import type { NewRowValues } from '../rows'
import type { ColumnDef, Row, Sheet, Warmth } from '../types'

/** CSV (RFC 4180): commas, quoted cells with commas, quotes and new lines. Also semicolons. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const firstLine = input.split('\n', 1)[0] ?? ''
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] ?? ''
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Words that name a column differently in other spreadsheets. */
const SYNONYMS: Record<string, string> = {
  'full name': 'name',
  contact: 'name',
  'contact name': 'name',
  person: 'name',
  organisation: 'company',
  organization: 'company',
  firm: 'company',
  'company name': 'company',
  designation: 'title',
  role: 'title',
  position: 'title',
  'job title': 'title',
  mobile: 'phone',
  'phone number': 'phone',
  'mobile number': 'phone',
  whatsapp: 'phone',
  'e-mail': 'email',
  'email address': 'email',
  mail: 'email',
  linkedin: 'linkedin',
  'linkedin url': 'linkedin',
  website: 'links',
  url: 'links',
  comments: 'notes',
  comment: 'notes',
  remarks: 'notes',
  'spl mentions': 'connectsTo',
}

/** The sheet column each file column most likely is, by name; null to skip it. */
export function autoMap(
  headers: readonly string[],
  sheet: Sheet,
  remembered: Readonly<Record<string, string>> = {},
): (string | null)[] {
  const live = sheet.columns.filter(
    (c) => !c.deletedAt && c.key !== 'lastTouch' && c.key !== 'files',
  )
  const taken = new Set<string>()
  return headers.map((header) => {
    const h = header.trim().toLowerCase()
    const pick = (column: ColumnDef | undefined) => {
      if (!column || taken.has(column.id)) return null
      taken.add(column.id)
      return column.id
    }
    const memory = remembered[h]
    if (memory && live.some((c) => c.id === memory)) return pick(live.find((c) => c.id === memory))
    const byLabel = live.find((c) => c.label.toLowerCase() === h)
    if (byLabel) return pick(byLabel)
    // "Ticket estimate" for "Ticket estimate (₹ L/yr)": the start of one label only.
    const starts = h.length >= 3 ? live.filter((c) => c.label.toLowerCase().startsWith(h)) : []
    if (starts.length === 1) return pick(starts[0])
    const key = SYNONYMS[h]
    if (key) return pick(live.find((c) => c.system && c.key === key))
    return null
  })
}

export interface ImportedLine {
  values: NewRowValues
  /** Tags by name (new ones are created on import). */
  tagNames: string[]
  /** "Line 4, Archetype: Steel works is not one of the options". */
  problems: string[]
}

/** One line of the file as a new row: each mapped cell read as its column's type. */
export function lineToRow(
  cells: readonly string[],
  mapping: readonly (string | null)[],
  sheet: Sheet,
  line: number,
  now: Date,
): ImportedLine {
  const stageNames = sheet.stages.map((s) => s.name)
  const problems: string[] = []
  let draft = {
    fields: {},
    nextAction: null,
    tagIds: [],
    connectsTo: [],
    links: [],
  } as unknown as Row
  const values: NewRowValues = {}
  let warmth: Warmth | null | undefined
  let stageIndex: number | undefined
  const tagNames: string[] = []
  mapping.forEach((columnId, i) => {
    if (!columnId) return
    const def = sheet.columns.find((c) => c.id === columnId)
    const text = (cells[i] ?? '').trim()
    if (!def || text === '') return
    const parsed = parsePastedCell(def, text, now, stageNames)
    if (!parsed.ok) {
      problems.push(`Line ${line}, ${def.label}: ${parsed.message}`)
      return
    }
    if (parsed.kind === 'warmth') warmth = parsed.value
    else if (parsed.kind === 'stage') stageIndex = parsed.value ?? undefined
    else if (parsed.kind === 'tags') tagNames.push(...parsed.names)
    else {
      const change = cellPatch(def, draft, parsed.value)
      Object.assign(values, change)
      draft = { ...draft, ...change }
    }
  })
  if (warmth !== undefined) values.warmth = warmth
  if (stageIndex !== undefined) values.stageIndex = stageIndex
  if (!values.name?.trim()) problems.push(`Line ${line}: no name, so it is skipped`)
  return { values, tagNames, problems }
}
