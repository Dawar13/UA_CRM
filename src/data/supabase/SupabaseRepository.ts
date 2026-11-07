/**
 * Repository over Supabase. Changes are worked out by the same domain functions LocalRepository
 * uses, then saved whole through the API functions (supabase/migrations/*_api*.sql), one
 * transaction each, so a row and its history entry land together. Every write is checked with
 * can() first, using the membership of the signed-in user; row-level security refuses it again
 * in the database.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { scoreDuplicate } from '@/domain/dedupe/score'
import { formatPhone, normalisePhone, searchTokens } from '@/domain/identity'
import { cleanMemberEmail, cleanMemberName, MemberRuleError } from '@/domain/members'
import { type Action, type Actor, assertCan } from '@/domain/permissions'
import { copiedRowValues, newRow, patchRow, type RowPatch, RowValidationError } from '@/domain/rows'
import {
  convertColumn as domainConvertColumn,
  editStages as domainEditStages,
  type StageMoves,
} from '@/domain/sheetEdits'
import {
  addColumn as domainAddColumn,
  deleteColumn as domainDeleteColumn,
  reorderColumns as domainReorderColumns,
  restoreColumn as domainRestoreColumn,
  updateColumn as domainUpdateColumn,
  newSheet,
  renameSheet,
  renameStages,
  reorderByIds,
  SheetRuleError,
  slugify,
  uniqueSlug,
  valuesThatNoLongerFit,
} from '@/domain/sheets'
import {
  markLost as domainMarkLost,
  reopen as domainReopen,
  restoreStage as domainRestoreStage,
  moveToStage,
} from '@/domain/stages'
import { cleanTagName, pickTagColour, TagRuleError } from '@/domain/tags'
import type {
  CalendarEvent,
  ColumnDef,
  DomainContext,
  FileRef,
  HistoryEntry,
  Id,
  Member,
  Row,
  RowChange,
  Sheet,
  StageDef,
  StageSnapshot,
  Tag,
  TemplateKey,
  Warmth,
} from '@/domain/types'
import { setWarmth } from '@/domain/warmth'
import { NextActionFollowUps } from '../calendarFollowUps'
import {
  type CalendarConnection,
  type CalendarSyncReason,
  type ColumnPatch,
  type DateRange,
  type DuplicateCandidate,
  type DuplicateQuery,
  type EventLink,
  FileTooLargeError,
  type HistoryPatch,
  type ImportBatch,
  MAX_FILE_BYTES,
  type MemberPatch,
  type MutationContext,
  type MutationResult,
  type NewColumnInput,
  type NewFile,
  type NewHistoryInput,
  type NewRowInput,
  type NextActionEventInput,
  NOT_CONNECTED,
  NotFoundError,
  type Repository,
  type RowLocation,
  type SearchResult,
  type TrashItem,
} from '../repository'
import { calendarApi, toCalendarEvent, toConnection } from './calendar'
import { type RemoteErrorLike, toDomainError } from './errors'
import {
  type HistoryRecord,
  type MemberRecord,
  parseHistory,
  parseHistoryList,
  parseLocation,
  parseLocations,
  parseMember,
  parseRow,
  parseRows,
  parseSearchResults,
  parseSheet,
  parseSheets,
  parseTrash,
  type TagRecord,
  toHistory,
  toMember,
  toTag,
} from './mappers'

const uuid = (): Id => crypto.randomUUID()

/** History kinds written by the app itself; never edited or deleted by hand. */
const AUTOMATIC_KINDS = new Set<HistoryEntry['kind']>(['stage', 'warmth', 'created'])
const AUTOMATIC_MESSAGE = 'Stage, warmth and created entries are written automatically'

/** How long the signed-in membership is trusted before it is read again. */
const ACTOR_TTL_MS = 30_000

const DEFAULT_SEARCH_LIMIT = 50

/** The private Storage bucket for row files (supabase/migrations). */
const FILE_BUCKET = 'row-files'

interface SavedRow {
  row: unknown
  history: unknown
}

export class SupabaseRepository implements Repository {
  readonly client: SupabaseClient
  /** Called after a change other members cannot see arrive by themselves (moves to Trash). */
  onPrivateChange: (() => void) | null = null
  private actorCache: { at: number; actor: Promise<Actor | null> } | null = null
  /** CRM edits to a next action reach its Google event (Phase 2, C5); Realtime brings it back. */
  private readonly followUps = new NextActionFollowUps(async (rowId, followUp) => {
    await calendarApi(
      this.client,
      'next-action-event',
      followUp.op === 'save' ? { rowId, op: 'save', time: followUp.time } : { rowId, op: 'remove' },
    )
  })

  constructor(client: SupabaseClient) {
    this.client = client
  }

  // ---------- Plumbing ----------

  private async rpc<T = unknown>(
    fn: string,
    args: Record<string, unknown>,
    action?: Action,
  ): Promise<T> {
    let result: { data: unknown; error: RemoteErrorLike | null }
    try {
      result = await this.client.rpc(fn, args)
    } catch (error) {
      throw toDomainError(error as Error, action)
    }
    if (result.error) throw toDomainError(result.error, action)
    return result.data as T
  }

