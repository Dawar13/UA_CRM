/**
 * Typing into the grid: how the text a person types (or pastes) becomes a cell value, per column
 * type, and what each cell offers to edit or copy as text. Pure: no React, no I/O.
 */
import * as chrono from 'chrono-node'
import {
  formatFuzzyDate,
  IST_OFFSET_MINUTES,
  istDateOf,
  parseFuzzyDate,
  parseIsoDate,
  parseNaturalDate,
} from './dates'
import { formatCurrency, formatNumber } from './format'
import { formatPhone, normalisePhone } from './identity'
import type { RowPatch } from './rows'
import type { ColumnDef, FuzzyDate, LinkRef, NextAction, Row, Tag } from './types'
import { warmthLabel } from './warmth'

/** Which editor a cell opens. */
export type EditorKind =
  | 'text'
  | 'longText'
  | 'choice'
  | 'multiChoice'
  | 'tags'
  | 'person'
  | 'people'
  | 'checkbox'
  | 'readOnly'

const SYSTEM_EDITORS: Record<string, EditorKind> = {
  name: 'text',
  company: 'text',
  title: 'text',
  phone: 'text',
  email: 'text',
  linkedin: 'text',
  links: 'text',
  warmth: 'choice',
  stage: 'choice',
  tags: 'tags',
  lastTouch: 'readOnly',
  nextAction: 'text',
  nextDate: 'text',
  introducedBy: 'person',
  connectsTo: 'people',
  notes: 'longText',
  files: 'readOnly',
}

const CUSTOM_EDITORS: Record<ColumnDef['type'], EditorKind> = {
  text: 'text',
  longText: 'longText',
  number: 'text',
  currency: 'text',
  date: 'text',
  dropdown: 'choice',
  multiSelect: 'multiChoice',
  personLink: 'person',
  url: 'text',
  phone: 'text',
  email: 'text',
  checkbox: 'checkbox',
  files: 'readOnly',
  warmth: 'readOnly',
  stage: 'readOnly',
  tags: 'readOnly',
  lastTouch: 'readOnly',
  nextAction: 'readOnly',
}

export function editorKind(def: ColumnDef): EditorKind {
  return def.system ? (SYSTEM_EDITORS[def.key] ?? 'readOnly') : CUSTOM_EDITORS[def.type]
}

/** What a text editor understands, for the column's parse rules. */
type TextRule =
  | 'name'
  | 'plain'
  | 'phone'
  | 'email'
  | 'url'
  | 'links'
  | 'number'
  | 'currency'
  | 'date'
  | 'nextAction'

function textRule(def: ColumnDef): TextRule {
  if (def.system) {
    switch (def.key) {
      case 'name':
        return 'name'
      case 'phone':
        return 'phone'
      case 'email':
        return 'email'
      case 'linkedin':
        return 'url'
      case 'links':
        return 'links'
      case 'nextAction':
        return 'nextAction'
      case 'nextDate':
        return 'date'
      default:
        return 'plain'
    }
  }
  switch (def.type) {
    case 'phone':
      return 'phone'
    case 'email':
      return 'email'
    case 'url':
      return 'url'
    case 'number':
      return 'number'
    case 'currency':
      return 'currency'
    case 'date':
      return 'date'
    default:
      return 'plain'
  }
}

export type CellInput =
  | { ok: true; value: unknown; preview: string | null }
  | { ok: false; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "1,20,000", "3.5", "-12" → number. Null when it is not a plain number. */
export function parseNumber(text: string): number | null {
  const tidy = text.trim().replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(tidy)) return null
  const value = Number(tidy)
  return Number.isFinite(value) ? value : null
}

const UNITS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  l: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
  crores: 10_000_000,
}

