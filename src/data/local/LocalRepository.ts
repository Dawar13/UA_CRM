/**
 * Repository over Dexie (IndexedDB), for local development and tests. Every write checks the
 * actor with the same `can()` the UI uses, so a permission leak in the UI fails in local mode
 * too. Methods of later milestones throw NotAvailableYet.
 */
import { Dexie } from 'dexie'
import { findDuplicateMatches, pairKey } from '@/domain/dedupe/score'
import { formatPhone, normaliseName, searchTokens } from '@/domain/identity'
import { cleanMemberEmail, cleanMemberName, MemberRuleError } from '@/domain/members'
import { type Actor, assertCan } from '@/domain/permissions'
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
import {
  type ColumnPatch,
  type DateRange,
  type DuplicateCandidate,
  type DuplicateQuery,
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
  NotAvailableYet,
  NotFoundError,
  type Repository,
  type RowLocation,
  type SearchField,
  type SearchResult,
  TRASH_DAYS,
  type TrashItem,
} from '../repository'
import { UaCrmDb } from './db'
import { buildPerfSheet, PERF_SHEET_SLUG } from './perfSheet'
import { buildSeed, SEED_VERSION, type SeedData } from './seed'

/** Thrown when a mutation targets a row that does not exist or is in Trash. */
export class RowNotFoundError extends Error {
  constructor(rowId: Id) {
    super(`Row ${rowId} does not exist or has been deleted.`)
    this.name = 'RowNotFoundError'
  }
}

/** Search weights per field: name > company > title > email/phone > tags > connectsTo > notes. */
export const SEARCH_FIELD_WEIGHTS: Readonly<Record<SearchField, number>> = {
  name: 100,
  company: 60,
  title: 40,
  email: 30,
  phone: 30,
  tags: 20,
  connectsTo: 15,
  notes: 10,
}

const DEFAULT_SEARCH_LIMIT = 50

interface IndexedField {
  field: SearchField
  text: string
  tokens: string[]
}

interface CachedRowIndex {
  stamp: string
  fields: IndexedField[]
}

function newId(prefix: string): () => Id {
  return () => `${prefix}-${crypto.randomUUID()}`
}

function laterIso(a: string | null, b: string): string {
  return a !== null && a > b ? a : b
}

function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString()
}

/**
 * Digit forms of a stored phone so "98450", "12345", "9845012345", "098450 12345" and
 * "+91 98450 12345" all match "+919845012345". Built without parsing, which keeps indexing
 * 2,000 rows cheap.
 */
function phoneTokens(phone: string): string[] {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 0) return []
  const tokens = new Set<string>([digits])
  if (phone.startsWith('+91') && digits.length === 12) {
    const national = digits.slice(2)
    tokens.add('91')
    tokens.add(national)
    tokens.add(`0${national}`)
    // Display groups of an Indian mobile: "+91 98450 12345".
    tokens.add(national.slice(0, 5))
    tokens.add(national.slice(5))
  }
  return [...tokens]
}

function nameTokens(name: string): string[] {
  const tokens = new Set(searchTokens(name))
  const { compact } = normaliseName(name)
  if (compact.length > 0) tokens.add(compact)
  return [...tokens]
}

function emailTokens(email: string): string[] {
  const tokens = new Set(searchTokens(email))
  const lower = email.trim().toLowerCase()
  if (lower.length > 0) tokens.add(lower)
  return [...tokens]
}

export class LocalRepository implements Repository {
  readonly db: UaCrmDb
  private seeding: Promise<void> | null = null
  private tagCache: Promise<Tag[]> | null = null
  private readonly searchIndex = new Map<Id, CachedRowIndex>()

  constructor(db: UaCrmDb = new UaCrmDb()) {
    this.db = db
  }

  // ---------- Reads ----------

  async listMembers(): Promise<Member[]> {
    return this.db.members.orderBy('position').toArray()
  }

  async listSheets(memberId: Id): Promise<Sheet[]> {
    const sheets = await this.db.sheets
      .where('[memberId+position]')
      .between([memberId, Dexie.minKey], [memberId, Dexie.maxKey])
      .toArray()
    return sheets.filter((s) => s.deletedAt === null)
  }

  async getSheet(sheetId: Id): Promise<Sheet | undefined> {
    const sheet = await this.db.sheets.get(sheetId)
    return sheet && sheet.deletedAt === null ? sheet : undefined
  }

  async listRows(sheetId: Id): Promise<Row[]> {
    // A sheet in Trash takes its rows with it.
    if (!(await this.getSheet(sheetId))) return []
    const rows = await this.db.rows
      .where('[sheetId+position]')
      .between([sheetId, Dexie.minKey], [sheetId, Dexie.maxKey])
      .toArray()
    return rows.filter((r) => r.deletedAt === null)
  }

  async getRow(rowId: Id): Promise<Row | undefined> {
    const row = await this.db.rows.get(rowId)
    if (!row || row.deletedAt !== null) return undefined
    // A row in a sheet that is in Trash counts as deleted.
    return (await this.getSheet(row.sheetId)) ? row : undefined
  }

  async getRowLocation(rowId: Id): Promise<RowLocation | undefined> {
    const row = await this.getRow(rowId)
    if (!row) return undefined
    const [sheet, member] = await Promise.all([
      this.getSheet(row.sheetId),
      this.db.members.get(row.memberId),
    ])
    if (!sheet || !member) return undefined
    return { row, sheet, member }
  }

