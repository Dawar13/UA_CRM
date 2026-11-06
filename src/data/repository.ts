/**
 * The Repository is the only door to data. Components never import Dexie or Supabase; they
 * call hooks in `data/hooks/`, and the hooks call a Repository.
 *
 * `LocalRepository` (Dexie on IndexedDB) serves local development and tests; `SupabaseRepository`
 * serves staging and production. Both refuse writes outside the actor's own tab with the same
 * `can()` the UI uses (Supabase through row-level security as well), and one contract suite runs
 * against both.
 *
 * Stage, warmth and history changes are one operation: each mutation writes the row and appends
 * its history entry atomically, and updates `row.lastTouchAt`.
 */
import type { NewRowValues, RowPatch } from '@/domain/rows'
import type { StageMoves } from '@/domain/sheetEdits'
import type {
  CalendarEvent,
  ColumnDef,
  FileRef,
  HistoryEntry,
  HistoryKind,
  HistorySource,
  Id,
  IsoDateTime,
  Member,
  Row,
  Sheet,
  StageDef,
  StageSnapshot,
  Tag,
  TemplateKey,
  Warmth,
} from '@/domain/types'

/** Who is acting and when: the signed-in member. Writes to another member's tab are refused. */
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

/** A new row in a sheet. */
export interface NewRowInput {
  sheetId: Id
  values: NewRowValues
  /** Chosen by the caller so an optimistic row and the saved one share it. A UUID. */
  id?: Id
}

/** A touch logged by hand (or, from Phase 2, by the calendar). The actor is the member. */
export interface NewHistoryInput {
  kind: Exclude<HistoryKind, 'stage' | 'warmth' | 'created'>
  /** UTC instant it happened. */
  at: IsoDateTime
  fuzzyDate?: HistoryEntry['fuzzyDate']
  text: string
  source?: Exclude<HistorySource, 'system'>
}
export type HistoryPatch = Partial<Pick<HistoryEntry, 'kind' | 'at' | 'fuzzyDate' | 'text'>>

export interface NewColumnInput {
  label: string
  type: ColumnDef['type']
  options?: readonly string[]
  width?: number
}
export type ColumnPatch = Partial<
  Pick<ColumnDef, 'label' | 'type' | 'options' | 'width' | 'hidden'>
>

export interface MemberPatch {
  name?: string
  active?: boolean
  isAdmin?: boolean
}

/** A row anywhere that a new or edited contact may duplicate, with where it lives. */
export interface DuplicateCandidate {
  location: RowLocation
  level: 'hard' | 'soft'
  reason: 'phone' | 'email' | 'linkedin' | 'name' | 'first-name-company'
}

/** What the duplicate check compares. */
export interface DuplicateQuery {
  name: string
  phone?: string
  email?: string
  linkedin?: string
  company?: string
}
export interface ImportBatch {
  sheetId: Id
  rows: NewRowValues[]
  history?: NewHistoryInput[][]
}

/** A file to attach to a row (10 MB at most). */
export interface NewFile {
  name: string
  type: string
  size: number
  data: Blob
}

/** Files above this size are refused (the Storage bucket allows no more). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024

/** A file that is too large to attach. */
export class FileTooLargeError extends Error {
  constructor(name: string) {
    super(`${name} is larger than 10 MB`)
    this.name = 'FileTooLargeError'
  }
}

/** Something in the actor's Trash. Items older than 30 days are purged and not listed. */
export interface TrashItem {
  kind: 'row' | 'sheet' | 'column'
  id: Id
  /** The sheet a row or column belongs to (the sheet itself for a sheet). */
  sheetId: Id
  label: string
  deletedAt: IsoDateTime
}

