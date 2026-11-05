/**
 * Pure helpers that turn a sheet's ColumnDefs into what the grid needs: visible columns, sort
 * values and alignment. No React.
 */
import { sortKey } from '@/domain/dates'
import type { ColumnDef, FuzzyDate, LinkRef, Row, Sheet, Tag } from '@/domain/types'

export interface SortContext {
  sheet: Sheet
  tagMap: ReadonlyMap<string, Tag>
  /** Display name of a linked row, when known. */
  rowName: (rowId: string) => string | undefined
}

export type SortValue = string | number | undefined

/** Visible columns in position order. Stage is dropped when the sheet has no stages. */
export function visibleColumns(sheet: Sheet): ColumnDef[] {
  return sheet.columns
    .filter((c) => !c.hidden)
    .filter((c) => c.type !== 'stage' || sheet.stages.length > 0)
    .sort((a, b) => a.position - b.position)
}

/** Numbers right-align with tabular figures. */
export function columnAlign(def: ColumnDef): 'start' | 'end' {
  return def.type === 'number' || def.type === 'currency' ? 'end' : 'start'
}

const warmthOrder = { warm: 0, waiting: 1, cold: 2 } as const

function text(value: string | null | undefined): SortValue {
  const t = (value ?? '').trim().toLocaleLowerCase('en-IN')
  return t === '' ? undefined : t
}

function isFuzzyDate(value: unknown): value is FuzzyDate {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { date?: unknown }).date === 'string' &&
    typeof (value as { precision?: unknown }).precision === 'string'
  )
}

function isLinkRef(value: unknown): value is LinkRef {
  if (typeof value !== 'object' || value === null) return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'row' || kind === 'text'
}

export function linkLabel(link: LinkRef, rowName: SortContext['rowName']): string {
  return link.kind === 'row' ? (rowName(link.rowId) ?? '') : link.text
}

/** The value a column sorts by. Undefined sorts last in both directions. */
export function sortValue(def: ColumnDef, row: Row, ctx: SortContext): SortValue {
  if (def.system) {
    switch (def.key) {
      case 'name':
        return text(row.name)
      case 'company':
        return text(row.company)
      case 'title':
        return text(row.title)
      case 'phone':
        return text(row.phone)
      case 'email':
        return text(row.email)
      case 'linkedin':
        return text(row.linkedin)
      case 'links':
        return text(row.links.join(' '))
      case 'notes':
        return text(row.notes)
      case 'warmth':
        return row.warmth ? warmthOrder[row.warmth] : undefined
      case 'stage':
        if (row.stageIndex === null) return undefined
        // Lost rows sort below every live stage.
        return row.lost ? -1 : row.stageIndex
      case 'tags':
        return text(
          row.tagIds
            .map((id) => ctx.tagMap.get(id)?.name ?? '')
            .sort()
            .join(' '),
        )
      case 'lastTouch':
        return row.lastTouchAt ?? undefined
      case 'nextAction':
        return row.nextAction?.date
          ? `${sortKey(row.nextAction.date)} ${row.nextAction.text}`
          : text(row.nextAction?.text)
      case 'nextDate':
        return row.nextAction?.date ? sortKey(row.nextAction.date) : undefined
      case 'introducedBy':
        return row.introducedBy ? text(linkLabel(row.introducedBy, ctx.rowName)) : undefined
      case 'connectsTo':
        return text(row.connectsTo.map((l) => linkLabel(l, ctx.rowName)).join(' '))
      case 'files':
        return row.files.length || undefined
      default:
        return undefined
    }
  }

  const value = row.fields[def.key]
  if (value === null || value === undefined || value === '') return undefined
  switch (def.type) {
    case 'number':
    case 'currency':
      return typeof value === 'number' ? value : undefined
    case 'date':
      return isFuzzyDate(value) ? sortKey(value) : undefined
    case 'dropdown': {
      const index = def.options?.indexOf(String(value)) ?? -1
      return index >= 0 ? index : text(String(value))
    }
    case 'multiSelect':
      return Array.isArray(value) ? text(value.map(String).join(' ')) : undefined
    case 'checkbox':
      return value === true ? 1 : 0
    case 'personLink':
      return isLinkRef(value) ? text(linkLabel(value, ctx.rowName)) : undefined
    case 'files':
      return Array.isArray(value) ? value.length || undefined : undefined
    default:
      return text(typeof value === 'string' ? value : String(value))
  }
}

/** Compares two defined sort values. */
export function compareSortValues(a: SortValue, b: SortValue): number {
  if (a === b) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'en-IN', { numeric: true, sensitivity: 'base' })
}
