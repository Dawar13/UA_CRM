/**
 * Creating and editing rows. Stage and warmth have their own operations (stages.ts, warmth.ts)
 * because each writes a history entry with the change; everything else a cell edit changes goes
 * through `patchRow`. Pure: no React, no I/O.
 */
import { todayIst } from './dates'
import { fieldSchemaFor, validateRowFields } from './fields'
import { normalisePhone } from './identity'
import type { DomainContext, Id, LinkRef, Row, RowChange, Sheet } from './types'

/** The row properties a cell edit may change. */
export const editableRowKeys = [
  'name',
  'company',
  'title',
  'phone',
  'email',
  'linkedin',
  'links',
  'tagIds',
  'nextAction',
  'introducedBy',
  'connectsTo',
  'notes',
  'fields',
  'samePerson',
  'cellColours',
  'height',
] as const satisfies readonly (keyof Row)[]

/** Row heights (CLAUDE.md §3.3): the default, and the range a dragged row may take. */
export const ROW_HEIGHT_DEFAULT = 36
export const ROW_HEIGHT_MIN = 36
export const ROW_HEIGHT_MAX = 240

/** A dragged height, rounded and kept in range; the default height is stored as null. */
export function clampRowHeight(height: number | null | undefined): number | null {
  if (height === null || height === undefined || !Number.isFinite(height)) return null
  const rounded = Math.round(Math.min(ROW_HEIGHT_MAX, Math.max(ROW_HEIGHT_MIN, height)))
  return rounded === ROW_HEIGHT_DEFAULT ? null : rounded
}

export type EditableRowKey = (typeof editableRowKeys)[number]
export type RowPatch = Partial<Pick<Row, EditableRowKey>>
/** Values for a new row: anything editable, plus a starting warmth and stage. */
export type NewRowValues = RowPatch & Partial<Pick<Row, 'warmth' | 'stageIndex'>>

export interface RowIssue {
  key: string
  message: string
}

/** A row that cannot be saved as it is. Messages are sentence case, ready to show. */
export class RowValidationError extends Error {
  readonly issues: readonly RowIssue[]
  constructor(issues: readonly RowIssue[]) {
    super(issues.map((i) => i.message).join('. '))
    this.name = 'RowValidationError'
    this.issues = issues
  }
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)]

function sameLink(a: LinkRef, b: LinkRef): boolean {
  return a.kind === 'row'
    ? b.kind === 'row' && a.rowId === b.rowId
    : b.kind === 'text' && a.text === b.text
}

/**
 * Tidies what a person typed: trims text, stores a phone that parses as E.164 (otherwise as
 * typed), drops empty and repeated links, tags and connections, and turns an empty next action
 * into none.
 */
export function cleanRowPatch(patch: RowPatch): RowPatch {
  const out: RowPatch = { ...patch }
  for (const key of ['name', 'company', 'title', 'email', 'linkedin'] as const) {
    const value = out[key]
    if (value !== undefined) out[key] = value.trim()
  }
  if (out.phone !== undefined) out.phone = normalisePhone(out.phone) ?? out.phone.trim()
  if (out.links !== undefined) out.links = unique(out.links.map((l) => l.trim()).filter(Boolean))
  if (out.tagIds !== undefined) out.tagIds = unique(out.tagIds)
  if (out.samePerson !== undefined) out.samePerson = unique(out.samePerson)
  if (out.height !== undefined) out.height = clampRowHeight(out.height)
  if (out.cellColours !== undefined) {
    // Only cells that have a colour are kept.
    out.cellColours = Object.fromEntries(
      Object.entries(out.cellColours).filter(([, colour]) => Boolean(colour)),
    )
  }
  if (out.connectsTo !== undefined) {
    const kept: LinkRef[] = []
    for (const link of out.connectsTo) {
      const tidy: LinkRef = link.kind === 'text' ? { kind: 'text', text: link.text.trim() } : link
      if (tidy.kind === 'text' && tidy.text === '') continue
      if (!kept.some((k) => sameLink(k, tidy))) kept.push(tidy)
    }
    out.connectsTo = kept
  }
  if (out.introducedBy?.kind === 'text') {
    const text = out.introducedBy.text.trim()
    out.introducedBy = text === '' ? null : { kind: 'text', text }
  }
  if (out.nextAction) {
    const text = out.nextAction.text.trim()
    out.nextAction =
      text === '' && out.nextAction.date === null ? null : { ...out.nextAction, text }
  }
  return out
}

