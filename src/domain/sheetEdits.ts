/**
 * Bigger changes to a sheet that also change its rows: editing the stages (add, rename, reorder,
 * remove; the last stage is the win) and changing a column's type with the values converted.
 * Pure: both return the new sheet and the rows that change, for the repository to save together.
 */
import { cellText, parsePastedCell } from './cellInput'
import { fieldSchemaFor } from './fields'
import { SheetRuleError } from './sheets'
import type { ColumnDef, Id, Row, Sheet, StageDef, Tag } from './types'

// ---------- Stages ----------

/** Where the rows at a removed stage go: another stage's id, or null for no stage. */
export type StageMoves = Readonly<Record<Id, Id | null>>

export interface StageEditResult {
  sheet: Sheet
  /** Rows whose stage, stage dates or lost marker changed. */
  rows: Row[]
}

function stageColumn(sheet: Sheet, newId: () => Id): ColumnDef {
  const after = sheet.columns.find((c) => c.system && c.key === 'warmth')
  return {
    id: newId(),
    key: 'stage',
    label: 'Stage',
    type: 'stage',
    system: true,
    width: 214,
    hidden: false,
    position: after ? after.position + 1 : sheet.columns.length,
  }
}

/** The rows at each stage (by id), counting a lost row at the stage it stopped at. */
export function rowsAtStages(sheet: Sheet, rows: readonly Row[]): Map<Id, number> {
  const counts = new Map<Id, number>()
  for (const row of rows) {
    const index = row.lost ? row.lost.stageIndex : row.stageIndex
    const id = index === null ? undefined : sheet.stages[index]?.id
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/**
 * Replaces a sheet's stages with `next` (ids kept for stages that stay; new ids for new ones).
 * Rows keep their stage by id, so reordering moves nobody. Rows at a removed stage go where
 * `moves` says, and a stage date carries over when the target has none. Throws SheetRuleError
 * for an empty name, or a removed stage with rows and nowhere to go.
 */
export function editStages(
  sheet: Sheet,
  next: readonly StageDef[],
  moves: StageMoves,
  rows: readonly Row[],
  ctx: { now: Date; newId: () => Id },
): StageEditResult {
  const stages = next.map((s) => {
    const name = s.name.trim().replace(/\s+/g, ' ')
    if (name === '') throw new SheetRuleError('A stage needs a name')
    return { id: s.id, name }
  })
  if (new Set(stages.map((s) => s.id)).size !== stages.length) {
    throw new SheetRuleError('Each stage appears once')
  }
  const kept = new Set(stages.map((s) => s.id))
  const removed = sheet.stages.filter((s) => !kept.has(s.id))
  const counts = rowsAtStages(sheet, rows)
  for (const stage of removed) {
    if ((counts.get(stage.id) ?? 0) > 0 && !Object.hasOwn(moves, stage.id)) {
      throw new SheetRuleError(`Choose where the rows at ${stage.name} go`)
    }
  }
  const newIndex = new Map(stages.map((s, i) => [s.id, i]))
  /** The id a row at `oldIndex` ends up at (null for no stage). */
  const target = (oldIndex: number | null): Id | null => {
    if (oldIndex === null) return null
    const id = sheet.stages[oldIndex]?.id
    if (!id) return null
    if (kept.has(id)) return id
    const to = moves[id] ?? null
    return to !== null && kept.has(to) ? to : null
  }

  const at = ctx.now.toISOString()
  const changed: Row[] = []
  for (const row of rows) {
    const stageId = target(row.stageIndex)
    const lostId = row.lost ? target(row.lost.stageIndex) : null
    const stageDates: Record<string, string | null> = {}
    for (const [id, date] of Object.entries(row.stageDates)) {
      if (kept.has(id)) stageDates[id] = date
    }
    for (const stage of removed) {
      const to = moves[stage.id]
      if (to && kept.has(to) && Object.hasOwn(row.stageDates, stage.id)) {
        stageDates[to] = stageDates[to] ?? row.stageDates[stage.id] ?? null
      }
    }
    const nextRow: Row = {
      ...row,
      stageIndex: stageId === null ? null : (newIndex.get(stageId) ?? null),
      stageDates,
      lost:
        row.lost && lostId !== null ? { ...row.lost, stageIndex: newIndex.get(lostId) ?? 0 } : null,
    }
    const same =
      nextRow.stageIndex === row.stageIndex &&
      JSON.stringify(nextRow.stageDates) === JSON.stringify(row.stageDates) &&
      JSON.stringify(nextRow.lost) === JSON.stringify(row.lost)
    if (!same) changed.push({ ...nextRow, updatedAt: at })
  }

  let columns = sheet.columns
  if (stages.length > 0 && !columns.some((c) => c.system && c.key === 'stage')) {
    const column = stageColumn(sheet, ctx.newId)
    columns = [
      ...columns.map((c) =>
        c.position >= column.position ? { ...c, position: c.position + 1 } : c,
      ),
      column,
    ]
  }
  return { sheet: { ...sheet, stages, columns, updatedAt: at }, rows: changed }
}

// ---------- Column types ----------

export interface ConvertedValue {
  rowId: Id
  rowName: string
  /** The value as it reads now. */
  before: string
  /** The new value, or undefined when it does not convert (it will be cleared). */
  after: unknown
}

export interface ColumnConversion {
  sheet: Sheet
  /** Every row with a value in the column, converted or not. */
  values: ConvertedValue[]
  /** Rows whose value changes (converted or cleared). */
  rows: Row[]
}

/**
 * Changing a custom column's type: each value is read as text and parsed as the new type
 * ("25,00,000" as currency, "Yes" as a checkbox, "12 Nov" as a date). Values that do not
 * convert are listed and cleared on save. New dropdown options are taken from the values.
 */
export function convertColumn(
  sheet: Sheet,
  columnId: Id,
  type: ColumnDef['type'],
  rows: readonly Row[],
  ctx: { now: Date; tagMap: ReadonlyMap<string, Tag> },
): ColumnConversion {
  const column = sheet.columns.find((c) => c.id === columnId && !c.deletedAt)
  if (!column) throw new SheetRuleError('That column is not on this sheet')
  if (column.system) throw new SheetRuleError("A system column's type cannot change")
  const textCtx = {
    now: ctx.now,
    tagMap: ctx.tagMap,
    rowName: () => undefined,
    stageNames: sheet.stages.map((s) => s.name),
  }
  const asText = (row: Row) => cellText(column, row, textCtx)

  // Choices take their options from the values there are.
  let options: string[] | undefined
  if (type === 'dropdown' || type === 'multiSelect') {
    const found = new Set(column.options ?? [])
    for (const row of rows) {
      const text = asText(row)
      if (!text) continue
      for (const part of type === 'multiSelect' ? text.split(/[,;]/) : [text]) {
        const option = part.trim()
        if (option) found.add(option)
      }
    }
    options = [...found]
  }
  const target: ColumnDef = { ...column, type, ...(options ? { options } : {}) }
  if (!options) delete target.options

  const values: ConvertedValue[] = []
  const changed: Row[] = []
  for (const row of rows) {
    const current = row.fields[column.key]
    if (current === null || current === undefined || current === '') continue
    const before = asText(row)
    let after: unknown
    if (column.type === type) {
      after = current
    } else {
      const parsed = parsePastedCell(target, before, ctx.now, textCtx.stageNames)
      after =
        parsed.ok &&
        parsed.kind === 'patch' &&
        fieldSchemaFor(target).safeParse(parsed.value).success
          ? parsed.value
          : undefined
    }
    values.push({ rowId: row.id, rowName: row.name, before, after })
    if (after !== current) {
      const fields = { ...row.fields }
      if (after === undefined || after === null) delete fields[column.key]
      else fields[column.key] = after
      changed.push({ ...row, fields })
    }
  }
  const at = ctx.now.toISOString()
  return {
    sheet: {
      ...sheet,
      columns: sheet.columns.map((c) => (c.id === columnId ? target : c)),
      updatedAt: at,
    },
    values,
    rows: changed.map((r) => ({ ...r, updatedAt: at })),
  }
}
