/**
 * Sheets and their columns: creating a sheet from a template, naming, and the column rules
 * (system columns can be hidden and resized but never deleted or retyped). Pure.
 */
import { fieldSchemaFor } from './fields'
import { buildSheetSchema } from './templates'
import type { ColumnDef, Id, Row, Sheet, StageDef, TemplateKey } from './types'

/** A sheet or column change that cannot be made. Sentence case, ready to show. */
export class SheetRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SheetRuleError'
  }
}

/** "Service providers" → "service-providers"; never empty. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'sheet' : slug
}

/** `base`, or `base-2`, `base-3`… whichever is not taken. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!used.has(candidate)) return candidate
  }
}

function cleanName(name: string, what: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed === '') throw new SheetRuleError(`A ${what} needs a name`)
  return trimmed
}

/**
 * A new sheet for `memberId` from `template`, placed after `existing` (the member's live
 * sheets). Its slug is unique among them.
 */
export function newSheet(
  memberId: Id,
  input: { name: string; template: TemplateKey },
  existing: readonly Pick<Sheet, 'slug' | 'position'>[],
  ids: { sheetId: Id; newId: () => Id },
  now: Date,
): Sheet {
  const name = cleanName(input.name, 'sheet')
  const { columns, stages } = buildSheetSchema(input.template, ids.newId)
  const at = now.toISOString()
  return {
    id: ids.sheetId,
    memberId,
    slug: uniqueSlug(
      slugify(name),
      existing.map((s) => s.slug),
    ),
    name,
    template: input.template,
    position: existing.reduce((max, s) => Math.max(max, s.position + 1), 0),
    columns,
    stages,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

/** Renames a sheet; the slug follows the name and stays unique among `others`. */
export function renameSheet(
  sheet: Sheet,
  name: string,
  others: readonly Pick<Sheet, 'id' | 'slug'>[],
  now: Date,
): Sheet {
  const clean = cleanName(name, 'sheet')
  const taken = others.filter((s) => s.id !== sheet.id).map((s) => s.slug)
  return {
    ...sheet,
    name: clean,
    slug: uniqueSlug(slugify(clean), taken),
    updatedAt: now.toISOString(),
  }
}

/** Positions 0..n in the order of `orderedIds`; ids not listed keep their relative order after. */
export function reorderByIds<T extends { id: Id; position: number }>(
  items: readonly T[],
  orderedIds: readonly Id[],
): T[] {
  const rank = new Map(orderedIds.map((id, i) => [id, i]))
  const sorted = [...items].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return ra - rb || a.position - b.position
  })
  return sorted.map((item, position) => ({ ...item, position }))
}

/** Live (not deleted) columns, in position order. */
export function liveColumns(sheet: Pick<Sheet, 'columns'>): ColumnDef[] {
  return sheet.columns
    .filter((c) => !c.deletedAt)
    .slice()
    .sort((a, b) => a.position - b.position)
}

