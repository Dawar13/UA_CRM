/**
 * Stage logic. Every change returns the new row plus the HistoryEntry to append with it.
 * Dates are IST calendar dates. Pure.
 *
 * CONTRACT (signatures are fixed; bodies are implemented in M0.3).
 */
import type { DomainContext, Row, RowChange, Sheet, StageSnapshot, StageState } from './types'

/**
 * Moves `row` to stage `index` of `sheet`.
 * - Stamps the target stage with today's IST date.
 * - Stages between the old position and the target that were never reached become done with no
 *   date (key present, value null). Existing dates for earlier stages are kept.
 * - Moving back clears the dates (removes the keys) of every stage after the target.
 * - Moving clears `lost` (a stage move on a lost row reopens it).
 * - History: kind 'stage', source 'system', text such as "Stage: First call → Plant visit",
 *   meta { fromStageIndex, toStageIndex }.
 * Throws a RangeError when the sheet has no stages or the index is out of range.
 */
export declare function moveToStage(
  row: Row,
  sheet: Sheet,
  index: number,
  ctx: DomainContext,
): RowChange

/**
 * Marks the row lost at its current stage (stageIndex, or 0 when none reached yet) with today's
 * IST date. History text "Marked lost after First call", meta { lost: true }.
 */
export declare function markLost(row: Row, sheet: Sheet, ctx: DomainContext): RowChange

/** Clears `lost`. History text "Reopened at First call", meta { reopened: true }. */
export declare function reopen(row: Row, sheet: Sheet, ctx: DomainContext): RowChange

/** Restores a snapshot exactly (used by Undo). History meta { undo: true }. */
export declare function restoreStage(
  row: Row,
  sheet: Sheet,
  snapshot: StageSnapshot,
  ctx: DomainContext,
): RowChange

export declare function snapshotStage(row: Row): StageSnapshot

/** True when the row has reached the final stage and is not lost. */
export declare function isWon(row: Row, sheet: Sheet): boolean

/**
 * Visual state of stage position `i`:
 * - 'won' for the last stage when the row is won;
 * - 'done' for stages before the current one;
 * - 'current' for the current stage (when not won);
 * - 'lost-marker' for the position right after the stage it was lost at (if it exists);
 * - 'future' otherwise.
 */
export declare function stageState(row: Row, sheet: Sheet, i: number): StageState

/** Convenience for the UI: one entry per stage with its state and IST date (null = no date). */
export declare function stageView(
  row: Row,
  sheet: Sheet,
): { id: string; name: string; index: number; state: StageState; date: string | null }[]

/** Next and previous stage index for `]` and `[`; null at the ends or when lost. */
export declare function nextStageIndex(row: Row, sheet: Sheet): number | null
export declare function previousStageIndex(row: Row, sheet: Sheet): number | null