  /** Throws the domain error for a failed table query. */
  private check<T>(result: { data: T; error: RemoteErrorLike | null }, action?: Action): T {
    if (result.error) throw toDomainError(result.error, action)
    return result.data
  }

  /** The signed-in user's membership: null for someone not on the team. */
  me(): Promise<Member | null> {
    return this.rpc<unknown>('api_me', {}).then((value) =>
      value === null ? null : parseMember(value),
    )
  }

  private actor(): Promise<Actor | null> {
    const now = Date.now()
    if (!this.actorCache || now - this.actorCache.at > ACTOR_TTL_MS) {
      const actor = this.me().then((m) =>
        m ? { id: m.id, isAdmin: m.isAdmin, active: m.active } : null,
      )
      actor.catch(() => {
        this.actorCache = null
      })
      this.actorCache = { at: now, actor }
    }
    return this.actorCache.actor
  }

  /** Forget the cached membership (after the team changes). */
  forgetActor(): void {
    this.actorCache = null
  }

  private domainContext(ctx: MutationContext, actor: Actor | null): DomainContext {
    return { now: ctx.now, actorId: actor?.id ?? ctx.actorId, newId: uuid }
  }

  private async saveRow(row: Row, history: HistoryEntry | null, action: Action) {
    const saved = await this.rpc<SavedRow>(
      'api_save_row',
      { p_row: row, p_history: history },
      action,
    )
    return {
      row: parseRow(saved.row),
      history: saved.history === null ? null : parseHistory(saved.history),
    }
  }

  private async saveSheet(sheet: Sheet, action: Action = 'manageSheet'): Promise<Sheet> {
    return parseSheet(await this.rpc('api_save_sheet', { p_sheet: sheet }, action))
  }

  private async liveSheet(sheetId: Id): Promise<Sheet> {
    const sheet = await this.getSheet(sheetId)
    if (!sheet) throw new NotFoundError('Sheet', sheetId)
    return sheet
  }

  private async liveRow(rowId: Id): Promise<Row> {
    const row = await this.getRow(rowId)
    if (!row) throw new NotFoundError('Row', rowId)
    return row
  }

  // ---------- Reads ----------

  async listMembers(): Promise<Member[]> {
    const data = this.check(
      await this.client.from('members').select('*').order('position').order('created_at'),
    )
    return (data as MemberRecord[]).map(toMember)
  }

  async listSheets(memberId: Id): Promise<Sheet[]> {
    return parseSheets(await this.rpc('api_list_sheets', { p_member: memberId }))
  }

  async getSheet(sheetId: Id): Promise<Sheet | undefined> {
    const value = await this.rpc('api_get_sheet', { p_id: sheetId })
    return value === null ? undefined : parseSheet(value)
  }

  async listRows(sheetId: Id): Promise<Row[]> {
    return parseRows(await this.rpc('api_list_rows', { p_sheet: sheetId }))
  }

  async getRow(rowId: Id): Promise<Row | undefined> {
    const value = await this.rpc('api_get_row', { p_id: rowId })
    return value === null ? undefined : parseRow(value)
  }

  async getRowLocation(rowId: Id): Promise<RowLocation | undefined> {
    const value = await this.rpc('api_row_location', { p_id: rowId })
    return value === null ? undefined : parseLocation(value)
  }

  async countRows(memberId: Id): Promise<Record<Id, number>> {
    return this.rpc<Record<Id, number>>('api_count_rows', { p_member: memberId })
  }