/** Rupees from "25L", "25 lakh", "1.2cr", "₹1.2 Cr", "₹25,00,000", "45k" or "45000". */
export function parseAmount(text: string): number | null {
  const tidy = text
    .trim()
    .toLowerCase()
    .replace(/^(₹|rs\.?|inr)\s*/, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
  const m = /^(-?\d+(?:\.\d+)?)\s*([a-z]+)?$/.exec(tidy)
  if (!m) return null
  const amount = Number(m[1])
  const unit = m[2]
  if (unit === undefined) return amount
  const factor = UNITS[unit]
  return factor === undefined ? null : Math.round(amount * factor)
}

/**
 * A date from what a person types: fuzzy forms first ("mid Oct", "12 Nov", "Oct 2026"), then
 * natural language through chrono ("next fri", "tomorrow"), forward-dated in IST.
 */
export function parseDateInput(text: string, now: Date): FuzzyDate | null {
  const fuzzy = parseFuzzyDate(text, now)
  if (fuzzy) return fuzzy
  const natural = parseNaturalDate(text, now)
  return natural ? { date: istDateOf(natural), precision: 'day' } : null
}

/**
 * A next action from one line: a date at the start (fuzzy or natural), then what to do.
 * "fri 4pm send ROI note" → Fri, "send ROI note"; "mid Nov plant visit" → Mid Nov, "plant
 * visit"; "call Rohan" → no date. Null for an empty line.
 */
export function parseNextAction(text: string, now: Date): NextAction | null {
  const line = text.trim().replace(/\s+/g, ' ')
  if (line === '') return null
  const words = line.split(' ')
  // The longest leading run of words that reads as a fuzzy date.
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    const date = parseFuzzyDate(words.slice(0, n).join(' '), now)
    if (date) return { date, text: words.slice(n).join(' ') }
  }
  const [result] = chrono.en.GB.parse(
    line,
    { instant: now, timezone: IST_OFFSET_MINUTES },
    { forwardDate: true },
  )
  if (result && result.index === 0) {
    return {
      date: { date: istDateOf(result.start.date()), precision: 'day' },
      text: line.slice(result.text.length).trim(),
    }
  }
  return { date: null, text: line }
}

/** The option a person meant: exact (any case), else the only one starting or containing it. */
export function matchOption(options: readonly string[], text: string): string | null {
  const q = text.trim().toLowerCase()
  if (q === '') return null
  const exact = options.find((o) => o.toLowerCase() === q)
  if (exact !== undefined) return exact
  const starts = options.filter((o) => o.toLowerCase().startsWith(q))
  if (starts.length === 1) return starts[0] ?? null
  const contains = options.filter((o) => o.toLowerCase().includes(q))
  return contains.length === 1 ? (contains[0] ?? null) : null
}

/** "12 Nov 2026", "Mid Nov 2026", "Nov 2026": what a date editor starts with (it reads back). */
export function editableDate(date: FuzzyDate): string {
  const { year, month, day } = parseIsoDate(date.date)
  const mon = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', {
    month: 'short',
    timeZone: 'UTC',
  })
  switch (date.precision) {
    case 'day':
      return `${day} ${mon} ${year}`
    case 'early-month':
      return `Early ${mon} ${year}`
    case 'mid-month':
      return `Mid ${mon} ${year}`
    case 'late-month':
      return `Late ${mon} ${year}`
    case 'month':
      return `${mon} ${year}`
  }
}

