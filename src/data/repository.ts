/**
 * The Repository is the only door to data. Components never import Dexie or Supabase; they
 * call hooks in `data/hooks/`, and the hooks call a Repository.
 *
 * Phase 0 ships `LocalRepository` (Dexie on IndexedDB). Phase 1 adds `SupabaseRepository`
 * behind the same interface, so the UI does not change.
 *
 * Stage, warmth and history changes are one operation: each mutation writes the row and appends
 * its history entry atomically, and updates `row.lastTouchAt`.
 */
import type {
  CalendarEvent,
  ColumnDef,
  HistoryEntry,
  Id,
  IsoDateTime,
  Member,
  Row,
  Sheet,
  StageSnapshot,
  Tag,
  TemplateKey,
  Warmth,
} from '@/domain/types'

/** Who is acting and when. In Phase 0 the open member tab is the actor (no sign-in yet). */
export interface MutationContext {
  actorId: Id
  now: Date
}

export interface MutationResult {
  row: Row
  history: HistoryEntry
}

/** Where a row lives, for cross-tab jumps and "Member · Sheet" labels. */
export interface RowLocation {
  row: Row
  sheet: Sheet
  member: Member
}

export type SearchField =
  | 'name'
  | 'company'
  | 'title'
  | 'email'
  | 'phone'
  | 'tags'
  | 'notes'
  | 'connectsTo'

export interface SearchResult extends RowLocation {
  /** Higher is better. */
  score: number
  /** The best-matching field, for highlighting and a secondary line in the palette. */
  matchedField: SearchField
  /** The text of the matched field, for display with highlighting. */
  matchedText: string
}

export interface DateRange {
  /** Inclusive UTC instant. */
  from: IsoDateTime
  /** Exclusive UTC instant. */
  to: IsoDateTime
}

/** Phase 1 inputs, declared now so the contract is settled. */
export interface NewRowInput {
  sheetId: Id
  values: Partial<Omit<Row, 'id' | 'sheetId' | 'memberId' | 'createdAt' | 'updatedAt'>>
}
export interface DuplicateCandidate {
  row: Row
  level: 'hard' | 'soft'
  reason: 'phone' | 'email' | 'linkedin' | 'name' | 'first-name-company'
}
export interface ImportBatch {
  sheetId: Id
  rows: NewRowInput['values'][]
  history?: Omit<HistoryEntry, 'id' | 'rowId'>[][]
}
export interface TrashItem {
  kind: 'row' | 'sheet'
  id: Id
  label: string
  deletedAt: IsoDateTime
}

export interface Repository {
  // ---------- Phase 0: reads ----------
  listMembers(): Promise<Member[]>
  listSheets(memberId: Id): Promise<Sheet[]>
  getSheet(sheetId: Id): Promise<Sheet | undefined>
  /** Live (not deleted) rows of a sheet, sorted by `position`. */
  listRows(sheetId: Id): Promise<Row[]>
  getRow(rowId: Id): Promise<Row | undefined>
  /** Row with its sheet and member, for cross-tab jumps. Undefined when missing or deleted. */
  getRowLocation(rowId: Id): Promise<RowLocation | undefined>
  /** Live row counts per sheet for one member's tabs. */
  countRows(memberId: Id): Promise<Record<Id, number>>
  listTags(): Promise<Tag[]>
  /** Newest first. */
  listHistory(rowId: Id): Promise<HistoryEntry[]>
  /**
   * Search across every member and sheet: name, company, title, email, phone, tags, notes and
   * connects to, using normalised tokens. Every query token must match some field (prefix
   * match). Ordered by score, then name. Empty query returns [].
   */
  search(query: string, options?: { limit?: number }): Promise<SearchResult[]>
  /** Events of one member that overlap the range, sorted by start. */
  listCalendarEvents(memberId: Id, range: DateRange): Promise<CalendarEvent[]>