/** Every reason `row` cannot be saved in `sheet`; empty when it can. */
export function rowIssues(row: Row, sheet: Sheet): RowIssue[] {
  const issues: RowIssue[] = []
  if (row.name.trim() === '') issues.push({ key: 'name', message: 'A row needs a name' })
  if (row.stageIndex !== null) {
    if (sheet.stages.length === 0) {
      issues.push({ key: 'stage', message: 'This sheet has no stages' })
    } else if (
      !Number.isInteger(row.stageIndex) ||
      row.stageIndex < 0 ||
      row.stageIndex >= sheet.stages.length
    ) {
      issues.push({ key: 'stage', message: 'That stage is not on this sheet' })
    }
  }
  if (row.introducedBy?.kind === 'row' && row.introducedBy.rowId === row.id) {
    issues.push({ key: 'introducedBy', message: 'A person cannot introduce themselves' })
  }
  if (row.connectsTo.some((l) => l.kind === 'row' && l.rowId === row.id)) {
    issues.push({ key: 'connectsTo', message: 'A person cannot connect to themselves' })
  }
  if (row.samePerson?.includes(row.id)) {
    issues.push({ key: 'samePerson', message: 'A row cannot link to itself' })
  }
  issues.push(...validateRowFields(row, sheet).errors)
  return issues
}

function assertValid(row: Row, sheet: Sheet): void {
  const issues = rowIssues(row, sheet)
  if (issues.length > 0) throw new RowValidationError(issues)
}

/**
 * A new row in `sheet`, with its "Added to <sheet>" history entry. A starting stage is stamped
 * with today's IST date; the stages before it count as done without a date.
 * Throws RowValidationError when the values cannot be saved.
 */
export function newRow(
  sheet: Sheet,
  values: NewRowValues,
  placement: { id: Id; position: number },
  ctx: DomainContext,
): RowChange {
  const at = ctx.now.toISOString()
  const { warmth, stageIndex, ...editable } = values
  const clean = cleanRowPatch(editable)
  const stage = stageIndex ?? null
  const stageDates: Record<string, string | null> = {}
  if (stage !== null) {
    sheet.stages.forEach((s, i) => {
      if (i < stage) stageDates[s.id] = null
      else if (i === stage) stageDates[s.id] = todayIst(ctx.now)
    })
  }
  const row: Row = {
    id: placement.id,
    sheetId: sheet.id,
    memberId: sheet.memberId,
    position: placement.position,
    name: '',
    company: '',
    title: '',
    phone: '',
    email: '',
    linkedin: '',
    links: [],
    warmth: warmth ?? null,
    stageIndex: stage,
    stageDates,
    lost: null,
    tagIds: [],
    nextAction: null,
    introducedBy: null,
    connectsTo: [],
    notes: '',
    files: [],
    fields: {},
    ...clean,
    lastTouchAt: at,
    createdAt: at,
    updatedAt: at,
    createdBy: ctx.actorId,
    updatedBy: ctx.actorId,
    deletedAt: null,
  }
  assertValid(row, sheet)
  return {
    row,
    history: {
      id: ctx.newId(),
      rowId: row.id,
      kind: 'created',
      source: 'system',
      at,
      fuzzyDate: null,
      text: `Added to ${sheet.name}`,
      memberId: ctx.actorId,
    },
  }
}

/**
 * `row` with a cell edit applied. Keys outside `editableRowKeys` are ignored, so a patch cannot
 * change ownership, stage, warmth or last touch. Throws RowValidationError when the result
 * cannot be saved.
 */
export function patchRow(row: Row, sheet: Sheet, patch: RowPatch, ctx: DomainContext): Row {
  const allowed: RowPatch = {}
  for (const key of editableRowKeys) {
    if (Object.hasOwn(patch, key)) Object.assign(allowed, { [key]: patch[key] })
  }
  const next: Row = {
    ...row,
    ...cleanRowPatch(allowed),
    updatedAt: ctx.now.toISOString(),
    updatedBy: ctx.actorId,
  }
  assertValid(next, sheet)
  return next
}

/**
 * What a copy of `row` takes into `destination` ("Copy to my sheet"): the contact details, tags,
 * links and notes, and each custom field the destination has under the same key and type with a
 * value that fits there. Stage, warmth, next action and history stay with the original. The copy
 * names the original as the same person.
 */
export function copiedRowValues(row: Row, source: Sheet, destination: Sheet): NewRowValues {
  const from = new Map(source.columns.map((c) => [c.key, c]))
  const to = new Map(
    destination.columns.filter((c) => !c.system && !c.deletedAt).map((c) => [c.key, c]),
  )
  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row.fields)) {
    const target = to.get(key)
    if (!target || from.get(key)?.type !== target.type) continue
    if (value === null || value === undefined) continue
    if (fieldSchemaFor(target).safeParse(value).success) fields[key] = value
  }
  return {
    name: row.name,
    company: row.company,
    title: row.title,
    phone: row.phone,
    email: row.email,
    linkedin: row.linkedin,
    links: row.links,
    tagIds: row.tagIds,
    introducedBy: row.introducedBy,
    connectsTo: row.connectsTo,
    notes: row.notes,
    fields,
    samePerson: [row.id],
  }
}