/** Reads a text editor's input for `def`. Empty input clears the cell (except Name). */
export function parseTextCell(def: ColumnDef, text: string, now: Date): CellInput {
  const value = text.trim()
  const rule = textRule(def)
  if (rule === 'name') {
    return value === ''
      ? { ok: false, message: 'A row needs a name' }
      : { ok: true, value, preview: null }
  }
  if (value === '') {
    const empty =
      rule === 'links'
        ? []
        : rule === 'plain' || rule === 'phone' || rule === 'email' || rule === 'url'
          ? ''
          : null
    return { ok: true, value: def.system ? empty : null, preview: null }
  }
  switch (rule) {
    case 'phone': {
      const e164 = normalisePhone(value)
      return e164
        ? { ok: true, value: e164, preview: formatPhone(e164) }
        : { ok: true, value, preview: 'Kept as typed' }
    }
    case 'email':
      return EMAIL_RE.test(value)
        ? { ok: true, value, preview: null }
        : { ok: false, message: "That doesn't look like an email address" }
    case 'links':
      return {
        ok: true,
        value: value
          .split(/[\s,]+/)
          .map((l) => l.trim())
          .filter(Boolean),
        preview: null,
      }
    case 'number': {
      const n = parseNumber(value)
      return n === null
        ? { ok: false, message: 'Type a number, like 1,200 or 3.5' }
        : { ok: true, value: n, preview: formatNumber(n) }
    }
    case 'currency': {
      const n = parseAmount(value)
      return n === null
        ? { ok: false, message: 'Type an amount, like 25L, 1.2cr or 45,000' }
        : { ok: true, value: n, preview: formatCurrency(n) }
    }
    case 'date': {
      const date = parseDateInput(value, now)
      return date
        ? { ok: true, value: date, preview: formatFuzzyDate(date, now) }
        : { ok: false, message: 'Type a date, like 12 Nov, mid Oct or next fri' }
    }
    case 'nextAction': {
      const next = parseNextAction(value, now)
      const preview = next?.date
        ? `${formatFuzzyDate(next.date, now)}${next.text ? ` · ${next.text}` : ''}`
        : null
      return { ok: true, value: next, preview }
    }
    default:
      return { ok: true, value, preview: null }
  }
}

/** A custom field set to `value` (an empty value removes the key). */
function withField(row: Row, key: string, value: unknown): RowPatch {
  const fields = { ...row.fields }
  const empty =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  if (empty) delete fields[key]
  else fields[key] = value
  return { fields }
}

/**
 * The row change for a new cell value. Warmth and stage have their own operations (they log
 * history), so they never come through here.
 */
export function cellPatch(def: ColumnDef, row: Row, value: unknown): RowPatch {
  if (!def.system) return withField(row, def.key, value)
  switch (def.key) {
    case 'name':
    case 'company':
    case 'title':
    case 'phone':
    case 'email':
    case 'linkedin':
    case 'notes':
      return { [def.key]: typeof value === 'string' ? value : '' }
    case 'links':
      return { links: Array.isArray(value) ? value.map(String) : [] }
    case 'tags':
      return { tagIds: Array.isArray(value) ? value.map(String) : [] }
    case 'nextAction':
      return { nextAction: (value as NextAction | null) ?? null }
    case 'nextDate':
      return {
        nextAction: {
          text: row.nextAction?.text ?? '',
          date: (value as FuzzyDate | null) ?? null,
        },
      }
    case 'introducedBy':
      return { introducedBy: (value as LinkRef | null) ?? null }
    case 'connectsTo':
      return { connectsTo: Array.isArray(value) ? (value as LinkRef[]) : [] }
    default:
      return {}
  }
}

export interface CellTextContext {
  now: Date
  tagMap: ReadonlyMap<string, Tag>
  /** Name of a linked row, when it is loaded. */
  rowName: (rowId: string) => string | undefined
  stageNames: readonly string[]
}

function linkText(link: LinkRef, ctx: CellTextContext): string {
  return link.kind === 'row' ? (ctx.rowName(link.rowId) ?? '') : link.text
}

/** The current value of a cell, raw: what `cellPatch` would write to keep it unchanged. */
export function cellValue(def: ColumnDef, row: Row): unknown {
  if (!def.system) return row.fields[def.key]
  switch (def.key) {
    case 'tags':
      return row.tagIds
    case 'nextDate':
      return row.nextAction?.date ?? null
    case 'warmth':
      return row.warmth
    case 'stage':
      return row.stageIndex
    case 'lastTouch':
      return row.lastTouchAt
    default:
      return (row as unknown as Record<string, unknown>)[def.key]
  }
}