  // ---------- Phase 0: mutations (row + history atomically) ----------
  updateStage(rowId: Id, stageIndex: number, ctx: MutationContext): Promise<MutationResult>
  markLost(rowId: Id, ctx: MutationContext): Promise<MutationResult>
  reopen(rowId: Id, ctx: MutationContext): Promise<MutationResult>
  /** Undo for stage, lost and reopen: restores the snapshot exactly and logs the undo. */
  restoreStage(rowId: Id, snapshot: StageSnapshot, ctx: MutationContext): Promise<MutationResult>
  updateWarmth(
    rowId: Id,
    warmth: Warmth | null,
    ctx: MutationContext,
    options?: { undo?: boolean },
  ): Promise<MutationResult>

  // ---------- Phase 0: sample data ----------
  /** Seeds on first launch (tracked by meta.seedVersion). Safe to call repeatedly. */
  ensureSeeded(): Promise<void>
  /** Clears everything and reseeds. */
  resetSampleData(): Promise<void>
  /** Adds (or replaces) a 2,000-row Customers sheet for the first member. Dev and test hook. */
  loadPerfSheet(): Promise<Sheet>

  // ---------- Phase 1 (throw NotImplementedInPhase0; not reachable from the UI) ----------
  createRow(input: NewRowInput, ctx: MutationContext): Promise<Row>
  updateRow(rowId: Id, patch: NewRowInput['values'], ctx: MutationContext): Promise<Row>
  deleteRows(rowIds: Id[], ctx: MutationContext): Promise<void>
  restoreRows(rowIds: Id[], ctx: MutationContext): Promise<void>
  addHistory(
    rowId: Id,
    entry: Omit<HistoryEntry, 'id' | 'rowId'>,
    ctx: MutationContext,
  ): Promise<HistoryEntry>
  createSheet(
    memberId: Id,
    input: { name: string; template: TemplateKey },
    ctx: MutationContext,
  ): Promise<Sheet>
  updateSheet(
    sheetId: Id,
    patch: Partial<Pick<Sheet, 'name' | 'stages'>>,
    ctx: MutationContext,
  ): Promise<Sheet>
  deleteSheet(sheetId: Id, ctx: MutationContext): Promise<void>
  addColumn(
    sheetId: Id,
    column: Omit<ColumnDef, 'id' | 'position'>,
    ctx: MutationContext,
  ): Promise<Sheet>
  updateColumn(
    sheetId: Id,
    columnId: Id,
    patch: Partial<ColumnDef>,
    ctx: MutationContext,
  ): Promise<Sheet>
  deleteColumn(sheetId: Id, columnId: Id, ctx: MutationContext): Promise<Sheet>
  reorderColumns(sheetId: Id, columnIds: Id[], ctx: MutationContext): Promise<Sheet>
  createTag(
    input: Pick<Tag, 'name'> & Partial<Pick<Tag, 'colour'>>,
    ctx: MutationContext,
  ): Promise<Tag>
  updateTag(
    tagId: Id,
    patch: Partial<Pick<Tag, 'name' | 'colour'>>,
    ctx: MutationContext,
  ): Promise<Tag>
  deleteTag(tagId: Id, ctx: MutationContext): Promise<void>
  createMember(input: Pick<Member, 'name' | 'email'>, ctx: MutationContext): Promise<Member>
  findDuplicates(values: NewRowInput['values']): Promise<DuplicateCandidate[]>
  markNotDuplicate(rowIdA: Id, rowIdB: Id, ctx: MutationContext): Promise<void>
  importRows(batch: ImportBatch, ctx: MutationContext): Promise<Row[]>
  listTrash(): Promise<TrashItem[]>
}

/** Thrown by Phase 1 methods in Phase 0. Never reachable from the UI. */
export class NotImplementedInPhase0 extends Error {
  constructor(method: string) {
    super(`${method} arrives in Phase 1 and is not available in Phase 0.`)
    this.name = 'NotImplementedInPhase0'
  }
}