  async listTags(): Promise<Tag[]> {
    const data = this.check(await this.client.from('tags').select('*'))
    return (data as TagRecord[])
      .map(toTag)
      .sort((a, b) => a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' }))
  }

  async listHistory(rowId: Id): Promise<HistoryEntry[]> {
    return parseHistoryList(await this.rpc('api_list_history', { p_row: rowId }))
  }

  async search(query: string, options?: { limit?: number }): Promise<SearchResult[]> {
    if (searchTokens(query).length === 0) return []
    const results = parseSearchResults(
      await this.rpc('api_search', {
        p_query: query,
        p_limit: options?.limit ?? DEFAULT_SEARCH_LIMIT,
      }),
    )
    return results.map((r) =>
      r.matchedField === 'phone' ? { ...r, matchedText: formatPhone(r.matchedText) } : r,
    )
  }

  /** The member's own Google events (Phase 2); declined and cancelled ones are left out. */
  async listCalendarEvents(memberId: Id, range: DateRange): Promise<CalendarEvent[]> {
    // Policies return the member's own calendar only: another member's is private (empty).
    const result = await this.client
      .from('calendar_events')
      .select('*')
      .eq('member_id', memberId)
      .neq('status', 'cancelled')
      .lt('start_at', new Date(range.to).toISOString())
      .gt('end_at', new Date(range.from).toISOString())
      .order('start_at')
      .limit(1000)
    return (this.check(result, 'view') ?? [])
      .map(toCalendarEvent)
      .filter((e) => e.selfResponse !== 'declined')
  }

  async listMemberRows(memberId: Id): Promise<Row[]> {
    return parseRows(await this.rpc('api_member_rows', { p_member: memberId }))
  }

  async listMemberHistory(memberId: Id, range: DateRange): Promise<HistoryEntry[]> {
    return parseHistoryList(
      await this.rpc('api_member_history', {
        p_member: memberId,
        p_from: range.from,
        p_to: range.to,
      }),
    )
  }

  // ---------- Stage and warmth (row + history together) ----------

  updateStage(rowId: Id, stageIndex: number, ctx: MutationContext): Promise<MutationResult> {
    return this.mutate(rowId, ctx, (row, sheet, dctx) => moveToStage(row, sheet, stageIndex, dctx))
  }

  markLost(rowId: Id, ctx: MutationContext): Promise<MutationResult> {
    return this.mutate(rowId, ctx, (row, sheet, dctx) => domainMarkLost(row, sheet, dctx))
  }

  reopen(rowId: Id, ctx: MutationContext): Promise<MutationResult> {
    return this.mutate(rowId, ctx, (row, sheet, dctx) => domainReopen(row, sheet, dctx))
  }

  restoreStage(rowId: Id, snapshot: StageSnapshot, ctx: MutationContext): Promise<MutationResult> {
    return this.mutate(rowId, ctx, (row, sheet, dctx) =>
      domainRestoreStage(row, sheet, snapshot, dctx),
    )
  }

  updateWarmth(
    rowId: Id,
    warmth: Warmth | null,
    ctx: MutationContext,
    options?: { undo?: boolean },
  ): Promise<MutationResult> {
    return this.mutate(rowId, ctx, (row, _sheet, dctx) => setWarmth(row, warmth, dctx, options))
  }

  private async mutate(
    rowId: Id,
    ctx: MutationContext,
    change: (row: Row, sheet: Sheet, dctx: DomainContext) => RowChange,
  ): Promise<MutationResult> {
    const [actor, location] = await Promise.all([this.actor(), this.getRowLocation(rowId)])
    if (!location) throw new NotFoundError('Row', rowId)
    assertCan(actor, 'editRow', location.row)
    const next = change(location.row, location.sheet, this.domainContext(ctx, actor))
    const saved = await this.saveRow(next.row, next.history, 'editRow')
    return { row: saved.row, history: saved.history ?? next.history }
  }

  // ---------- Sample data (local mode only) ----------

  async ensureSeeded(): Promise<void> {}

  resetSampleData(): Promise<void> {
    return Promise.reject(new Error('Sample data exists only in local mode.'))
  }

  loadPerfSheet(): Promise<Sheet> {
    return Promise.reject(new Error('Sample data exists only in local mode.'))
  }

  // ---------- Rows ----------

  async createRow(input: NewRowInput, ctx: MutationContext): Promise<MutationResult> {
    // One round trip for what the row needs, then the save (the policies refuse a foreign sheet
    // whatever the position read returned).
    const [actor, sheet, position] = await Promise.all([
      this.actor(),
      this.liveSheet(input.sheetId),
      this.nextRowPosition(input.sheetId),
    ])
    assertCan(actor, 'addRow', sheet)
    const change = newRow(
      sheet,
      input.values,
      { id: input.id ?? uuid(), position },
      this.domainContext(ctx, actor),
    )
    const saved = await this.saveRow(change.row, change.history, 'addRow')
    return { row: saved.row, history: saved.history ?? change.history }
  }

  private async nextRowPosition(sheetId: Id): Promise<number> {
    const data = this.check(
      await this.client
        .from('rows')
        .select('position')
        .eq('sheet_id', sheetId)
        .order('position', { ascending: false })
        .limit(1),
    ) as { position: number }[]
    const last = data[0]
    return last ? last.position + 1 : 0
  }

  async updateRow(rowId: Id, patch: RowPatch, ctx: MutationContext): Promise<Row> {
    const [actor, location] = await Promise.all([this.actor(), this.getRowLocation(rowId)])
    if (!location) throw new NotFoundError('Row', rowId)
    assertCan(actor, 'editRow', location.row)
    const next = patchRow(location.row, location.sheet, patch, this.domainContext(ctx, actor))
    const saved = (await this.saveRow(next, null, 'editRow')).row
    if ('nextAction' in patch) void this.followUps.after(location.row, saved)
    return saved
  }

  async copyRow(
    sourceRowId: Id,
    destinationSheetId: Id,
    ctx: MutationContext,
  ): Promise<MutationResult> {
    const [actor, source, destination] = await Promise.all([
      this.actor(),
      this.getRowLocation(sourceRowId),
      this.liveSheet(destinationSheetId),
    ])
    if (!source) throw new NotFoundError('Row', sourceRowId)
    assertCan(actor, 'copyToMySheet', { source: source.row, destination })
    return this.createRow(
      {
        sheetId: destination.id,
        values: copiedRowValues(source.row, source.sheet, destination),
      },
      ctx,
    )
  }

  async listSamePersonOf(rowId: Id): Promise<Id[]> {
    return this.rpc<Id[]>('api_same_person_of', { p_row: rowId })
  }

  async deleteRows(rowIds: Id[], ctx: MutationContext): Promise<void> {
    await this.setRowsDeleted(rowIds, ctx.now.toISOString())
  }

  async restoreRows(rowIds: Id[], _ctx: MutationContext): Promise<void> {
    await this.setRowsDeleted(rowIds, null)
  }

  /** Trash or restore rows, all or none. */
  private async setRowsDeleted(rowIds: Id[], deletedAt: string | null): Promise<void> {
    const ids = [...new Set(rowIds)]
    if (ids.length === 0) return
    const [actor, found] = await Promise.all([
      this.actor(),
      this.client.from('rows').select('id, owner_id, deleted_at').in('id', ids),
    ])
    const rows = this.check(found, 'deleteRow') as {
      id: string
      owner_id: string
      deleted_at: string | null
    }[]
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const id of ids) {
      const row = byId.get(id)
      // Another member's Trash is invisible: restoring from it is left to the database, which
      // refuses it as not yours.
      if (!row && deletedAt === null) continue
      // Deleting needs a live row; restoring needs one in Trash.
      if (!row || (deletedAt === null) === (row.deleted_at === null)) {
        throw new NotFoundError(deletedAt === null ? 'Row in Trash' : 'Row', id)
      }
      assertCan(actor, 'deleteRow', { memberId: row.owner_id })
    }
    await this.rpc('api_set_rows_deleted', { p_ids: ids, p_deleted_at: deletedAt }, 'deleteRow')
    this.onPrivateChange?.()
  }

