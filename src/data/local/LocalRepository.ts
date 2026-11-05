/**
 * Repository over Dexie (IndexedDB). Phase 0 implements reads, the stage and warmth mutations,
 * search and the sample-data hooks. Phase 1 methods throw NotImplementedInPhase0.
 */
import { Dexie } from 'dexie'
import { formatPhone, normaliseName, searchTokens } from '@/domain/identity'
import {
  markLost as domainMarkLost,
  reopen as domainReopen,
  restoreStage as domainRestoreStage,
  moveToStage,
} from '@/domain/stages'
import type {
  CalendarEvent,
  ColumnDef,
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
  type DateRange,
  type DuplicateCandidate,
  type ImportBatch,
  type MutationContext,
  type MutationResult,
  type NewRowInput,
  NotImplementedInPhase0,
  type Repository,
  type RowLocation,
  type SearchField,
  type SearchResult,
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
    const rows = await this.db.rows
      .where('[sheetId+position]')
      .between([sheetId, Dexie.minKey], [sheetId, Dexie.maxKey])
      .toArray()
    return rows.filter((r) => r.deletedAt === null)
  }

  async getRow(rowId: Id): Promise<Row | undefined> {
    const row = await this.db.rows.get(rowId)
    return row && row.deletedAt === null ? row : undefined
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
    const rows = await this.db.rows.where('memberId').equals(memberId).toArray()
    return rows.filter((r) => r.deletedAt === null)
  }

  async listMemberHistory(memberId: Id, range: DateRange): Promise<HistoryEntry[]> {
    const from = new Date(range.from).toISOString()
    const to = new Date(range.to).toISOString()
    const ids = new Set(
      (await this.db.rows.where('memberId').equals(memberId).primaryKeys()) as Id[],
    )
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
   * Loads the row and its sheet, applies the domain change, then writes the row and appends the
   * history entry in one transaction. History instants stay strictly increasing per row, so
   * newest-first order is stable even when the clock is frozen (Playwright) and an undo lands
   * in the same millisecond as the change it reverts.
   */
  private async mutate(
    rowId: Id,
    ctx: MutationContext,
    change: (row: Row, sheet: Sheet, dctx: DomainContext) => RowChange,
  ): Promise<MutationResult> {
    const { db } = this
    const result = await db.transaction('rw', db.rows, db.sheets, db.history, async () => {
      const row = await db.rows.get(rowId)
      if (!row || row.deletedAt !== null) throw new RowNotFoundError(rowId)
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

  // ---------- Phase 1 ----------

  createRow(_input: NewRowInput, _ctx: MutationContext): Promise<Row> {
    return notInPhase0('createRow')
  }
  updateRow(_rowId: Id, _patch: NewRowInput['values'], _ctx: MutationContext): Promise<Row> {
    return notInPhase0('updateRow')
  }
  deleteRows(_rowIds: Id[], _ctx: MutationContext): Promise<void> {
    return notInPhase0('deleteRows')
  }
  restoreRows(_rowIds: Id[], _ctx: MutationContext): Promise<void> {
    return notInPhase0('restoreRows')
  }
  addHistory(
    _rowId: Id,
    _entry: Omit<HistoryEntry, 'id' | 'rowId'>,
    _ctx: MutationContext,
  ): Promise<HistoryEntry> {
    return notInPhase0('addHistory')
  }
  createSheet(
    _memberId: Id,
    _input: { name: string; template: TemplateKey },
    _ctx: MutationContext,
  ): Promise<Sheet> {
    return notInPhase0('createSheet')
  }
  updateSheet(
    _sheetId: Id,
    _patch: Partial<Pick<Sheet, 'name' | 'stages'>>,
    _ctx: MutationContext,
  ): Promise<Sheet> {
    return notInPhase0('updateSheet')
  }
  deleteSheet(_sheetId: Id, _ctx: MutationContext): Promise<void> {
    return notInPhase0('deleteSheet')
  }
  addColumn(
    _sheetId: Id,
    _column: Omit<ColumnDef, 'id' | 'position'>,
    _ctx: MutationContext,
  ): Promise<Sheet> {
    return notInPhase0('addColumn')
  }
  updateColumn(
    _sheetId: Id,
    _columnId: Id,
    _patch: Partial<ColumnDef>,
    _ctx: MutationContext,
  ): Promise<Sheet> {
    return notInPhase0('updateColumn')
  }
  deleteColumn(_sheetId: Id, _columnId: Id, _ctx: MutationContext): Promise<Sheet> {
    return notInPhase0('deleteColumn')
  }
  reorderColumns(_sheetId: Id, _columnIds: Id[], _ctx: MutationContext): Promise<Sheet> {
    return notInPhase0('reorderColumns')
  }
  createTag(
    _input: Pick<Tag, 'name'> & Partial<Pick<Tag, 'colour'>>,
    _ctx: MutationContext,
  ): Promise<Tag> {
    return notInPhase0('createTag')
  }
  updateTag(
    _tagId: Id,
    _patch: Partial<Pick<Tag, 'name' | 'colour'>>,
    _ctx: MutationContext,
  ): Promise<Tag> {
    return notInPhase0('updateTag')
  }
  deleteTag(_tagId: Id, _ctx: MutationContext): Promise<void> {
    return notInPhase0('deleteTag')
  }
  createMember(_input: Pick<Member, 'name' | 'email'>, _ctx: MutationContext): Promise<Member> {
    return notInPhase0('createMember')
  }
  findDuplicates(_values: NewRowInput['values']): Promise<DuplicateCandidate[]> {
    return notInPhase0('findDuplicates')
  }
  markNotDuplicate(_rowIdA: Id, _rowIdB: Id, _ctx: MutationContext): Promise<void> {
    return notInPhase0('markNotDuplicate')
  }
  importRows(_batch: ImportBatch, _ctx: MutationContext): Promise<Row[]> {
    return notInPhase0('importRows')
  }
  listTrash(): Promise<TrashItem[]> {
    return notInPhase0('listTrash')
  }
}

/** Rejects (rather than throws synchronously) so callers see a failed promise either way. */
function notInPhase0(method: string): Promise<never> {
  return Promise.reject(new NotImplementedInPhase0(method))
}