  async countRows(memberId: Id): Promise<Record<Id, number>> {
    const [sheets, rows] = await Promise.all([
      this.listSheets(memberId),
      this.db.rows.where('memberId').equals(memberId).toArray(),
    ])
    const counts: Record<Id, number> = {}
    for (const sheet of sheets) counts[sheet.id] = 0
    for (const row of rows) {
      if (row.deletedAt !== null) continue
      const current = counts[row.sheetId]
      if (current !== undefined) counts[row.sheetId] = current + 1
    }
    return counts
  }

  async listTags(): Promise<Tag[]> {
    this.tagCache ??= this.db.tags
      .toArray()
      .then((tags) =>
        tags.sort((a, b) => a.name.localeCompare(b.name, 'en-IN', { sensitivity: 'base' })),
      )
    const tags = await this.tagCache
    return tags.slice()
  }

  async listHistory(rowId: Id): Promise<HistoryEntry[]> {
    return this.db.history
      .where('[rowId+at]')
      .between([rowId, Dexie.minKey], [rowId, Dexie.maxKey])
      .reverse()
      .toArray()
  }

  async search(query: string, options?: { limit?: number }): Promise<SearchResult[]> {
    const queryTokens = [...new Set(searchTokens(query))]
    if (queryTokens.length === 0) return []
    const limit = options?.limit ?? DEFAULT_SEARCH_LIMIT

    const [rows, sheets, members, tags] = await Promise.all([
      this.db.rows.toArray(),
      this.db.sheets.toArray(),
      this.db.members.toArray(),
      this.listTags(),
    ])
    const sheetById = new Map(sheets.filter((s) => s.deletedAt === null).map((s) => [s.id, s]))
    const memberById = new Map(members.map((m) => [m.id, m]))
    const tagById = new Map(tags.map((t) => [t.id, t]))
    const nameById = new Map(rows.map((r) => [r.id, r.name]))
    const queryName = normaliseName(query).spaced

    const results: SearchResult[] = []
    for (const row of rows) {
      if (row.deletedAt !== null) continue
      const sheet = sheetById.get(row.sheetId)
      const member = memberById.get(row.memberId)
      if (!sheet || !member) continue

      const fields = this.indexRow(row, tagById, nameById)
      const fieldScores = new Map<number, number>()
      let total = 0
      let matchedAll = true
      for (const q of queryTokens) {
        let best = 0
        let bestField = -1
        fields.forEach((f, i) => {
          for (const token of f.tokens) {
            if (!token.startsWith(q)) continue
            const quality = token === q ? 1 : 0.6 + 0.3 * (q.length / token.length)
            const score = SEARCH_FIELD_WEIGHTS[f.field] * quality
            if (score > best) {
              best = score
              bestField = i
            }
          }
        })
        if (bestField < 0) {
          matchedAll = false
          break
        }
        total += best
        fieldScores.set(bestField, (fieldScores.get(bestField) ?? 0) + best)
      }
      if (!matchedAll) continue

      // The whole query reads as the start of the name: rank it first.
      if (queryName.length > 0 && normaliseName(row.name).spaced.startsWith(queryName)) {
        total += SEARCH_FIELD_WEIGHTS.name / 2
      }

      let matched = 0
      let matchedScore = -1
      for (const [i, s] of fieldScores) {
        if (s > matchedScore) {
          matched = i
          matchedScore = s
        }
      }
      const field = fields[matched]
      if (!field) continue
      results.push({
        row,
        sheet,
        member,
        score: Math.round(total * 100) / 100,
        matchedField: field.field,
        matchedText: field.field === 'phone' ? formatPhone(field.text) : field.text,
      })
    }

    results.sort(
      (a, b) =>
        b.score - a.score ||
        a.row.name.localeCompare(b.row.name, 'en-IN', { sensitivity: 'base' }) ||
        a.row.id.localeCompare(b.row.id),
    )
    return results.slice(0, limit)
  }

  async listCalendarEvents(memberId: Id, range: DateRange): Promise<CalendarEvent[]> {
    const from = new Date(range.from).toISOString()
    const to = new Date(range.to).toISOString()
    return this.db.calendarEvents
      .where('[memberId+start]')
      .between([memberId, Dexie.minKey], [memberId, to], true, false)
      .filter((e) => e.end > from)
      .toArray()
  }

  async listMemberRows(memberId: Id): Promise<Row[]> {
    const [rows, sheets] = await Promise.all([
      this.db.rows.where('memberId').equals(memberId).toArray(),
      this.listSheets(memberId),
    ])
    const live = new Set(sheets.map((s) => s.id))
    return rows.filter((r) => r.deletedAt === null && live.has(r.sheetId))
  }

  async listMemberHistory(memberId: Id, range: DateRange): Promise<HistoryEntry[]> {
    const from = new Date(range.from).toISOString()
    const to = new Date(range.to).toISOString()
    const ids = new Set((await this.listMemberRows(memberId)).map((r) => r.id))
    // One bulk read of the index range, filtered in memory: a cursor filter would hold the
    // history store for every entry and make row writes queue behind it.
    const entries = await this.db.history.where('at').between(from, to, true, false).toArray()
    return entries.filter((h) => ids.has(h.rowId))
  }

  // ---------- Mutations ----------

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