/** What a text editor starts with: the value in a form that reads back the same. */
export function cellEditText(def: ColumnDef, row: Row, ctx: CellTextContext): string {
  const value = cellValue(def, row)
  if (value === null || value === undefined) return ''
  if (def.system) {
    switch (def.key) {
      case 'phone':
        return row.phone.startsWith('+') ? formatPhone(row.phone) : row.phone
      case 'links':
        return row.links.join(', ')
      case 'nextAction': {
        const next = row.nextAction
        if (!next) return ''
        return [next.date ? editableDate(next.date) : '', next.text].filter(Boolean).join(' ')
      }
      case 'nextDate':
        return row.nextAction?.date ? editableDate(row.nextAction.date) : ''
      default:
        return typeof value === 'string' ? value : ''
    }
  }
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? String(value) : ''
    case 'currency':
      return typeof value === 'number' ? formatCurrency(value) : ''
    case 'date':
      return typeof value === 'object' && value !== null && 'precision' in value
        ? editableDate(value as FuzzyDate)
        : ''
    case 'phone':
      return typeof value === 'string' && value.startsWith('+') ? formatPhone(value) : String(value)
    case 'multiSelect':
      return Array.isArray(value) ? value.join(', ') : ''
    case 'personLink':
      return typeof value === 'object' && value !== null && 'kind' in value
        ? linkText(value as LinkRef, ctx)
        : ''
    default:
      return typeof value === 'string' ? value : String(value)
  }
}

/** A cell as plain text, as it reads on screen: for copying and exports. */
export function cellText(def: ColumnDef, row: Row, ctx: CellTextContext): string {
  if (def.system) {
    switch (def.key) {
      case 'warmth':
        return row.warmth ? warmthLabel(row.warmth) : ''
      case 'stage': {
        if (row.lost) return `Lost after ${ctx.stageNames[row.lost.stageIndex] ?? ''}`.trim()
        return row.stageIndex === null ? '' : (ctx.stageNames[row.stageIndex] ?? '')
      }
      case 'tags':
        return row.tagIds
          .map((id) => ctx.tagMap.get(id)?.name)
          .filter(Boolean)
          .join(', ')
      case 'lastTouch':
        return row.lastTouchAt
          ? formatFuzzyDate({ date: istDateOf(row.lastTouchAt), precision: 'day' }, ctx.now)
          : ''
      case 'nextAction': {
        const next = row.nextAction
        if (!next) return ''
        return [next.date ? formatFuzzyDate(next.date, ctx.now) : '', next.text]
          .filter(Boolean)
          .join(' · ')
      }
      case 'nextDate':
        return row.nextAction?.date ? formatFuzzyDate(row.nextAction.date, ctx.now) : ''
      case 'introducedBy':
        return row.introducedBy ? linkText(row.introducedBy, ctx) : ''
      case 'connectsTo':
        return row.connectsTo
          .map((l) => linkText(l, ctx))
          .filter(Boolean)
          .join(', ')
      case 'files':
        return row.files.map((f) => f.name).join(', ')
      default:
        return cellEditText(def, row, ctx)
    }
  }
  const value = row.fields[def.key]
  if (value === null || value === undefined) return ''
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? formatNumber(value) : ''
    case 'date':
      return typeof value === 'object' && value !== null && 'precision' in value
        ? formatFuzzyDate(value as FuzzyDate, ctx.now)
        : ''
    case 'checkbox':
      return value === true ? 'Yes' : value === false ? 'No' : ''
    case 'files':
      return Array.isArray(value)
        ? value.map((f) => (f as { name?: string }).name ?? '').join(', ')
        : ''
    default:
      return cellEditText(def, row, ctx)
  }
}

/**
 * A pasted cell's text as a value for `def` (spreadsheet paste). Choices match their options;
 * people become free text; tags become names (created on save if new). Warmth and stage come
 * back as the warmth or the stage index.
 */