/** "Plant location" → "plantLocation"; unique among every key the sheet has ever used. */
export function columnKeyFor(label: string, sheet: Pick<Sheet, 'columns'>): string {
  const words = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const camel = words.map((w, i) => (i === 0 ? w : `${w[0]?.toUpperCase()}${w.slice(1)}`)).join('')
  const base = camel === '' || /^[0-9]/.test(camel) ? `field${camel}` : camel
  const used = new Set(sheet.columns.map((c) => c.key))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`
}

const CHOICE_TYPES = new Set<ColumnDef['type']>(['dropdown', 'multiSelect'])
const SYSTEM_ONLY_TYPES = new Set<ColumnDef['type']>([
  'warmth',
  'stage',
  'tags',
  'lastTouch',
  'nextAction',
])

function cleanOptions(options: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const option of options ?? []) {
    const trimmed = option.trim()
    const key = trimmed.toLowerCase()
    if (trimmed !== '' && !seen.has(key)) {
      seen.add(key)
      out.push(trimmed)
    }
  }
  return out
}

/** A custom column appended after the sheet's live columns. */
export function addColumn(
  sheet: Sheet,
  input: { label: string; type: ColumnDef['type']; options?: readonly string[]; width?: number },
  id: Id,
  now: Date,
): Sheet {
  if (SYSTEM_ONLY_TYPES.has(input.type)) {
    throw new SheetRuleError('That column type belongs to the sheet itself')
  }
  const label = cleanName(input.label, 'column')
  const column: ColumnDef = {
    id,
    key: columnKeyFor(label, sheet),
    label,
    type: input.type,
    system: false,
    ...(CHOICE_TYPES.has(input.type) ? { options: cleanOptions(input.options) } : {}),
    width: input.width ?? 160,
    hidden: false,
    position: sheet.columns.reduce((max, c) => Math.max(max, c.position + 1), 0),
  }
  return { ...sheet, columns: [...sheet.columns, column], updatedAt: now.toISOString() }
}

function withColumn(sheet: Sheet, columnId: Id): ColumnDef {
  const column = sheet.columns.find((c) => c.id === columnId && !c.deletedAt)
  if (!column) throw new SheetRuleError('That column is not on this sheet')
  return column
}

function replaceColumn(sheet: Sheet, column: ColumnDef, now: Date): Sheet {
  return {
    ...sheet,
    columns: sheet.columns.map((c) => (c.id === column.id ? column : c)),
    updatedAt: now.toISOString(),
  }
}

/**
 * Renames, retypes, hides, resizes or edits the options of a column. System columns can only be
 * renamed, hidden and resized; Name can never be hidden.
 */
export function updateColumn(
  sheet: Sheet,
  columnId: Id,
  patch: Partial<Pick<ColumnDef, 'label' | 'type' | 'options' | 'width' | 'hidden'>>,
  now: Date,
): Sheet {
  const column = withColumn(sheet, columnId)
  const next: ColumnDef = { ...column }
  if (patch.label !== undefined) next.label = cleanName(patch.label, 'column')
  if (patch.width !== undefined) {
    if (!Number.isInteger(patch.width) || patch.width < 48) {
      throw new SheetRuleError('A column is at least 48 pixels wide')
    }
    next.width = patch.width
  }
  if (patch.hidden !== undefined) {
    if (patch.hidden && column.key === 'name' && column.system) {
      throw new SheetRuleError('The Name column is always shown')
    }
    next.hidden = patch.hidden
  }
  if (patch.type !== undefined && patch.type !== column.type) {
    if (column.system) throw new SheetRuleError("A system column's type cannot change")
    if (SYSTEM_ONLY_TYPES.has(patch.type)) {
      throw new SheetRuleError('That column type belongs to the sheet itself')
    }
    next.type = patch.type
    if (!CHOICE_TYPES.has(patch.type)) delete next.options
  }
  if (patch.options !== undefined) {
    if (!CHOICE_TYPES.has(next.type)) {
      throw new SheetRuleError('Only dropdown and multi-select columns have options')
    }
    next.options = cleanOptions(patch.options)
  } else if (CHOICE_TYPES.has(next.type) && next.options === undefined) {
    next.options = []
  }
  return replaceColumn(sheet, next, now)
}

/**
 * How many of `rows` hold a value in `columnId` that the column, as defined in `sheet`, would no
 * longer accept (after a type or options change). Converting values comes with the column
 * manager; until then such a change is refused rather than losing what people typed.
 */
export function valuesThatNoLongerFit(
  sheet: Sheet,
  columnId: Id,
  rows: readonly Pick<Row, 'fields'>[],
): number {
  const column = sheet.columns.find((c) => c.id === columnId)
  if (!column || column.system) return 0
  const schema = fieldSchemaFor(column)
  return rows.filter((r) => !schema.safeParse(r.fields[column.key]).success).length
}

/** Moves a custom column to Trash. System columns can be hidden but not deleted. */
export function deleteColumn(sheet: Sheet, columnId: Id, now: Date): Sheet {
  const column = withColumn(sheet, columnId)
  if (column.system) throw new SheetRuleError('System columns can be hidden but not deleted')
  return replaceColumn(sheet, { ...column, deletedAt: now.toISOString() }, now)
}

/** Brings a column back from Trash, at the end of the sheet. */
export function restoreColumn(sheet: Sheet, columnId: Id, now: Date): Sheet {
  const column = sheet.columns.find((c) => c.id === columnId)
  if (!column?.deletedAt) throw new SheetRuleError('That column is not in Trash')
  const position = sheet.columns.reduce((max, c) => Math.max(max, c.position + 1), 0)
  return replaceColumn(sheet, { ...column, deletedAt: null, position }, now)
}

/** Live columns in the order given; deleted columns keep their place after them. */
export function reorderColumns(sheet: Sheet, columnIds: readonly Id[], now: Date): Sheet {
  const live = reorderByIds(liveColumns(sheet), columnIds)
  const deleted = sheet.columns
    .filter((c) => c.deletedAt)
    .map((c, i) => ({ ...c, position: live.length + i }))
  return { ...sheet, columns: [...live, ...deleted], updatedAt: now.toISOString() }
}

/** Renames stages in place. Adding, removing and reordering stages arrives with the stage editor. */
export function renameStages(sheet: Sheet, stages: readonly StageDef[], now: Date): Sheet {
  if (
    stages.length !== sheet.stages.length ||
    stages.some((s, i) => s.id !== sheet.stages[i]?.id)
  ) {
    throw new SheetRuleError('Stages can only be renamed here')
  }
  return {
    ...sheet,
    stages: stages.map((s) => ({ id: s.id, name: cleanName(s.name, 'stage') })),
    updatedAt: now.toISOString(),
  }
}