  /**
   * Loads the row and its sheet, checks the actor owns them, applies the domain change, then
   * writes the row and appends the history entry in one transaction. History instants stay strictly increasing per row, so
   * newest-first order is stable even when the clock is frozen (Playwright) and an undo lands
   * in the same millisecond as the change it reverts.
   */
  private async mutate(
    rowId: Id,
    ctx: MutationContext,
    change: (row: Row, sheet: Sheet, dctx: DomainContext) => RowChange,
  ): Promise<MutationResult> {
    const actor = await this.actor(ctx)
    const { db } = this
    const result = await db.transaction('rw', db.rows, db.sheets, db.history, async () => {
      const row = await db.rows.get(rowId)
      if (!row || row.deletedAt !== null) throw new RowNotFoundError(rowId)
      assertCan(actor, 'editRow', row)
      const sheet = await db.sheets.get(row.sheetId)
      if (!sheet || sheet.deletedAt !== null) {
        throw new Error(`Sheet ${row.sheetId} of row ${rowId} does not exist or has been deleted.`)
      }
      const dctx: DomainContext = { now: ctx.now, actorId: ctx.actorId, newId: newId('h') }
      const next = change(row, sheet, dctx)

      const latest = await db.history
        .where('[rowId+at]')
        .between([rowId, Dexie.minKey], [rowId, Dexie.maxKey])
        .last()
      let at = new Date(next.history.at).toISOString()
      if (latest && latest.at >= at) at = addMs(latest.at, 1)
      const history: HistoryEntry = { ...next.history, rowId, at }
      const updated: Row = {
        ...next.row,
        lastTouchAt: laterIso(next.row.lastTouchAt, at),
        updatedAt: ctx.now.toISOString(),
        updatedBy: ctx.actorId,
      }
      await db.rows.put(updated)
      await db.history.add(history)
      return { row: updated, history }
    })
    this.searchIndex.delete(rowId)
    return result
  }

  // ---------- Sample data ----------

  ensureSeeded(): Promise<void> {
    this.seeding ??= this.seedIfNeeded().catch((error: unknown) => {
      this.seeding = null
      throw error
    })
    return this.seeding
  }