  // ---------- Files (Storage bucket row-files: <owner>/<row>/<file id>) ----------

  async attachFile(rowId: Id, file: NewFile, _ctx: MutationContext): Promise<FileRef> {
    if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.name)
    const [actor, row] = await Promise.all([this.actor(), this.liveRow(rowId)])
    assertCan(actor, 'manageFiles', row)
    const id = uuid()
    const path = `${row.memberId}/${row.id}/${id}`
    const uploaded = await this.client.storage
      .from(FILE_BUCKET)
      .upload(path, file.data, { contentType: file.type || 'application/octet-stream' })
    if (uploaded.error) throw toDomainError(uploaded.error, 'manageFiles')
    const inserted = await this.client.from('files').insert({
      id,
      row_id: row.id,
      name: file.name,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
      storage_path: path,
    })
    if (inserted.error) {
      await this.client.storage.from(FILE_BUCKET).remove([path])
      throw toDomainError(inserted.error, 'manageFiles')
    }
    return {
      id,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      url: path,
    }
  }

  async removeFile(rowId: Id, fileId: Id, _ctx: MutationContext): Promise<void> {
    const [actor, row] = await Promise.all([this.actor(), this.liveRow(rowId)])
    assertCan(actor, 'manageFiles', row)
    const file = row.files.find((f) => f.id === fileId)
    if (!file) throw new NotFoundError('File', fileId)
    this.check(await this.client.from('files').delete().eq('id', fileId), 'manageFiles')
    const removed = await this.client.storage.from(FILE_BUCKET).remove([file.url])
    if (removed.error) throw toDomainError(removed.error, 'manageFiles')
  }

  async fileUrl(file: FileRef): Promise<string> {
    const { data, error } = await this.client.storage
      .from(FILE_BUCKET)
      .createSignedUrl(file.url, 60 * 10, { download: file.name })
    if (error || !data) throw toDomainError(error ?? new Error('No link'), 'view')
    return data.signedUrl
  }

  // ---------- History ----------

  async addHistory(rowId: Id, entry: NewHistoryInput, ctx: MutationContext): Promise<HistoryEntry> {
    const [actor, row] = await Promise.all([this.actor(), this.liveRow(rowId)])
    assertCan(actor, 'addHistory', row)
    const history: HistoryEntry = {
      id: uuid(),
      rowId,
      kind: entry.kind,
      source: entry.source ?? 'manual',
      at: new Date(entry.at).toISOString(),
      fuzzyDate: entry.fuzzyDate ?? null,
      text: entry.text.trim(),
      memberId: actor?.id ?? ctx.actorId,
    }
    const [saved] = parseHistoryList(
      await this.rpc('api_add_history', { p_row: rowId, p_entries: [history] }, 'addHistory'),
    )
    if (!saved) throw new NotFoundError('History entry', history.id)
    return saved
  }

  async updateHistory(
    historyId: Id,
    patch: HistoryPatch,
    _ctx: MutationContext,
  ): Promise<HistoryEntry> {
    const entry = await this.editableHistory(historyId)
    const next: HistoryEntry = {
      ...entry,
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.at !== undefined ? { at: new Date(patch.at).toISOString() } : {}),
      ...(patch.fuzzyDate !== undefined ? { fuzzyDate: patch.fuzzyDate } : {}),
      ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
    }
    if (AUTOMATIC_KINDS.has(next.kind)) {
      throw new RowValidationError([{ key: 'kind', message: AUTOMATIC_MESSAGE }])
    }
    const data = this.check(
      await this.client
        .from('history')
        .update({
          kind: next.kind,
          at: next.at,
          fuzzy_date: next.fuzzyDate?.date ?? null,
          fuzzy_precision: next.fuzzyDate?.precision ?? null,
          text: next.text,
        })
        .eq('id', historyId)
        .select('*')
        .single(),
      'editHistory',
    )
    return toHistory(data as HistoryRecord)
  }

  async deleteHistory(historyId: Id, _ctx: MutationContext): Promise<void> {
    await this.editableHistory(historyId)
    this.check(await this.client.from('history').delete().eq('id', historyId), 'editHistory')
  }

  /** A hand-logged entry on a live row the actor owns. Automatic entries are kept as they are. */
  private async editableHistory(historyId: Id): Promise<HistoryEntry> {
    const [actor, found] = await Promise.all([
      this.actor(),
      this.client.from('history').select('*').eq('id', historyId).maybeSingle(),
    ])
    const record = this.check(found, 'editHistory') as HistoryRecord | null
    if (!record) throw new NotFoundError('History entry', historyId)
    const entry = toHistory(record)
    const row = await this.liveRow(entry.rowId)
    assertCan(actor, 'editHistory', row)
    if (entry.source === 'system' || AUTOMATIC_KINDS.has(entry.kind)) {
      throw new RowValidationError([{ key: 'kind', message: AUTOMATIC_MESSAGE }])
    }
    return entry
  }

  // ---------- Sheets ----------

  async createSheet(
    memberId: Id,
    input: { name: string; template: TemplateKey },
    ctx: MutationContext,
  ): Promise<Sheet> {
    const actor = await this.actor()
    assertCan(actor, 'manageSheet', { memberId })
    const existing = await this.listSheets(memberId)
    const sheet = newSheet(memberId, input, existing, { sheetId: uuid(), newId: uuid }, ctx.now)
    return this.saveSheet(sheet)
  }

  async updateSheet(
    sheetId: Id,
    patch: Partial<Pick<Sheet, 'name' | 'stages'>>,
    ctx: MutationContext,
  ): Promise<Sheet> {
    const [actor, current] = await Promise.all([this.actor(), this.liveSheet(sheetId)])
    assertCan(actor, 'manageSheet', current)
    let sheet = current
    if (patch.name !== undefined) {
      sheet = renameSheet(sheet, patch.name, await this.listSheets(sheet.memberId), ctx.now)
    }
    if (patch.stages !== undefined) sheet = renameStages(sheet, patch.stages, ctx.now)
    return this.saveSheet(sheet)
  }

  /** Every row of a sheet, Trash included (the owner's sheet-wide changes). */
  private async allRowsOf(sheetId: Id): Promise<Row[]> {
    return parseRows(await this.rpc('api_sheet_rows_all', { p_sheet: sheetId }))
  }

  /** Saves a sheet and some of its rows in one transaction. */
  private async saveSheetWithRows(sheet: Sheet, rows: readonly Row[], action: Action) {
    return parseSheet(
      await this.rpc(
        'api_save_sheet',
        { p_sheet: sheet, p_rows: rows.length > 0 ? rows.map((row) => ({ row })) : null },
        action,
      ),
    )
  }

  async editStages(
    sheetId: Id,
    stages: readonly StageDef[],
    moves: StageMoves,
    ctx: MutationContext,
  ): Promise<Sheet> {
    const [actor, current] = await Promise.all([this.actor(), this.liveSheet(sheetId)])
    assertCan(actor, 'manageStages', current)
    const result = domainEditStages(current, stages, moves, await this.allRowsOf(sheetId), {
      now: ctx.now,
      newId: uuid,
    })
    return this.saveSheetWithRows(result.sheet, result.rows, 'manageStages')
  }

  async convertColumn(
    sheetId: Id,
    columnId: Id,
    type: ColumnDef['type'],
    ctx: MutationContext,
  ): Promise<Sheet> {
    const [actor, current, tags] = await Promise.all([
      this.actor(),
      this.liveSheet(sheetId),
      this.listTags(),
    ])
    assertCan(actor, 'manageColumns', current)
    const result = domainConvertColumn(current, columnId, type, await this.allRowsOf(sheetId), {
      now: ctx.now,
      tagMap: new Map(tags.map((t) => [t.id, t])),
    })
    return this.saveSheetWithRows(result.sheet, result.rows, 'manageColumns')
  }

  async reorderSheets(memberId: Id, sheetIds: Id[], ctx: MutationContext): Promise<Sheet[]> {
    const actor = await this.actor()
    assertCan(actor, 'manageSheet', { memberId })
    const at = ctx.now.toISOString()
    const sheets = reorderByIds(await this.listSheets(memberId), sheetIds).map((s) => ({
      ...s,
      updatedAt: at,
    }))
    const results = await Promise.all(
      sheets.map((s) => this.client.from('sheets').update({ position: s.position }).eq('id', s.id)),
    )
    for (const result of results) this.check(result, 'manageSheet')
    return sheets
  }

  async deleteSheet(sheetId: Id, ctx: MutationContext): Promise<void> {
    const [actor, sheet] = await Promise.all([this.actor(), this.liveSheet(sheetId)])
    assertCan(actor, 'manageSheet', sheet)
    const at = ctx.now.toISOString()
    await this.saveSheet({ ...sheet, deletedAt: at, updatedAt: at })
    this.onPrivateChange?.()
  }

  async restoreSheet(sheetId: Id, ctx: MutationContext): Promise<Sheet> {
    const [actor, value] = await Promise.all([
      this.actor(),
      this.rpc('api_get_sheet', { p_id: sheetId, p_include_deleted: true }),
    ])
    const sheet = value === null ? undefined : parseSheet(value)
    if (!sheet || sheet.deletedAt === null) throw new NotFoundError('Sheet in Trash', sheetId)
    assertCan(actor, 'manageSheet', sheet)
    const live = await this.listSheets(sheet.memberId)
    const restored = await this.saveSheet({
      ...sheet,
      // Another sheet may have taken the name meanwhile.
      slug: uniqueSlug(
        sheet.slug,
        live.map((s) => s.slug),
      ),
      position: live.reduce((max, s) => Math.max(max, s.position + 1), 0),
      deletedAt: null,
      updatedAt: ctx.now.toISOString(),
    })
    this.onPrivateChange?.()
    return restored
  }

  // ---------- Columns ----------

  private async changeColumns(
    sheetId: Id,
    change: (sheet: Sheet) => Sheet | Promise<Sheet>,
  ): Promise<Sheet> {
    const [actor, sheet] = await Promise.all([this.actor(), this.liveSheet(sheetId)])
    assertCan(actor, 'manageColumns', sheet)
    return this.saveSheet(await change(sheet), 'manageColumns')
  }

  addColumn(sheetId: Id, column: NewColumnInput, ctx: MutationContext): Promise<Sheet> {
    return this.changeColumns(sheetId, (sheet) => domainAddColumn(sheet, column, uuid(), ctx.now))
  }

  updateColumn(
    sheetId: Id,
    columnId: Id,
    patch: ColumnPatch,
    ctx: MutationContext,
  ): Promise<Sheet> {
    return this.changeColumns(sheetId, async (sheet) => {
      const next = domainUpdateColumn(sheet, columnId, patch, ctx.now)
      if (patch.type !== undefined || patch.options !== undefined) {
        const misfits = valuesThatNoLongerFit(next, columnId, await this.listRows(sheetId))
        if (misfits > 0) {
          throw new SheetRuleError(
            misfits === 1
              ? '1 row has a value that would not fit'
              : `${misfits} rows have values that would not fit`,
          )
        }
      }
      return next
    })
  }

  deleteColumn(sheetId: Id, columnId: Id, ctx: MutationContext): Promise<Sheet> {
    return this.changeColumns(sheetId, (sheet) => domainDeleteColumn(sheet, columnId, ctx.now))
  }

  restoreColumn(sheetId: Id, columnId: Id, ctx: MutationContext): Promise<Sheet> {
    return this.changeColumns(sheetId, (sheet) => domainRestoreColumn(sheet, columnId, ctx.now))
  }

  reorderColumns(sheetId: Id, columnIds: Id[], ctx: MutationContext): Promise<Sheet> {
    return this.changeColumns(sheetId, (sheet) => domainReorderColumns(sheet, columnIds, ctx.now))
  }

  // ---------- Tags ----------

  async createTag(
    input: Pick<Tag, 'name'> & Partial<Pick<Tag, 'colour'>>,
    _ctx: MutationContext,
  ): Promise<Tag> {
    const actor = await this.actor()
    assertCan(actor, 'createTag')
    const name = cleanTagName(input.name)
    const tags = await this.listTags()
    const same = tags.find((t) => sameTagName(t.name, name))
    if (same) return same
    const inserted = await this.client
      .from('tags')
      .insert({ id: uuid(), name, colour: input.colour ?? pickTagColour(tags) })
      .select('*')
      .single()
    if (inserted.error?.code === '23505') {
      // Someone else created it a moment ago.
      const again = (await this.listTags()).find((t) => sameTagName(t.name, name))
      if (again) return again
    }
    return toTag(this.check(inserted, 'createTag') as TagRecord)
  }

  async updateTag(
    tagId: Id,
    patch: Partial<Pick<Tag, 'name' | 'colour'>>,
    _ctx: MutationContext,
  ): Promise<Tag> {
    await this.tagWithUsage(tagId, 'editTag')
    const update: Record<string, string> = {}
    if (patch.name !== undefined) {
      const name = cleanTagName(patch.name)
      const clash = (await this.listTags()).find((t) => t.id !== tagId && sameTagName(t.name, name))
      if (clash) throw new TagRuleError(`There is already a tag called ${clash.name}`)
      update.name = name
    }
    if (patch.colour !== undefined) update.colour = patch.colour
    const data = this.check(
      await this.client.from('tags').update(update).eq('id', tagId).select('*').single(),
      'editTag',
    )
    return toTag(data as TagRecord)
  }

  async deleteTag(tagId: Id, _ctx: MutationContext): Promise<void> {
    await this.tagWithUsage(tagId, 'deleteTag')
    // Row tags go with it (on delete cascade).
    this.check(await this.client.from('tags').delete().eq('id', tagId), 'deleteTag')
  }

  /** The tag, after checking the actor created it and nobody else's rows use it. */
  private async tagWithUsage(tagId: Id, action: 'editTag' | 'deleteTag'): Promise<Tag> {
    const [actor, found, usedBy] = await Promise.all([
      this.actor(),
      this.client.from('tags').select('*').eq('id', tagId).maybeSingle(),
      this.rpc<{ memberId: string; name: string }[]>('api_tag_usage', { p_tag: tagId }),
    ])
    const record = this.check(found, action) as TagRecord | null
    if (!record) throw new NotFoundError('Tag', tagId)
    const tag = toTag(record)
    assertCan(actor, action, { createdBy: tag.createdBy, usedBy })
    return tag
  }

  // ---------- Members ----------

  async createMember(
    input: Pick<Member, 'name' | 'email'>,
    _ctx: MutationContext,
  ): Promise<Member> {
    const actor = await this.actor()
    assertCan(actor, 'addMember')
    const name = cleanMemberName(input.name)
    const email = cleanMemberEmail(input.email)
    const members = await this.listMembers()
    if (members.some((m) => m.email.toLowerCase() === email)) {
      throw new MemberRuleError('That email address is already on the team')
    }
    const inserted = await this.client
      .from('members')
      .insert({
        name,
        email,
        slug: uniqueSlug(
          slugify(name),
          members.map((m) => m.slug),
        ),
        position: members.reduce((max, m) => Math.max(max, m.position + 1), 0),
        is_admin: false,
        active: true,
      })
      .select('*')
      .single()
    if (inserted.error?.code === '23505') {
      throw new MemberRuleError('That email address is already on the team')
    }
    return toMember(this.check(inserted, 'addMember') as MemberRecord)
  }

  async updateMember(memberId: Id, patch: MemberPatch, _ctx: MutationContext): Promise<Member> {
    const [actor, found] = await Promise.all([
      this.actor(),
      this.client.from('members').select('*').eq('id', memberId).maybeSingle(),
    ])
    const record = this.check(found) as MemberRecord | null
    if (!record) throw new NotFoundError('Member', memberId)
    const member = toMember(record)
    const update: Record<string, unknown> = {}
    let action: Action = 'renameMember'
    if (patch.name !== undefined) {
      assertCan(actor, 'renameMember', { memberId })
      update.name = cleanMemberName(patch.name)
    }
    if (patch.active !== undefined && patch.active !== member.active) {
      action = 'setMemberActive'
      assertCan(actor, 'setMemberActive', { memberId })
      update.active = patch.active
    }
    if (patch.isAdmin !== undefined && patch.isAdmin !== member.isAdmin) {
      action = 'setMemberAdmin'
      assertCan(actor, 'setMemberAdmin', { memberId })
      update.is_admin = patch.isAdmin
    }
    if (Object.keys(update).length === 0) return member
    const data = this.check(
      await this.client.from('members').update(update).eq('id', memberId).select('*').single(),
      action,
    )
    this.forgetActor()
    return toMember(data as MemberRecord)
  }

  // ---------- Trash ----------

  async listTrash(ctx: MutationContext): Promise<TrashItem[]> {
    const actor = await this.actor()
    assertCan(actor, 'viewTrash', { memberId: actor?.id ?? ctx.actorId })
    return parseTrash(await this.rpc('api_list_trash', { p_now: ctx.now.toISOString() }))
  }

  // ---------- Later in Phase 1 ----------

  async findDuplicates(
    query: DuplicateQuery,
    options: { selfId?: Id } = {},
  ): Promise<DuplicateCandidate[]> {
    const phone = query.phone ? (normalisePhone(query.phone) ?? '') : ''
    const value = await this.rpc('api_dedupe_candidates', {
      p_name: query.name,
      p_phone: phone || null,
      p_email: query.email ?? null,
      p_linkedin: query.linkedin ?? null,
      p_company: query.company ?? null,
      p_self: options.selfId ?? null,
    })
    const candidates = parseLocations(value)
    const found: DuplicateCandidate[] = []
    for (const location of candidates) {
      if (location.row.id === options.selfId) continue
      const match = scoreDuplicate(query, location.row)
      if (match) found.push({ location, level: match.level, reason: match.reason })
    }
    return found.sort((a, b) => (a.level === b.level ? 0 : a.level === 'hard' ? -1 : 1))
  }

  async markNotDuplicate(rowIdA: Id, rowIdB: Id, _ctx: MutationContext): Promise<void> {
    const [actor, a, b] = await Promise.all([
      this.actor(),
      this.client.from('rows').select('id, owner_id').eq('id', rowIdA).maybeSingle(),
      this.client.from('rows').select('id, owner_id').eq('id', rowIdB).maybeSingle(),
    ])
    const rowA = this.check(a) as { id: string; owner_id: string } | null
    const rowB = this.check(b) as { id: string; owner_id: string } | null
    if (!rowA) throw new NotFoundError('Row', rowIdA)
    if (!rowB) throw new NotFoundError('Row', rowIdB)
    assertCan(actor, 'markNotDuplicate', {
      rows: [{ memberId: rowA.owner_id }, { memberId: rowB.owner_id }],
    })
    const [first, second] = rowIdA < rowIdB ? [rowIdA, rowIdB] : [rowIdB, rowIdA]
    const inserted = await this.client
      .from('not_duplicate_pairs')
      .insert({ row_a: first, row_b: second })
    if (inserted.error && inserted.error.code !== '23505') {
      throw toDomainError(inserted.error, 'markNotDuplicate')
    }
  }
  async importRows(batch: ImportBatch, ctx: MutationContext): Promise<Row[]> {
    const [actor, sheet] = await Promise.all([this.actor(), this.liveSheet(batch.sheetId)])
    assertCan(actor, 'addRow', sheet)
    let position = await this.nextRowPosition(sheet.id)
    const dctx = this.domainContext(ctx, actor)
    const items = batch.rows.map((values, i) => {
      const change = newRow(sheet, values, { id: uuid(), position: position++ }, dctx)
      const extra = (batch.history?.[i] ?? []).map((entry) => ({
        id: uuid(),
        kind: entry.kind,
        source: entry.source ?? 'manual',
        at: new Date(entry.at).toISOString(),
        fuzzyDate: entry.fuzzyDate ?? null,
        text: entry.text.trim(),
      }))
      return { row: change.row, history: change.history, extra }
    })
    const saved: Row[] = []
    // Batches keep each request small.
    for (let i = 0; i < items.length; i += 100) {
      saved.push(
        ...parseRows(
          await this.rpc('api_import_rows', { p_items: items.slice(i, i + 100) }, 'addRow'),
        ),
      )
    }
    return saved
  }

  // ---------- Phase 2: Google Calendar (the actor's own) ----------

  async getCalendarConnection(ctx: MutationContext): Promise<CalendarConnection> {
    const result = await this.client
      .from('calendar_connections')
      .select('status, google_email, connected_at, last_synced_at, last_error_code')
      .eq('member_id', ctx.actorId)
      .maybeSingle()
    // Before the calendar migration is applied the table is missing: nothing is connected.
    if (result.error && ['PGRST205', '42P01'].includes(result.error.code ?? '')) {
      return NOT_CONNECTED
    }
    return toConnection(this.check(result, 'view'))
  }

  async connectCalendar(returnPath: string, _ctx: MutationContext): Promise<string> {
    const { url } = await calendarApi(this.client, 'connect', { returnPath })
    return String(url)
  }

  async syncCalendar(
    reason: CalendarSyncReason,
    ctx: MutationContext,
  ): Promise<CalendarConnection> {
    await calendarApi(this.client, 'sync', { reason })
    return this.getCalendarConnection(ctx)
  }

  async disconnectCalendar(_ctx: MutationContext): Promise<void> {
    await calendarApi(this.client, 'disconnect')
  }

  async saveNextActionEvent(
    rowId: Id,
    input: NextActionEventInput,
    ctx: MutationContext,
  ): Promise<void> {
    await this.ownRow(rowId, ctx)
    this.followUps.forget(rowId)
    await calendarApi(this.client, 'next-action-event', {
      rowId,
      op: 'save',
      ...(input.date ? { date: input.date } : {}),
      time: input.time,
      invite: input.invite,
    })
  }

  async removeNextActionEvent(rowId: Id, ctx: MutationContext): Promise<void> {
    await this.ownRow(rowId, ctx)
    this.followUps.forget(rowId)
    await calendarApi(this.client, 'next-action-event', { rowId, op: 'remove' })
  }

  async listEventLinks(ctx: MutationContext): Promise<EventLink[]> {
    const result = await this.client
      .from('calendar_event_links')
      .select('google_event_id, recurring_event_id, row_id, kind')
      .eq('member_id', ctx.actorId)
    return (this.check(result, 'view') ?? []).map((l) => ({
      googleEventId: (l.google_event_id as string | null) ?? null,
      recurringEventId: (l.recurring_event_id as string | null) ?? null,
      rowId: String(l.row_id),
      kind: l.kind as EventLink['kind'],
    }))
  }

  async linkEvent(link: EventLink, ctx: MutationContext): Promise<void> {
    await this.ownRow(link.rowId, ctx)
    const target = link.googleEventId
      ? { column: 'google_event_id', value: link.googleEventId }
      : { column: 'recurring_event_id', value: link.recurringEventId ?? '' }
    // One answer per event (or series) and row: a new answer replaces the old one.
    this.check(
      await this.client
        .from('calendar_event_links')
        .delete()
        .eq('member_id', ctx.actorId)
        .eq('row_id', link.rowId)
        .eq(target.column, target.value),
      'editRow',
    )
    this.check(
      await this.client.from('calendar_event_links').insert({
        member_id: ctx.actorId,
        google_event_id: link.googleEventId,
        recurring_event_id: link.googleEventId ? null : link.recurringEventId,
        row_id: link.rowId,
        kind: link.kind,
      }),
      'editRow',
    )
  }

  /** The actor's own live row, or a refusal (another member's row is never changed). */
  private async ownRow(rowId: Id, _ctx: MutationContext): Promise<Row> {
    const [actor, location] = await Promise.all([this.actor(), this.getRowLocation(rowId)])
    if (!location) throw new NotFoundError('Row', rowId)
    assertCan(actor, 'editRow', location.row)
    return location.row
  }
}

/** Tag names are unique ignoring case, as in the database (lower(name)). */
function sameTagName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
