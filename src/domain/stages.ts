/**
 * Stage logic. Every change returns the new row plus the HistoryEntry to append with it.
 * Dates are IST calendar dates. Pure.
 *
 * Every change also counts as a touch: the returned row has `updatedAt`, `updatedBy` and
 * `lastTouchAt` set from the context.
 *
 * Lost rows and display: a row with no stage yet can still be marked lost. `lost.stageIndex`
 * must be a valid index, so it records 0 (the first stage) and `row.stageIndex` stays null.
 * For display, the "effective" stage of a row is `row.stageIndex ?? row.lost?.stageIndex`, so
 * such a row shows the first stage as current, the red lost marker at the second position, and
 * "Lost after <first stage>". Reopening returns it to having no stage.
 */
import { todayIst } from './dates'
import type {
  DomainContext,
  HistoryEntry,
  HistoryKind,
  Row,
  RowChange,
  Sheet,
  StageSnapshot,
  StageState,
} from './types'

/**
 * Builds a system history entry for `row` and returns it with the row stamped as updated and
 * touched. Shared by stage and warmth changes.
 */
export function systemChange(
  row: Row,
  patch: Partial<Row>,
  kind: HistoryKind,
  text: string,
  meta: NonNullable<HistoryEntry['meta']>,
  ctx: DomainContext,
): RowChange {
  const at = ctx.now.toISOString()
  return {
    row: { ...row, ...patch, updatedAt: at, updatedBy: ctx.actorId, lastTouchAt: at },
    history: {
      id: ctx.newId(),
      rowId: row.id,
      kind,
      source: 'system',
      at,
      fuzzyDate: null,
      text,
      memberId: ctx.actorId,
      meta,
    },
  }
}

function assertHasStages(sheet: Sheet): void {
  if (sheet.stages.length === 0) throw new RangeError(`Sheet "${sheet.name}" has no stages`)
}

function assertIndex(sheet: Sheet, index: number): void {
  assertHasStages(sheet)
  if (!Number.isInteger(index) || index < 0 || index >= sheet.stages.length) {
    throw new RangeError(`Stage index ${index} is out of range for sheet "${sheet.name}"`)
  }
}

function stageName(sheet: Sheet, index: number): string {
  return sheet.stages[index]?.name ?? `Stage ${index + 1}`
}

/** The stage a row is shown at: its own stage, or the stage recorded when it was lost. */
export function effectiveStageIndex(row: Row): number | null {
  return row.stageIndex ?? row.lost?.stageIndex ?? null
}

/**
 * Moves `row` to stage `index` of `sheet`.
 * - Moving forward stamps the target stage with today's IST date. Moving back (or to the
 *   current stage) keeps what the target had: the date it was first reached, or null if it was
 *   skipped.
 * - Stages between the old position and the target that were never reached become done with no
 *   date (key present, value null). Existing dates for earlier stages are kept.
 * - Moving back clears the dates (removes the keys) of every stage after the target.
 * - Moving clears `lost` (a stage move on a lost row reopens it; meta.reopened is then true).
 * - History: kind 'stage', source 'system', text such as "Stage: First call → Plant visit",
 *   or "Stage set to Identified" from no stage, meta { fromStageIndex, toStageIndex }.
 * Throws a RangeError when the sheet has no stages or the index is out of range.
 */
export function moveToStage(row: Row, sheet: Sheet, index: number, ctx: DomainContext): RowChange {
  assertIndex(sheet, index)
  const from = row.stageIndex
  const forward = from === null || index > from
  const stageDates: Record<string, string | null> = {}

  sheet.stages.forEach((stage, i) => {
    const reached = Object.hasOwn(row.stageDates, stage.id)
    const existing = row.stageDates[stage.id] ?? null
    if (i < index) {
      // Reached before the target: keep its date, or mark it done without a date.
      stageDates[stage.id] = existing
    } else if (i === index) {
      // Forward: reached today. Back or same: keep what it had (a date, or null if skipped).
      stageDates[stage.id] = forward || !reached ? todayIst(ctx.now) : existing
    }
    // After the target: not reached, so the key is left out.
  })

  const text =
    from === null || from === index
      ? `Stage set to ${stageName(sheet, index)}`
      : `Stage: ${stageName(sheet, from)} → ${stageName(sheet, index)}`
  const meta: NonNullable<HistoryEntry['meta']> = { fromStageIndex: from, toStageIndex: index }
  if (row.lost) meta.reopened = true

  return systemChange(row, { stageIndex: index, stageDates, lost: null }, 'stage', text, meta, ctx)
}

/**
 * Marks the row lost at its current stage (stageIndex, or 0 when none reached yet) with today's
 * IST date. History text "Marked lost after First call", meta { lost: true }.
 * `row.stageIndex` is left as it is (see the note at the top of this file).
 * Throws a RangeError when the sheet has no stages or the row is already lost.
 */