/** How long deleted rows, columns and sheets stay in Trash. */
export const TRASH_DAYS = 30

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
  /** Live rows across every sheet one member owns, for the activity field. */
  listMemberRows(memberId: Id): Promise<Row[]>
  /** History of every row one member owns with `at` in the range, oldest first. */
  listMemberHistory(memberId: Id, range: DateRange): Promise<HistoryEntry[]>

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

  // ---------- Phase 1: every write checks ownership (PermissionDenied) ----------
  /** Adds a row with its "Added to <sheet>" history entry, at the end of the sheet. */
  createRow(input: NewRowInput, ctx: MutationContext): Promise<MutationResult>
  /** A cell edit. Stage and warmth have their own operations. */
  updateRow(rowId: Id, patch: RowPatch, ctx: MutationContext): Promise<Row>
  /**
   * "Copy to my sheet": a new row in the actor's sheet with the contact's details, linked to the
   * original as the same person. Nothing changes on the original. Copying your own row is
   * refused ('already-yours').
   */
  copyRow(sourceRowId: Id, destinationSheetId: Id, ctx: MutationContext): Promise<MutationResult>
  /** Live rows elsewhere that name this row as the same person (the other side of the link). */
  listSamePersonOf(rowId: Id): Promise<Id[]>
  /** Moves rows to their owner's Trash. */
  deleteRows(rowIds: Id[], ctx: MutationContext): Promise<void>
  restoreRows(rowIds: Id[], ctx: MutationContext): Promise<void>

  /** Attaches a file to a row (the owner only). Others can view and download it. */
  attachFile(rowId: Id, file: NewFile, ctx: MutationContext): Promise<FileRef>
  removeFile(rowId: Id, fileId: Id, ctx: MutationContext): Promise<void>
  /** A link to open or download the file (short-lived for Storage). */
  fileUrl(file: FileRef): Promise<string>

  /** Logs a touch on a row; last touch follows. */
  addHistory(rowId: Id, entry: NewHistoryInput, ctx: MutationContext): Promise<HistoryEntry>
  updateHistory(historyId: Id, patch: HistoryPatch, ctx: MutationContext): Promise<HistoryEntry>
  deleteHistory(historyId: Id, ctx: MutationContext): Promise<void>

  createSheet(
    memberId: Id,
    input: { name: string; template: TemplateKey },
    ctx: MutationContext,
  ): Promise<Sheet>
  /** Renames the sheet, or renames its stages (adding and removing stages comes with M1.4). */
  updateSheet(
    sheetId: Id,
    patch: Partial<Pick<Sheet, 'name' | 'stages'>>,
    ctx: MutationContext,
  ): Promise<Sheet>
  /**
   * Replaces the sheet's stages (add, rename, reorder, remove; the last is the win). Rows keep
   * their stage by id; rows at a removed stage go where `moves` says (or to no stage).
   */
  editStages(
    sheetId: Id,
    stages: readonly StageDef[],
    moves: StageMoves,
    ctx: MutationContext,
  ): Promise<Sheet>
  /** Changes a custom column's type, converting values; those that do not convert are cleared. */
  convertColumn(
    sheetId: Id,
    columnId: Id,
    type: ColumnDef['type'],
    ctx: MutationContext,
  ): Promise<Sheet>
  /** The member's live sheets, in the order given. */
  reorderSheets(memberId: Id, sheetIds: Id[], ctx: MutationContext): Promise<Sheet[]>
  deleteSheet(sheetId: Id, ctx: MutationContext): Promise<void>
  restoreSheet(sheetId: Id, ctx: MutationContext): Promise<Sheet>

  addColumn(sheetId: Id, column: NewColumnInput, ctx: MutationContext): Promise<Sheet>
  updateColumn(sheetId: Id, columnId: Id, patch: ColumnPatch, ctx: MutationContext): Promise<Sheet>
  deleteColumn(sheetId: Id, columnId: Id, ctx: MutationContext): Promise<Sheet>
  restoreColumn(sheetId: Id, columnId: Id, ctx: MutationContext): Promise<Sheet>
  reorderColumns(sheetId: Id, columnIds: Id[], ctx: MutationContext): Promise<Sheet>

  /** Creates a tag, or returns the existing one with the same name (any case). */
  createTag(
    input: Pick<Tag, 'name'> & Partial<Pick<Tag, 'colour'>>,
    ctx: MutationContext,
  ): Promise<Tag>
  updateTag(
    tagId: Id,
    patch: Partial<Pick<Tag, 'name' | 'colour'>>,
    ctx: MutationContext,
  ): Promise<Tag>
  /** Deletes a tag and takes it off the creator's rows. */
  deleteTag(tagId: Id, ctx: MutationContext): Promise<void>

  /** Admins only. The new member is active and not an admin. */
  createMember(input: Pick<Member, 'name' | 'email'>, ctx: MutationContext): Promise<Member>
  updateMember(memberId: Id, patch: MemberPatch, ctx: MutationContext): Promise<Member>

  /** The actor's own Trash, newest first. Nobody sees another member's Trash. */
  listTrash(ctx: MutationContext): Promise<TrashItem[]>

  // ---------- Later in Phase 1 (both repositories gain them together, with contract tests) ----------
  /**
   * Rows in every tab that `query` may duplicate (CLAUDE.md §2.7), hard matches first. With
   * `selfId` (a saved row), the row itself and pairs marked "different person" are left out.
   */
  findDuplicates(query: DuplicateQuery, options?: { selfId?: Id }): Promise<DuplicateCandidate[]>
  /** "Different person": the pair is never flagged again. Needs one of the two rows. */
  markNotDuplicate(rowIdA: Id, rowIdB: Id, ctx: MutationContext): Promise<void>
  /**
   * Adds many rows to one of your sheets, each with its "Added to" entry and any imported
   * touches (`batch.history[i]` for `batch.rows[i]`). All or none.
   */
  importRows(batch: ImportBatch, ctx: MutationContext): Promise<Row[]>
}

/** Thrown by a method whose milestone has not landed yet. Never reachable from the UI. */
export class NotAvailableYet extends Error {
  constructor(method: string, milestone: string) {
    super(`${method} arrives in ${milestone}.`)
    this.name = 'NotAvailableYet'
  }
}

/** A write refused because its target does not exist or is in Trash. */
export class NotFoundError extends Error {
  constructor(what: string, id: Id) {
    super(`${what} ${id} does not exist or is in Trash.`)
    this.name = 'NotFoundError'
  }
}
