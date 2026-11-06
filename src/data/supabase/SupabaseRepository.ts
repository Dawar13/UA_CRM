/**
 * Repository over Supabase. Changes are worked out by the same domain functions LocalRepository
 * uses, then saved whole through the API functions (supabase/migrations/*_api*.sql), one
 * transaction each, so a row and its history entry land together. Every write is checked with
 * can() first, using the membership of the signed-in user; row-level security refuses it again
 * in the database.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { formatPhone, searchTokens } from '@/domain/identity'
import { cleanMemberEmail, cleanMemberName, MemberRuleError } from '@/domain/members'
import { type Action, type Actor, assertCan } from '@/domain/permissions'
import {
  copiedRowValues,
  type NewRowValues,
  newRow,
  patchRow,
  type RowPatch,
  RowValidationError,
} from '@/domain/rows'
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
  DomainContext,
  HistoryEntry,
  Id,
  Member,
  Row,
  RowChange,
  Sheet,
  StageSnapshot,
  Tag,
  TemplateKey,
  Warmth,
} from '@/domain/types'
import { setWarmth } from '@/domain/warmth'
import {
  type ColumnPatch,
  type DateRange,
  type DuplicateCandidate,
  type HistoryPatch,
  type ImportBatch,
  type MemberPatch,
  type MutationContext,
  type MutationResult,
  type NewColumnInput,
  type NewHistoryInput,
  type NewRowInput,
  NotAvailableYet,
  NotFoundError,
  type Repository,
  type RowLocation,
  type SearchResult,
  type TrashItem,
} from '../repository'
import { type RemoteErrorLike, toDomainError } from './errors'
import {
  type HistoryRecord,
  type MemberRecord,
  parseHistory,
  parseHistoryList,
  parseLocation,
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

interface SavedRow {
  row: unknown
  history: unknown
}

export class SupabaseRepository implements Repository {
  readonly client: SupabaseClient
  /** Called after a change other members cannot see arrive by themselves (moves to Trash). */
  onPrivateChange: (() => void) | null = null
  private actorCache: { at: number; actor: Promise<Actor | null> } | null = null

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

  /** Calendars connect in Phase 2. */
  async listCalendarEvents(_memberId: Id, _range: DateRange): Promise<CalendarEvent[]> {
    return []
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
    const [actor, sheet] = await Promise.all([this.actor(), this.liveSheet(input.sheetId)])
    assertCan(actor, 'addRow', sheet)
    const position = await this.nextRowPosition(sheet.id)
    const change = newRow(
      sheet,
      input.values,
      { id: uuid(), position },
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
    return (await this.saveRow(next, null, 'editRow')).row
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

  findDuplicates(_values: NewRowValues): Promise<DuplicateCandidate[]> {
    return Promise.reject(new NotAvailableYet('findDuplicates', 'M1.6'))
  }
  markNotDuplicate(_rowIdA: Id, _rowIdB: Id, _ctx: MutationContext): Promise<void> {
    return Promise.reject(new NotAvailableYet('markNotDuplicate', 'M1.6'))
  }
  importRows(_batch: ImportBatch, _ctx: MutationContext): Promise<Row[]> {
    return Promise.reject(new NotAvailableYet('importRows', 'M1.8'))
  }
}

/** Tag names are unique ignoring case, as in the database (lower(name)). */
function sameTagName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}