  async resetSampleData(): Promise<void> {
    const { db } = this
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()))
      await this.writeSeed(buildSeed())
    })
    this.clearCaches()
    this.seeding = Promise.resolve()
  }

  async loadPerfSheet(): Promise<Sheet> {
    await this.ensureSeeded()
    const { db } = this
    const sheet = await db.transaction(
      'rw',
      db.members,
      db.sheets,
      db.rows,
      db.history,
      async () => {
        const [member] = await db.members.orderBy('position').limit(1).toArray()
        if (!member) throw new Error('There is no member to own the 2,000-row sheet.')
        const sheets = await db.sheets.where('memberId').equals(member.id).toArray()
        const existing = sheets.find((s) => s.slug === PERF_SHEET_SLUG)
        const position = existing
          ? existing.position
          : sheets.reduce((max, s) => Math.max(max, s.position + 1), 0)
        if (existing) {
          const oldRowIds = (
            await db.rows.where('sheetId').equals(existing.id).primaryKeys()
          ).sort()
          const first = oldRowIds[0]
          const last = oldRowIds[oldRowIds.length - 1]
          if (first !== undefined && last !== undefined) {
            // One key range over the generated ids (they share a prefix), filtered in memory:
            // anyOf() and Collection.filter() walk a cursor, which is slow for 2,000 rows.
            const ids = new Set(oldRowIds)
            const candidates = await db.history
              .where('rowId')
              .between(first, last, true, true)
              .toArray()
            await db.history.bulkDelete(candidates.filter((h) => ids.has(h.rowId)).map((h) => h.id))
          }
          await db.rows.bulkDelete(oldRowIds)
          await db.sheets.delete(existing.id)
        }
        const perf = buildPerfSheet(member, position)
        await db.sheets.put(perf.sheet)
        await db.rows.bulkPut(perf.rows)
        await db.history.bulkPut(perf.history)
        return perf.sheet
      },
    )
    this.searchIndex.clear()
    return sheet
  }

  private async seedIfNeeded(): Promise<void> {
    const { db } = this
    const seeded = await db.transaction('rw', db.tables, async () => {
      const meta = await db.meta.get('seedVersion')
      if (meta?.value === SEED_VERSION) return false
      // Phase 0 holds sample data only, so a newer seed replaces the old one.
      if (meta) await Promise.all(db.tables.map((t) => t.clear()))
      await this.writeSeed(buildSeed())
      return true
    })
    if (seeded) this.clearCaches()
  }

  private async writeSeed(seed: SeedData): Promise<void> {
    const { db } = this
    await db.members.bulkPut(seed.members)
    await db.sheets.bulkPut(seed.sheets)
    await db.tags.bulkPut(seed.tags)
    await db.rows.bulkPut(seed.rows)
    await db.history.bulkPut(seed.history)
    await db.calendarEvents.bulkPut(seed.calendarEvents)
    await db.meta.put({ key: 'seedVersion', value: SEED_VERSION })
  }

  private clearCaches(): void {
    this.tagCache = null
    this.searchIndex.clear()
  }

  /** Tokenised fields of a row, cached by `updatedAt`; link names are resolved per call. */
  private indexRow(
    row: Row,
    tagById: ReadonlyMap<Id, Tag>,
    nameById: ReadonlyMap<Id, string>,
  ): IndexedField[] {
    let cached = this.searchIndex.get(row.id)
    if (!cached || cached.stamp !== row.updatedAt) {
      const fields: IndexedField[] = []
      const add = (field: SearchField, text: string, tokens: string[]): void => {
        if (text.trim().length > 0 && tokens.length > 0) fields.push({ field, text, tokens })
      }
      add('name', row.name, nameTokens(row.name))
      add('company', row.company, searchTokens(row.company))
      add('title', row.title, searchTokens(row.title))
      add('email', row.email, emailTokens(row.email))
      add('phone', row.phone, phoneTokens(row.phone))
      add('notes', row.notes, searchTokens(row.notes))
      cached = { stamp: row.updatedAt, fields }
      this.searchIndex.set(row.id, cached)
    }

    const fields = cached.fields.slice()
    for (const tagId of row.tagIds) {
      const tag = tagById.get(tagId)
      if (tag) fields.push({ field: 'tags', text: tag.name, tokens: searchTokens(tag.name) })
    }
    for (const link of row.connectsTo) {
      const text = link.kind === 'row' ? nameById.get(link.rowId) : link.text
      if (text) fields.push({ field: 'connectsTo', text, tokens: nameTokens(text) })
    }
    return fields
  }

  // ---------- Ownership ----------

  /** The acting member, read fresh so a deactivation takes effect at once. */
  private async actor(ctx: Pick<MutationContext, 'actorId'>): Promise<Actor | null> {
    const member = await this.db.members.get(ctx.actorId)
    return member ? { id: member.id, isAdmin: member.isAdmin, active: member.active } : null
  }

  private domainContext(ctx: MutationContext, prefix = 'h'): DomainContext {
    return { now: ctx.now, actorId: ctx.actorId, newId: newId(prefix) }
  }

  private async liveSheet(sheetId: Id): Promise<Sheet> {
    const sheet = await this.db.sheets.get(sheetId)
    if (!sheet || sheet.deletedAt !== null) throw new NotFoundError('Sheet', sheetId)
    return sheet
  }

  private async liveRow(rowId: Id): Promise<Row> {
    const row = await this.db.rows.get(rowId)
    if (!row || row.deletedAt !== null) throw new RowNotFoundError(rowId)
    return row
  }

  /** The newest history instant of a row, or null; what the database keeps in last_touch_at. */
  private async newestHistoryAt(rowId: Id): Promise<string | null> {
    const latest = await this.db.history
      .where('[rowId+at]')
      .between([rowId, Dexie.minKey], [rowId, Dexie.maxKey])
      .last()
    return latest?.at ?? null
  }

  private async putSheet(sheet: Sheet): Promise<Sheet> {
    await this.db.sheets.put(sheet)
    return sheet
  }

  // ---------- Phase 1: rows ----------

  async createRow(input: NewRowInput, ctx: MutationContext): Promise<MutationResult> {
    const actor = await this.actor(ctx)
    const { db } = this
    const result = await db.transaction('rw', db.rows, db.sheets, db.history, async () => {
      const sheet = await this.liveSheet(input.sheetId)
      assertCan(actor, 'addRow', sheet)
      const last = await db.rows
        .where('[sheetId+position]')
        .between([sheet.id, Dexie.minKey], [sheet.id, Dexie.maxKey])
        .last()
      const change = newRow(
        sheet,
        input.values,
        { id: input.id ?? newId('r')(), position: last ? last.position + 1 : 0 },
        this.domainContext(ctx),
      )
      await db.rows.add(change.row)
      await db.history.add(change.history)
      return change
    })
    return result
  }

  async updateRow(rowId: Id, patch: RowPatch, ctx: MutationContext): Promise<Row> {
    const actor = await this.actor(ctx)
    const { db } = this
    const row = await db.transaction('rw', db.rows, db.sheets, async () => {
      const current = await this.liveRow(rowId)
      assertCan(actor, 'editRow', current)
      const sheet = await this.liveSheet(current.sheetId)
      const next = patchRow(current, sheet, patch, this.domainContext(ctx))
      await db.rows.put(next)
      return next
    })
    this.searchIndex.delete(rowId)
    return row
  }

  async copyRow(
    sourceRowId: Id,
    destinationSheetId: Id,
    ctx: MutationContext,
  ): Promise<MutationResult> {
    const actor = await this.actor(ctx)
    const source = await this.getRowLocation(sourceRowId)
    if (!source) throw new RowNotFoundError(sourceRowId)
    const destination = await this.liveSheet(destinationSheetId)
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
    const [rows, sheets] = await Promise.all([this.db.rows.toArray(), this.db.sheets.toArray()])
    const live = new Set(sheets.filter((s) => s.deletedAt === null).map((s) => s.id))
    return rows
      .filter((r) => r.deletedAt === null && live.has(r.sheetId) && r.samePerson?.includes(rowId))
      .map((r) => r.id)
  }

  async deleteRows(rowIds: Id[], ctx: MutationContext): Promise<void> {
    await this.setRowsDeleted(rowIds, ctx, ctx.now.toISOString())
  }

  async restoreRows(rowIds: Id[], ctx: MutationContext): Promise<void> {
    await this.setRowsDeleted(rowIds, ctx, null)
  }

  /** Trash or restore rows, all or none. */
  private async setRowsDeleted(
    rowIds: Id[],
    ctx: MutationContext,
    deletedAt: string | null,
  ): Promise<void> {
    const actor = await this.actor(ctx)
    const { db } = this
    await db.transaction('rw', db.rows, async () => {
      const rows = await db.rows.bulkGet([...new Set(rowIds)])
      const next: Row[] = []
      for (const [i, row] of rows.entries()) {
        const id = rowIds[i] ?? ''
        // Deleting needs a live row; restoring needs one in Trash.
        if (!row || (deletedAt === null) === (row.deletedAt === null)) {
          throw new NotFoundError(deletedAt === null ? 'Row in Trash' : 'Row', id)
        }
        assertCan(actor, 'deleteRow', row)
        next.push({ ...row, deletedAt, updatedAt: ctx.now.toISOString(), updatedBy: ctx.actorId })
      }
      await db.rows.bulkPut(next)
    })
    for (const id of rowIds) this.searchIndex.delete(id)
  }

  // ---------- Phase 1: files ----------

  async attachFile(rowId: Id, file: NewFile, ctx: MutationContext): Promise<FileRef> {
    if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.name)
    const actor = await this.actor(ctx)
    // Local mode keeps the file in the row itself, as a data URL.
    const url = await blobToDataUrl(file.data)
    const { db } = this
    return db.transaction('rw', db.rows, async () => {
      const row = await this.liveRow(rowId)
      assertCan(actor, 'manageFiles', row)
      const ref: FileRef = {
        id: newId('f')(),
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url,
      }
      await db.rows.put({
        ...row,
        files: [...row.files, ref],
        updatedAt: ctx.now.toISOString(),
        updatedBy: ctx.actorId,
      })
      return ref
    })
  }

  async removeFile(rowId: Id, fileId: Id, ctx: MutationContext): Promise<void> {
    const actor = await this.actor(ctx)
    const { db } = this
    await db.transaction('rw', db.rows, async () => {
      const row = await this.liveRow(rowId)
      assertCan(actor, 'manageFiles', row)
      if (!row.files.some((f) => f.id === fileId)) throw new NotFoundError('File', fileId)
      await db.rows.put({
        ...row,
        files: row.files.filter((f) => f.id !== fileId),
        updatedAt: ctx.now.toISOString(),
        updatedBy: ctx.actorId,
      })
    })
  }

  async fileUrl(file: FileRef): Promise<string> {
    return file.url
  }

  // ---------- Phase 1: history ----------

  async addHistory(rowId: Id, entry: NewHistoryInput, ctx: MutationContext): Promise<HistoryEntry> {
    const actor = await this.actor(ctx)
    const { db } = this
    return db.transaction('rw', db.rows, db.history, async () => {
      const row = await this.liveRow(rowId)
      assertCan(actor, 'addHistory', row)
      const history: HistoryEntry = {
        id: newId('h')(),
        rowId,
        kind: entry.kind,
        source: entry.source ?? 'manual',
        at: new Date(entry.at).toISOString(),
        fuzzyDate: entry.fuzzyDate ?? null,
        text: entry.text.trim(),
        memberId: ctx.actorId,
      }
      await db.history.add(history)
      await db.rows.put({
        ...row,
        lastTouchAt: laterIso(row.lastTouchAt, history.at),
        updatedAt: ctx.now.toISOString(),
        updatedBy: ctx.actorId,
      })
      return history
    })
  }

  async updateHistory(
    historyId: Id,
    patch: HistoryPatch,
    ctx: MutationContext,
  ): Promise<HistoryEntry> {
    const actor = await this.actor(ctx)
    const { db } = this
    return db.transaction('rw', db.rows, db.history, async () => {
      const { entry, row } = await this.editableHistory(historyId, actor, 'editHistory')
      const next: HistoryEntry = {
        ...entry,
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.at !== undefined ? { at: new Date(patch.at).toISOString() } : {}),
        ...(patch.fuzzyDate !== undefined ? { fuzzyDate: patch.fuzzyDate } : {}),
        ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
      }
      if (AUTOMATIC_KINDS.has(next.kind)) {
        throw new RowValidationError([
          { key: 'kind', message: 'Stage, warmth and created entries are written automatically' },
        ])
      }
      await db.history.put(next)
      await this.refreshLastTouch(row, ctx)
      return next
    })
  }

  async deleteHistory(historyId: Id, ctx: MutationContext): Promise<void> {
    const actor = await this.actor(ctx)
    const { db } = this
    await db.transaction('rw', db.rows, db.history, async () => {
      const { row } = await this.editableHistory(historyId, actor, 'editHistory')
      await db.history.delete(historyId)
      await this.refreshLastTouch(row, ctx)
    })
  }

  /** A hand-logged entry on a live row the actor owns. Automatic entries are kept as they are. */
  private async editableHistory(
    historyId: Id,
    actor: Actor | null,
    action: 'editHistory',
  ): Promise<{ entry: HistoryEntry; row: Row }> {
    const entry = await this.db.history.get(historyId)
    if (!entry) throw new NotFoundError('History entry', historyId)
    const row = await this.liveRow(entry.rowId)
    assertCan(actor, action, row)
    if (entry.source === 'system' || AUTOMATIC_KINDS.has(entry.kind)) {
      throw new RowValidationError([
        { key: 'kind', message: 'Stage, warmth and created entries are written automatically' },
      ])
    }
    return { entry, row }
  }

  private async refreshLastTouch(row: Row, ctx: MutationContext): Promise<void> {
    await this.db.rows.put({
      ...row,
      lastTouchAt: await this.newestHistoryAt(row.id),
      updatedAt: ctx.now.toISOString(),
      updatedBy: ctx.actorId,
    })
  }

  // ---------- Phase 1: sheets ----------

  async createSheet(
    memberId: Id,
    input: { name: string; template: TemplateKey },
    ctx: MutationContext,
  ): Promise<Sheet> {
    const actor = await this.actor(ctx)
    assertCan(actor, 'manageSheet', { memberId })
    const { db } = this
    return db.transaction('rw', db.sheets, async () => {
      const existing = await this.listSheets(memberId)
      const sheet = newSheet(
        memberId,
        input,
        existing,
        { sheetId: newId('s')(), newId: newId('c') },
        ctx.now,
      )
      return this.putSheet(sheet)
    })
  }

  async updateSheet(
    sheetId: Id,
    patch: Partial<Pick<Sheet, 'name' | 'stages'>>,
    ctx: MutationContext,
  ): Promise<Sheet> {
    const actor = await this.actor(ctx)
    const { db } = this
    return db.transaction('rw', db.sheets, async () => {
      let sheet = await this.liveSheet(sheetId)
      assertCan(actor, 'manageSheet', sheet)
      if (patch.name !== undefined) {
        sheet = renameSheet(sheet, patch.name, await this.listSheets(sheet.memberId), ctx.now)
      }
      if (patch.stages !== undefined) sheet = renameStages(sheet, patch.stages, ctx.now)
      return this.putSheet(sheet)
    })
  }

  async editStages(
    sheetId: Id,
    stages: readonly StageDef[],
    moves: StageMoves,
    ctx: MutationContext,
  ): Promise<Sheet> {
    const actor = await this.actor(ctx)
    const { db } = this
    const sheet = await db.transaction('rw', db.sheets, db.rows, async () => {
      const current = await this.liveSheet(sheetId)
      assertCan(actor, 'manageStages', current)
      const rows = await db.rows.where('sheetId').equals(sheetId).toArray()
      const result = domainEditStages(current, stages, moves, rows, {
        now: ctx.now,
        newId: newId('c'),
      })
      await db.rows.bulkPut(result.rows.map((r) => ({ ...r, updatedBy: ctx.actorId })))
      return this.putSheet(result.sheet)
    })
    this.searchIndex.clear()
    return sheet
  }

  async convertColumn(
    sheetId: Id,
    columnId: Id,
    type: ColumnDef['type'],
    ctx: MutationContext,
  ): Promise<Sheet> {
    const actor = await this.actor(ctx)
    const { db } = this
    const sheet = await db.transaction('rw', db.sheets, db.rows, db.tags, async () => {
      const current = await this.liveSheet(sheetId)
      assertCan(actor, 'manageColumns', current)
      const [rows, tags] = await Promise.all([
        db.rows.where('sheetId').equals(sheetId).toArray(),
        db.tags.toArray(),
      ])
      const result = domainConvertColumn(current, columnId, type, rows, {
        now: ctx.now,
        tagMap: new Map(tags.map((t) => [t.id, t])),
      })
      await db.rows.bulkPut(result.rows.map((r) => ({ ...r, updatedBy: ctx.actorId })))
      return this.putSheet(result.sheet)
    })
    this.searchIndex.clear()
    return sheet
  }

  async reorderSheets(memberId: Id, sheetIds: Id[], ctx: MutationContext): Promise<Sheet[]> {
    const actor = await this.actor(ctx)
    assertCan(actor, 'manageSheet', { memberId })
    const { db } = this
    return db.transaction('rw', db.sheets, async () => {
      const at = ctx.now.toISOString()
      const sheets = reorderByIds(await this.listSheets(memberId), sheetIds).map((s) => ({
        ...s,
        updatedAt: at,
      }))
      await db.sheets.bulkPut(sheets)
      return sheets
    })
  }

  async deleteSheet(sheetId: Id, ctx: MutationContext): Promise<void> {
    const actor = await this.actor(ctx)
    const { db } = this
    await db.transaction('rw', db.sheets, async () => {
      const sheet = await this.liveSheet(sheetId)
      assertCan(actor, 'manageSheet', sheet)
      const at = ctx.now.toISOString()
      await db.sheets.put({ ...sheet, deletedAt: at, updatedAt: at })
    })
    this.searchIndex.clear()
  }

  async restoreSheet(sheetId: Id, ctx: MutationContext): Promise<Sheet> {
    const actor = await this.actor(ctx)
    const { db } = this
    const restored = await db.transaction('rw', db.sheets, async () => {
      const sheet = await db.sheets.get(sheetId)
      if (!sheet || sheet.deletedAt === null) throw new NotFoundError('Sheet in Trash', sheetId)
      assertCan(actor, 'manageSheet', sheet)
      const live = await this.listSheets(sheet.memberId)
      return this.putSheet({
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
    })
    this.searchIndex.clear()
    return restored
  }

  // ---------- Phase 1: columns ----------

  /** Loads a live sheet the actor owns, applies `change` and saves it. */
  private async changeColumns(
    sheetId: Id,
    ctx: MutationContext,
    change: (sheet: Sheet) => Sheet | Promise<Sheet>,
  ): Promise<Sheet> {
    const actor = await this.actor(ctx)
    const { db } = this
    return db.transaction('rw', db.sheets, db.rows, async () => {
      const sheet = await this.liveSheet(sheetId)
      assertCan(actor, 'manageColumns', sheet)
      return this.putSheet(await change(sheet))
    })
  }

  addColumn(sheetId: Id, column: NewColumnInput, ctx: MutationContext): Promise<Sheet> {
    return this.changeColumns(sheetId, ctx, (sheet) =>
      domainAddColumn(sheet, column, newId('c')(), ctx.now),
    )
  }

  updateColumn(
    sheetId: Id,
    columnId: Id,
    patch: ColumnPatch,
    ctx: MutationContext,
  ): Promise<Sheet> {
    return this.changeColumns(sheetId, ctx, async (sheet) => {
      const next = domainUpdateColumn(sheet, columnId, patch, ctx.now)
      if (patch.type !== undefined || patch.options !== undefined) {
        const rows = await this.db.rows.where('sheetId').equals(sheetId).toArray()
        const misfits = valuesThatNoLongerFit(next, columnId, rows)
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
    return this.changeColumns(sheetId, ctx, (sheet) => domainDeleteColumn(sheet, columnId, ctx.now))
  }

  restoreColumn(sheetId: Id, columnId: Id, ctx: MutationContext): Promise<Sheet> {
    return this.changeColumns(sheetId, ctx, (sheet) =>
      domainRestoreColumn(sheet, columnId, ctx.now),
    )
  }

  reorderColumns(sheetId: Id, columnIds: Id[], ctx: MutationContext): Promise<Sheet> {
    return this.changeColumns(sheetId, ctx, (sheet) =>
      domainReorderColumns(sheet, columnIds, ctx.now),
    )
  }

  // ---------- Phase 1: tags ----------

  async createTag(
    input: Pick<Tag, 'name'> & Partial<Pick<Tag, 'colour'>>,
    ctx: MutationContext,
  ): Promise<Tag> {
    const actor = await this.actor(ctx)
    assertCan(actor, 'createTag')
    const name = cleanTagName(input.name)
    const { db } = this
    const tag = await db.transaction('rw', db.tags, async () => {
      const tags = await db.tags.toArray()
      const same = tags.find((t) => sameTagName(t.name, name))
      if (same) return same
      const created: Tag = {
        id: newId('t')(),
        name,
        colour: input.colour ?? pickTagColour(tags),
        createdBy: ctx.actorId,
        createdAt: ctx.now.toISOString(),
      }
      await db.tags.add(created)
      return created
    })
    this.tagCache = null
    return tag
  }

  async updateTag(
    tagId: Id,
    patch: Partial<Pick<Tag, 'name' | 'colour'>>,
    ctx: MutationContext,
  ): Promise<Tag> {
    const actor = await this.actor(ctx)
    const { db } = this
    const tag = await db.transaction('rw', db.tags, db.rows, db.members, async () => {
      const current = await this.tagWithUsage(tagId, actor, 'editTag')
      const next: Tag = { ...current }
      if (patch.name !== undefined) {
        next.name = cleanTagName(patch.name)
        const clash = (await db.tags.toArray()).find(
          (t) => t.id !== tagId && sameTagName(t.name, next.name),
        )
        if (clash) throw new TagRuleError(`There is already a tag called ${clash.name}`)
      }
      if (patch.colour !== undefined) next.colour = patch.colour
      await db.tags.put(next)
      return next
    })
    this.tagCache = null
    this.searchIndex.clear()
    return tag
  }

  async deleteTag(tagId: Id, ctx: MutationContext): Promise<void> {
    const actor = await this.actor(ctx)
    const { db } = this
    await db.transaction('rw', db.tags, db.rows, db.members, async () => {
      await this.tagWithUsage(tagId, actor, 'deleteTag')
      // Only the creator's rows can use it now; take it off them, Trash included.
      const rows = (await db.rows.toArray()).filter((r) => r.tagIds.includes(tagId))
      await db.rows.bulkPut(
        rows.map((r) => ({
          ...r,
          tagIds: r.tagIds.filter((id) => id !== tagId),
          updatedAt: ctx.now.toISOString(),
          updatedBy: ctx.actorId,
        })),
      )
      await db.tags.delete(tagId)
    })
    this.tagCache = null
    this.searchIndex.clear()
  }

  /** The tag, after checking the actor created it and nobody else's rows (Trash included) use it. */
  private async tagWithUsage(
    tagId: Id,
    actor: Actor | null,
    action: 'editTag' | 'deleteTag',
  ): Promise<Tag> {
    const tag = await this.db.tags.get(tagId)
    if (!tag) throw new NotFoundError('Tag', tagId)
    const [rows, members] = await Promise.all([this.db.rows.toArray(), this.db.members.toArray()])
    const nameOf = new Map(members.map((m) => [m.id, m.name]))
    const usedBy = rows
      .filter((r) => r.tagIds.includes(tagId))
      .map((r) => ({ memberId: r.memberId, name: nameOf.get(r.memberId) ?? 'another member' }))
    assertCan(actor, action, { createdBy: tag.createdBy, usedBy })
    return tag
  }

  // ---------- Phase 1: members ----------

  async createMember(input: Pick<Member, 'name' | 'email'>, ctx: MutationContext): Promise<Member> {
    const actor = await this.actor(ctx)
    assertCan(actor, 'addMember')
    const name = cleanMemberName(input.name)
    const email = cleanMemberEmail(input.email)
    const { db } = this
    return db.transaction('rw', db.members, async () => {
      const members = await db.members.toArray()
      if (members.some((m) => m.email.toLowerCase() === email)) {
        throw new MemberRuleError('That email address is already on the team')
      }
      const member: Member = {
        id: newId('m')(),
        slug: uniqueSlug(
          slugify(name),
          members.map((m) => m.slug),
        ),
        name,
        email,
        position: members.reduce((max, m) => Math.max(max, m.position + 1), 0),
        isAdmin: false,
        active: true,
        createdAt: ctx.now.toISOString(),
      }
      await db.members.add(member)
      return member
    })
  }

  async updateMember(memberId: Id, patch: MemberPatch, ctx: MutationContext): Promise<Member> {
    const actor = await this.actor(ctx)
    const { db } = this
    return db.transaction('rw', db.members, async () => {
      const member = await db.members.get(memberId)
      if (!member) throw new NotFoundError('Member', memberId)
      const next: Member = { ...member }
      if (patch.name !== undefined) {
        assertCan(actor, 'renameMember', { memberId })
        next.name = cleanMemberName(patch.name)
      }
      if (patch.active !== undefined && patch.active !== member.active) {
        assertCan(actor, 'setMemberActive', { memberId })
        next.active = patch.active
      }
      if (patch.isAdmin !== undefined && patch.isAdmin !== member.isAdmin) {
        assertCan(actor, 'setMemberAdmin', { memberId })
        next.isAdmin = patch.isAdmin
      }
      await db.members.put(next)
      return next
    })
  }

  // ---------- Phase 1: Trash ----------

  async listTrash(ctx: MutationContext): Promise<TrashItem[]> {
    const actor = await this.actor(ctx)
    assertCan(actor, 'viewTrash', { memberId: ctx.actorId })
    const since = new Date(ctx.now.getTime() - TRASH_DAYS * DAY_MS).toISOString()
    const [sheets, rows] = await Promise.all([
      this.db.sheets.where('memberId').equals(ctx.actorId).toArray(),
      this.db.rows.where('memberId').equals(ctx.actorId).toArray(),
    ])
    const recent = (deletedAt: string | null | undefined): deletedAt is string =>
      typeof deletedAt === 'string' && deletedAt >= since
    const items: TrashItem[] = []
    for (const sheet of sheets) {
      if (recent(sheet.deletedAt)) {
        items.push({
          kind: 'sheet',
          id: sheet.id,
          sheetId: sheet.id,
          label: sheet.name,
          deletedAt: sheet.deletedAt,
        })
        continue
      }
      if (sheet.deletedAt !== null) continue
      for (const column of sheet.columns) {
        if (recent(column.deletedAt)) {
          items.push({
            kind: 'column',
            id: column.id,
            sheetId: sheet.id,
            label: column.label,
            deletedAt: column.deletedAt,
          })
        }
      }
    }
    for (const row of rows) {
      if (recent(row.deletedAt)) {
        items.push({
          kind: 'row',
          id: row.id,
          sheetId: row.sheetId,
          label: row.name,
          deletedAt: row.deletedAt,
        })
      }
    }
    return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || a.id.localeCompare(b.id))
  }

  // ---------- Later in Phase 1 ----------

  async findDuplicates(
    query: DuplicateQuery,
    options: { selfId?: Id } = {},
  ): Promise<DuplicateCandidate[]> {
    const [rows, sheets, members, pairs] = await Promise.all([
      this.db.rows.toArray(),
      this.db.sheets.toArray(),
      this.db.members.toArray(),
      this.db.notDuplicate.toArray(),
    ])
    const sheetById = new Map(sheets.filter((s) => s.deletedAt === null).map((s) => [s.id, s]))
    const memberById = new Map(members.map((m) => [m.id, m]))
    const live = rows.filter((r) => r.deletedAt === null && sheetById.has(r.sheetId))
    const byId = new Map(live.map((r) => [r.id, r]))
    const matches = findDuplicateMatches(query, live, {
      selfId: options.selfId,
      notDuplicate: new Set(pairs.map((p) => p.key)),
    })
    const found: DuplicateCandidate[] = []
    for (const match of matches) {
      const row = byId.get(match.rowId)
      const sheet = row ? sheetById.get(row.sheetId) : undefined
      const member = row ? memberById.get(row.memberId) : undefined
      if (row && sheet && member) {
        found.push({ location: { row, sheet, member }, level: match.level, reason: match.reason })
      }
    }
    return found
  }

  async markNotDuplicate(rowIdA: Id, rowIdB: Id, ctx: MutationContext): Promise<void> {
    const actor = await this.actor(ctx)
    const [a, b] = await this.db.rows.bulkGet([rowIdA, rowIdB])
    if (!a) throw new RowNotFoundError(rowIdA)
    if (!b) throw new RowNotFoundError(rowIdB)
    assertCan(actor, 'markNotDuplicate', { rows: [a, b] })
    await this.db.notDuplicate.put({ key: pairKey(rowIdA, rowIdB), ownerId: ctx.actorId })
  }
  importRows(_batch: ImportBatch, _ctx: MutationContext): Promise<Row[]> {
    return notYet('importRows', 'M1.8')
  }
}

const DAY_MS = 86_400_000

/** History kinds written by the app itself; never edited or deleted by hand. */
const AUTOMATIC_KINDS = new Set<HistoryEntry['kind']>(['stage', 'warmth', 'created'])

/** Tag names are unique ignoring case, as in the database (lower(name)). */
function sameTagName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** Rejects (rather than throws synchronously) so callers see a failed promise either way. */
function notYet(method: string, milestone: string): Promise<never> {
  return Promise.reject(new NotAvailableYet(method, milestone))
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}
