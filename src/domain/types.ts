/** Domain types, inferred from the Zod schemas in `schemas.ts`. Pure. */
import type { z } from 'zod'
import type {
  calendarAttendeeSchema,
  calendarEventSchema,
  columnDefSchema,
  columnTypeSchema,
  coreFieldKeySchema,
  fileRefSchema,
  fuzzyDateSchema,
  fuzzyPrecisionSchema,
  historyEntrySchema,
  historyKindSchema,
  historySourceSchema,
  linkRefSchema,
  lostInfoSchema,
  memberSchema,
  nextActionSchema,
  rowSchema,
  sheetSchema,
  stageDefSchema,
  tagSchema,
  templateKeySchema,
  warmthSchema,
} from './schemas'

export type Id = string
/** "2026-11-05" */
export type IsoDate = string
/** "2026-11-05T04:30:00.000Z" */
export type IsoDateTime = string

export type FuzzyPrecision = z.infer<typeof fuzzyPrecisionSchema>
export type FuzzyDate = z.infer<typeof fuzzyDateSchema>
export type Warmth = z.infer<typeof warmthSchema>
export type ColumnType = z.infer<typeof columnTypeSchema>
export type CoreFieldKey = z.infer<typeof coreFieldKeySchema>
export type ColumnDef = z.infer<typeof columnDefSchema>
export type StageDef = z.infer<typeof stageDefSchema>
export type TemplateKey = z.infer<typeof templateKeySchema>
export type Member = z.infer<typeof memberSchema>
export type Sheet = z.infer<typeof sheetSchema>
export type LinkRef = z.infer<typeof linkRefSchema>
export type NextAction = z.infer<typeof nextActionSchema>
export type LostInfo = z.infer<typeof lostInfoSchema>
export type FileRef = z.infer<typeof fileRefSchema>
export type Row = z.infer<typeof rowSchema>
export type Tag = z.infer<typeof tagSchema>
export type HistoryKind = z.infer<typeof historyKindSchema>
export type HistorySource = z.infer<typeof historySourceSchema>
export type HistoryEntry = z.infer<typeof historyEntrySchema>
export type CalendarAttendee = z.infer<typeof calendarAttendeeSchema>
export type CalendarEvent = z.infer<typeof calendarEventSchema>

/** Visual state of one stage position. */
export type StageState = 'done' | 'current' | 'future' | 'lost-marker' | 'won'

/** Everything a stage change touches, so undo can restore it exactly. */
export interface StageSnapshot {
  stageIndex: number | null
  stageDates: Record<string, IsoDate | null>
  lost: LostInfo | null
}

/**
 * What domain operations need from the outside world. Passing it in keeps `domain/` pure and
 * makes tests deterministic.
 */
export interface DomainContext {
  /** The current instant. */
  now: Date
  /** The member making the change. */
  actorId: Id
  /** Generates a new unique id. */
  newId: () => Id
}

/** A domain change: the updated row and the history entry to append with it, atomically. */
export interface RowChange {
  row: Row
  history: HistoryEntry
}