export function markLost(row: Row, sheet: Sheet, ctx: DomainContext): RowChange {
  assertHasStages(sheet)
  if (row.lost) throw new RangeError('Row is already lost')
  const at = row.stageIndex ?? 0
  assertIndex(sheet, at)
  return systemChange(
    row,
    { lost: { stageIndex: at, date: todayIst(ctx.now) } },
    'stage',
    `Marked lost after ${stageName(sheet, at)}`,
    { lost: true },
    ctx,
  )
}

/**
 * Clears `lost`. History text "Reopened at First call" ("Reopened" when the row has no stage),
 * meta { reopened: true }. Throws a RangeError when the row is not lost.
 */
export function reopen(row: Row, sheet: Sheet, ctx: DomainContext): RowChange {
  if (!row.lost) throw new RangeError('Row is not lost')
  const text =
    row.stageIndex === null ? 'Reopened' : `Reopened at ${stageName(sheet, row.stageIndex)}`
  return systemChange(row, { lost: null }, 'stage', text, { reopened: true }, ctx)
}

/**
 * Restores a snapshot exactly (used by Undo). History meta { undo: true, fromStageIndex,
 * toStageIndex }, text "Stage restored to First call", "Restored as lost after First call" or
 * "Stage cleared". Throws a RangeError when the snapshot does not fit the sheet.
 */
export function restoreStage(
  row: Row,
  sheet: Sheet,
  snapshot: StageSnapshot,
  ctx: DomainContext,
): RowChange {
  if (snapshot.stageIndex !== null) assertIndex(sheet, snapshot.stageIndex)
  if (snapshot.lost) assertIndex(sheet, snapshot.lost.stageIndex)
  const shown = snapshot.stageIndex ?? snapshot.lost?.stageIndex ?? null
  let text: string
  if (snapshot.lost) text = `Restored as lost after ${stageName(sheet, shown ?? 0)}`
  else if (shown === null) text = 'Stage cleared'
  else text = `Stage restored to ${stageName(sheet, shown)}`
  const restored = snapshotStage({ ...row, ...snapshot })
  return systemChange(
    row,
    restored,
    'stage',
    text,
    { undo: true, fromStageIndex: row.stageIndex, toStageIndex: snapshot.stageIndex },
    ctx,
  )
}

/** A deep copy of everything a stage change touches. */
export function snapshotStage(row: Row): StageSnapshot {
  return {
    stageIndex: row.stageIndex,
    stageDates: { ...row.stageDates },
    lost: row.lost ? { ...row.lost } : null,
  }
}

/** True when the row has reached the final stage and is not lost. */
export function isWon(row: Row, sheet: Sheet): boolean {
  return sheet.stages.length > 0 && row.lost === null && row.stageIndex === sheet.stages.length - 1
}

/**
 * Visual state of stage position `i`:
 * - 'won' for the last stage when the row is won;
 * - 'done' for stages before the current one;
 * - 'current' for the current stage (when not won; on a lost row, the stage it stopped at);
 * - 'lost-marker' for the position right after the stage it was lost at (if it exists);
 * - 'future' otherwise.
 * Throws a RangeError when `i` is not a stage position of the sheet.
 */
export function stageState(row: Row, sheet: Sheet, i: number): StageState {
  assertIndex(sheet, i)
  if (isWon(row, sheet)) return i === sheet.stages.length - 1 ? 'won' : 'done'
  const current = effectiveStageIndex(row)
  if (current !== null && i < current) return 'done'
  if (current !== null && i === current) return 'current'
  if (row.lost && i === (current ?? 0) + 1) return 'lost-marker'
  return 'future'
}

/** Convenience for the UI: one entry per stage with its state and IST date (null = no date). */
export function stageView(
  row: Row,
  sheet: Sheet,
): { id: string; name: string; index: number; state: StageState; date: string | null }[] {
  return sheet.stages.map((stage, index) => ({
    id: stage.id,
    name: stage.name,
    index,
    state: stageState(row, sheet, index),
    date: row.stageDates[stage.id] ?? null,
  }))
}

/** Next and previous stage index for `]` and `[`; null at the ends or when lost. */
export function nextStageIndex(row: Row, sheet: Sheet): number | null {
  if (sheet.stages.length === 0 || row.lost) return null
  if (row.stageIndex === null) return 0
  return row.stageIndex < sheet.stages.length - 1 ? row.stageIndex + 1 : null
}

export function previousStageIndex(row: Row, sheet: Sheet): number | null {
  if (sheet.stages.length === 0 || row.lost || row.stageIndex === null) return null
  return row.stageIndex > 0 ? row.stageIndex - 1 : null
}