export function parsePastedCell(
  def: ColumnDef,
  text: string,
  now: Date,
  stageNames: readonly string[],
):
  | { ok: true; kind: 'patch'; value: unknown }
  | { ok: true; kind: 'warmth'; value: Row['warmth'] }
  | { ok: true; kind: 'stage'; value: number | null }
  | { ok: true; kind: 'tags'; names: string[] }
  | { ok: false; message: string } {
  const value = text.trim()
  switch (editorKind(def)) {
    case 'text':
    case 'longText': {
      const parsed = parseTextCell(def, value, now)
      return parsed.ok ? { ok: true, kind: 'patch', value: parsed.value } : parsed
    }
    case 'choice': {
      if (def.system && def.key === 'warmth') {
        if (value === '') return { ok: true, kind: 'warmth', value: null }
        const label = matchOption(['Warm', 'Waiting', 'Cold'], value)
        return label
          ? { ok: true, kind: 'warmth', value: label.toLowerCase() as Row['warmth'] }
          : { ok: false, message: 'Warmth is Warm, Waiting or Cold' }
      }
      if (def.system && def.key === 'stage') {
        if (value === '') return { ok: false, message: 'A stage cannot be cleared by pasting' }
        const name = matchOption(stageNames, value)
        return name === null
          ? { ok: false, message: 'That stage is not on this sheet' }
          : { ok: true, kind: 'stage', value: stageNames.indexOf(name) }
      }
      if (value === '') return { ok: true, kind: 'patch', value: null }
      const option = matchOption(def.options ?? [], value)
      return option === null
        ? { ok: false, message: `${value} is not one of the options` }
        : { ok: true, kind: 'patch', value: option }
    }
    case 'multiChoice': {
      const picked: string[] = []
      for (const part of value.split(/[,;]/)) {
        if (part.trim() === '') continue
        const option = matchOption(def.options ?? [], part)
        if (option === null)
          return { ok: false, message: `${part.trim()} is not one of the options` }
        if (!picked.includes(option)) picked.push(option)
      }
      return { ok: true, kind: 'patch', value: picked.length > 0 ? picked : null }
    }
    case 'tags':
      return {
        ok: true,
        kind: 'tags',
        names: value
          .split(/[,;]/)
          .map((t) => t.trim().replace(/^#+/, ''))
          .filter(Boolean),
      }
    case 'person':
      return { ok: true, kind: 'patch', value: value === '' ? null : { kind: 'text', text: value } }
    case 'people':
      return {
        ok: true,
        kind: 'patch',
        value: value
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => ({ kind: 'text', text: t })),
      }
    case 'checkbox': {
      const yes = /^(yes|y|true|1|x|✓)$/i.test(value)
      const no = value === '' || /^(no|n|false|0)$/i.test(value)
      return yes || no
        ? { ok: true, kind: 'patch', value: yes ? true : value === '' ? null : false }
        : { ok: false, message: 'Type yes or no' }
    }
    default:
      return { ok: false, message: 'This column cannot be pasted into' }
  }
}

/**
 * Splits clipboard text from Excel or Google Sheets into rows of cells: tab between cells, a
 * new line between rows, and quoted cells that may hold tabs, new lines and doubled quotes.
 */
export function parseClipboardGrid(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const input = text.replace(/\r\n?/g, '\n')
  while (i < input.length) {
    const ch = input[i] ?? ''
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      cell += ch
      i += 1
      continue
    }
    if (ch === '"' && cell === '') {
      quoted = true
      i += 1
      continue
    }
    if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
    i += 1
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** Cells as clipboard text that Excel and Google Sheets read back. */
export function toClipboardGrid(rows: readonly (readonly string[])[]): string {
  const quote = (cell: string) => (/[\t\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)
  return rows.map((r) => r.map(quote).join('\t')).join('\n')
}
