import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UaCrmDb } from '@/data/local/db'
import { LocalRepository, RowNotFoundError } from '@/data/local/LocalRepository'
import { PERF_ROW_COUNT, PERF_SHEET_SLUG } from '@/data/local/perfSheet'
import { buildSeed, istInstant, SEED_VERSION, seedIds } from '@/data/local/seed'
import { validateRowFields } from '@/domain/fields'
import { rowSchema } from '@/domain/schemas'
import { snapshotStage } from '@/domain/stages'
import type { Row, Sheet } from '@/domain/types'

const NOW = new Date('2026-11-05T10:00:00+05:30')
const DAWAR = seedIds.members.dawar
const DHRUV = seedIds.members.dhruv
const ctx = { actorId: DAWAR, now: NOW }

let dbCounter = 0
let repo: LocalRepository

function freshRepo(): LocalRepository {
  dbCounter += 1
  return new LocalRepository(new UaCrmDb(`ua-crm-test-${dbCounter}-${Date.now()}`))
}

async function row(id: string): Promise<Row> {
  const found = await repo.getRow(id)
  if (!found) throw new Error(`Missing row ${id}`)
  return found
}

async function sheet(id: string): Promise<Sheet> {
  const found = await repo.getSheet(id)
  if (!found) throw new Error(`Missing sheet ${id}`)
  return found
}

beforeEach(async () => {
  repo = freshRepo()
  await repo.ensureSeeded()
})

afterEach(async () => {
  repo.db.close()
  await repo.db.delete()
})

describe('seeding', () => {
  it('seeds on first call and is idempotent', async () => {
    const seed = buildSeed()
    expect(await repo.db.rows.count()).toBe(seed.rows.length)
    expect(await repo.db.history.count()).toBe(seed.history.length)
    expect((await repo.db.meta.get('seedVersion'))?.value).toBe(SEED_VERSION)

    await repo.ensureSeeded()
    await Promise.all([repo.ensureSeeded(), repo.ensureSeeded()])
    expect(await repo.db.rows.count()).toBe(seed.rows.length)
    expect(await repo.db.history.count()).toBe(seed.history.length)
  })

  it('keeps existing data when another repository opens the same database', async () => {
    await repo.updateWarmth(seedIds.rows.hiteshPatel, 'cold', ctx)
    const other = new LocalRepository(new UaCrmDb(repo.db.name))
    await other.ensureSeeded()
    expect((await other.getRow(seedIds.rows.hiteshPatel))?.warmth).toBe('cold')
    other.db.close()
  })

  it('reseeds when the stored seed version is different', async () => {
    await repo.updateWarmth(seedIds.rows.hiteshPatel, 'cold', ctx)
    await repo.db.meta.put({ key: 'seedVersion', value: SEED_VERSION - 1 })
    const other = new LocalRepository(new UaCrmDb(repo.db.name))
    await other.ensureSeeded()
    expect((await other.getRow(seedIds.rows.hiteshPatel))?.warmth).toBeNull()
    expect((await other.db.meta.get('seedVersion'))?.value).toBe(SEED_VERSION)
    other.db.close()
  })

  it('resetSampleData restores the seed', { timeout: 30_000 }, async () => {
    await repo.updateStage(seedIds.rows.rohanMehta, 5, ctx)
    await repo.updateWarmth(seedIds.rows.rohanMehta, null, ctx)
    await repo.loadPerfSheet()
    await repo.resetSampleData()
    const seed = buildSeed()
    expect(await row(seedIds.rows.rohanMehta)).toEqual(
      seed.rows.find((r) => r.id === seedIds.rows.rohanMehta),
    )
    expect(await repo.db.rows.count()).toBe(seed.rows.length)
    expect(await repo.db.history.count()).toBe(seed.history.length)
    expect(await repo.db.sheets.count()).toBe(seed.sheets.length)
    // Search sees the reset data too.
    const [hit] = await repo.search('rohan mehta')
    expect(hit?.row.warmth).toBe('warm')
  })
})

describe('reads', () => {
  it('lists members in order', async () => {
    expect((await repo.listMembers()).map((m) => m.name)).toEqual(['Dawar', 'Dhruv'])
  })

  it('lists sheets per member in order and skips deleted ones', async () => {
    expect((await repo.listSheets(DAWAR)).map((s) => s.slug)).toEqual([
      'customers',
      'investors',
      'advisors',
      'connectors',
      'service-providers',
    ])
    expect((await repo.listSheets(DHRUV)).map((s) => s.name)).toEqual([
      'Customers',
      'Investors',
      'Connectors',
    ])
    await repo.db.sheets.update(seedIds.sheets.dhruvConnectors, { deletedAt: NOW.toISOString() })
    expect((await repo.listSheets(DHRUV)).map((s) => s.slug)).toEqual(['customers', 'investors'])
    expect(await repo.getSheet(seedIds.sheets.dhruvConnectors)).toBeUndefined()
    expect(await repo.listSheets('m-nobody')).toEqual([])
  })

  it('lists live rows sorted by position', async () => {
    const rows = await repo.listRows(seedIds.sheets.dawarCustomers)
    expect(rows).toHaveLength(12)
    expect(rows.map((r) => r.position)).toEqual([...Array(12).keys()])
    expect(rows[0]?.name).toBe('Rohan Mehta')

    await repo.db.rows.update(seedIds.rows.sunitaKulkarni, { deletedAt: NOW.toISOString() })
    const live = await repo.listRows(seedIds.sheets.dawarCustomers)
    expect(live.map((r) => r.id)).not.toContain(seedIds.rows.sunitaKulkarni)
    expect(await repo.getRow(seedIds.rows.sunitaKulkarni)).toBeUndefined()
    expect(await repo.getRowLocation(seedIds.rows.sunitaKulkarni)).toBeUndefined()
    expect(await repo.listRows('s-missing')).toEqual([])
  })

  it('counts live rows per sheet for one member', async () => {
    expect(await repo.countRows(DAWAR)).toEqual({
      [seedIds.sheets.dawarCustomers]: 12,
      [seedIds.sheets.dawarInvestors]: 6,
      [seedIds.sheets.dawarAdvisors]: 3,
      [seedIds.sheets.dawarConnectors]: 6,
      [seedIds.sheets.dawarServiceProviders]: 4,
    })
    await repo.db.rows.update(seedIds.rows.kavitaRao, { deletedAt: NOW.toISOString() })
    expect(await repo.countRows(DHRUV)).toEqual({
      [seedIds.sheets.dhruvCustomers]: 4,
      [seedIds.sheets.dhruvInvestors]: 5,
      [seedIds.sheets.dhruvConnectors]: 4,
    })
  })

  it('finds a row with its sheet and member across members', async () => {
    const dawar = await repo.getRowLocation(seedIds.arvindMenon.dawar)
    expect([dawar?.row.name, dawar?.sheet.name, dawar?.member.name]).toEqual([
      'Cdr Arvind Menon',
      'Connectors',
      'Dawar',
    ])
    const dhruv = await repo.getRowLocation(seedIds.arvindMenon.dhruv)
    expect([dhruv?.row.name, dhruv?.sheet.name, dhruv?.member.name]).toEqual([
      'Arvind Menon',
      'Investors',
      'Dhruv',
    ])
    expect(await repo.getRowLocation('r-missing')).toBeUndefined()
  })

  it('lists tags by name', async () => {
    const tags = await repo.listTags()
    expect(tags.map((t) => t.name)).toEqual([
      'decision maker',
      'defence',
      'EF network',
      'EV',
      'foundry',
      'IIT Bombay alumni',
      'intro pending',
      'pilot candidate',
    ])
  })

  it('lists history newest first', async () => {
    const history = await repo.listHistory(seedIds.rows.sunitaKulkarni)
    expect(history.map((h) => h.kind)).toEqual(['email', 'stage', 'meeting', 'call', 'created'])
    const ats = history.map((h) => h.at)
    expect(ats).toEqual([...ats].sort().reverse())
    expect(await repo.listHistory('r-missing')).toEqual([])
  })
})

describe('mutations', () => {
  it('moves a stage and appends history atomically', async () => {
    const before = await row(seedIds.rows.rohanMehta)
    const customers = await sheet(seedIds.sheets.dawarCustomers)
    const result = await repo.updateStage(before.id, 4, ctx)

    expect(result.row.stageIndex).toBe(4)
    expect(result.row.stageDates[customers.stages[4]?.id ?? '']).toBe('2026-11-05')
    // Plant visit was never reached, so it is done without a date.
    expect(result.row.stageDates[customers.stages[3]?.id ?? '']).toBeNull()
    expect(result.row.lastTouchAt).toBe(NOW.toISOString())
    expect(result.row.updatedAt).toBe(NOW.toISOString())
    expect(result.row.updatedBy).toBe(DAWAR)
    expect(result.history).toMatchObject({
      rowId: before.id,
      kind: 'stage',
      source: 'system',
      text: 'Stage: First call → Pilot scoped',
      memberId: DAWAR,
      meta: { fromStageIndex: 2, toStageIndex: 4 },
    })

    expect(await row(before.id)).toEqual(result.row)
    const history = await repo.listHistory(before.id)
    expect(history[0]).toEqual(result.history)
    expect(history).toHaveLength(5)
    expect(rowSchema.parse(result.row)).toEqual(result.row)
  })

  it('writes nothing when the history write fails', async () => {
    const before = await row(seedIds.rows.rohanMehta)
    const historyCount = await repo.db.history.count()
    const spy = vi.spyOn(repo.db.history, 'add').mockRejectedValueOnce(new Error('disk full'))
    await expect(repo.updateStage(before.id, 5, ctx)).rejects.toThrow('disk full')
    spy.mockRestore()
    expect(await row(before.id)).toEqual(before)
    expect(await repo.db.history.count()).toBe(historyCount)
  })

  it('writes nothing when the domain rejects the change', async () => {
    const before = await row(seedIds.rows.rohanMehta)
    await expect(repo.updateStage(before.id, 7, ctx)).rejects.toThrow(RangeError)
    await expect(repo.updateStage(seedIds.rows.krithikIyer, 0, ctx)).rejects.toThrow(RangeError)
    await expect(repo.reopen(before.id, ctx)).rejects.toThrow(RangeError)
    expect(await row(before.id)).toEqual(before)
    expect(await repo.listHistory(before.id)).toHaveLength(4)
  })

  it('rejects missing and deleted rows clearly', async () => {
    await expect(repo.updateStage('r-missing', 1, ctx)).rejects.toThrow(RowNotFoundError)
    await expect(repo.updateWarmth('r-missing', 'warm', ctx)).rejects.toThrow(
      'Row r-missing does not exist or has been deleted.',
    )
    await repo.db.rows.update(seedIds.rows.hiteshPatel, { deletedAt: NOW.toISOString() })
    await expect(repo.markLost(seedIds.rows.hiteshPatel, ctx)).rejects.toThrow(RowNotFoundError)
  })

  it('restores a stage snapshot exactly after moving back over dated stages', async () => {
    const before = await row(seedIds.rows.anilReddy)
    const snapshot = snapshotStage(before)
    const back = await repo.updateStage(before.id, 1, ctx)
    expect(Object.keys(back.row.stageDates)).toHaveLength(2)

    const restored = await repo.restoreStage(before.id, snapshot, ctx)
    expect(snapshotStage(restored.row)).toEqual(snapshot)
    expect(restored.history.meta?.undo).toBe(true)
    expect(snapshotStage(await row(before.id))).toEqual(snapshot)
  })

  it('restores a snapshot exactly after moving back over skipped stages', async () => {
    const before = await row(seedIds.skippedStagesRow)
    const snapshot = snapshotStage(before)
    await repo.updateStage(before.id, 0, ctx)
    await repo.updateStage(before.id, 5, ctx)
    const restored = await repo.restoreStage(before.id, snapshot, ctx)
    expect(snapshotStage(restored.row)).toEqual(snapshot)
  })

  it('marks lost, reopens and undoes lost', async () => {
    const id = seedIds.rows.rohanMehta
    const before = await row(id)
    const lost = await repo.markLost(id, ctx)
    expect(lost.row.lost).toEqual({ stageIndex: 2, date: '2026-11-05' })
    expect(lost.history.text).toBe('Marked lost after First call')
    await expect(repo.markLost(id, ctx)).rejects.toThrow(RangeError)

    const reopened = await repo.reopen(id, ctx)
    expect(reopened.row.lost).toBeNull()
    expect(reopened.row.stageIndex).toBe(2)
    expect(reopened.history.text).toBe('Reopened at First call')

    const lostAgain = await repo.markLost(id, ctx)
    const undone = await repo.restoreStage(id, snapshotStage(before), ctx)
    expect(undone.row.lost).toBeNull()
    expect(snapshotStage(undone.row)).toEqual(snapshotStage(before))

    const history = await repo.listHistory(id)
    expect(history.slice(0, 4).map((h) => h.id)).toEqual([
      undone.history.id,
      lostAgain.history.id,
      reopened.history.id,
      lost.history.id,
    ])
  })

  it('sets warmth and undoes it with an undo entry', async () => {
    const id = seedIds.rows.sunitaKulkarni
    const set = await repo.updateWarmth(id, 'cold', ctx)
    expect(set.row.warmth).toBe('cold')
    expect(set.history).toMatchObject({
      kind: 'warmth',
      text: 'Warmth: Waiting → Cold',
      meta: { fromWarmth: 'waiting', toWarmth: 'cold' },
    })
    const undo = await repo.updateWarmth(id, 'waiting', ctx, { undo: true })
    expect(undo.row.warmth).toBe('waiting')
    expect(undo.history.meta?.undo).toBe(true)
    const cleared = await repo.updateWarmth(id, null, ctx)
    expect(cleared.history.text).toBe('Warmth cleared')
    expect((await row(id)).warmth).toBeNull()
  })

  it('keeps history strictly ordered when the clock is frozen', async () => {
    const id = seedIds.rows.hiteshPatel
    const a = await repo.updateWarmth(id, 'warm', ctx)
    const b = await repo.updateWarmth(id, null, ctx, { undo: true })
    const c = await repo.updateStage(id, 1, ctx)
    expect(a.history.at < b.history.at).toBe(true)
    expect(b.history.at < c.history.at).toBe(true)
    expect(c.row.lastTouchAt).toBe(c.history.at)
    const history = await repo.listHistory(id)
    expect(history.slice(0, 3).map((h) => h.id)).toEqual([c.history.id, b.history.id, a.history.id])
  })
})

describe('search', () => {
  it('returns nothing for a blank query', async () => {
    expect(await repo.search('')).toEqual([])
    expect(await repo.search('   ')).toEqual([])
    expect(await repo.search('—')).toEqual([])
  })

  it('finds both Arvind Menon rows with their member and sheet', async () => {
    const results = await repo.search('menon')
    const top = results.slice(0, 2)
    expect(top.map((r) => r.row.id).sort()).toEqual(
      [seedIds.arvindMenon.dawar, seedIds.arvindMenon.dhruv].sort(),
    )
    const labels = top.map((r) => `${r.member.name} · ${r.sheet.name}`).sort()
    expect(labels).toEqual(['Dawar · Connectors', 'Dhruv · Investors'])
    for (const r of top) expect(r.matchedField).toBe('name')
  })

  it('matches phone digits in several forms', async () => {
    for (const q of ['98450', '9845012345', '+91 98450 12345', '098450 12345', '919845012345']) {
      const [first] = await repo.search(q)
      expect(first?.row.id, q).toBe(seedIds.rows.rohanMehta)
      expect(first?.matchedField, q).toBe('phone')
    }
    const [hit] = await repo.search('98450')
    expect(hit?.matchedText).toBe('+91 98450 12345')
    const shared = await repo.search('9820334567')
    expect(shared.map((r) => r.row.id).sort()).toEqual(
      [seedIds.arvindMenon.dawar, seedIds.arvindMenon.dhruv].sort(),
    )
  })

  it('matches tag names', async () => {
    const results = await repo.search('pilot candidate')
    const ids = results.map((r) => r.row.id)
    expect(ids).toEqual(
      expect.arrayContaining([seedIds.rows.rohanMehta, seedIds.rows.sunitaKulkarni]),
    )
    const sunita = results.find((r) => r.row.id === seedIds.rows.sunitaKulkarni)
    expect(sunita?.matchedField).toBe('tags')
    expect(sunita?.matchedText).toBe('pilot candidate')
  })

  it('matches company, title, email, notes and connects to', async () => {
    const [company] = await repo.search('deccan')
    expect([company?.row.id, company?.matchedField]).toEqual([
      seedIds.rows.sunitaKulkarni,
      'company',
    ])
    const [title] = await repo.search('purchase head')
    expect([title?.row.id, title?.matchedField]).toEqual([seedIds.rows.priyaNair, 'title'])
    const [email] = await repo.search('sunita@deccancastings')
    expect(email?.row.id).toBe(seedIds.rows.sunitaKulkarni)
    const [notes] = await repo.search('heading lines')
    expect([notes?.row.id, notes?.matchedField]).toEqual([seedIds.rows.rohanMehta, 'notes'])
    const [free] = await repo.search('naval dockyard')
    expect([free?.row.id, free?.matchedField, free?.matchedText]).toEqual([
      seedIds.arvindMenon.dawar,
      'connectsTo',
      'Naval dockyard suppliers',
    ])
    const viaLink = await repo.search('rohan')
    expect(viaLink[0]?.row.id).toBe(seedIds.rows.rohanMehta)
    const krithik = viaLink.find((r) => r.row.id === seedIds.rows.krithikIyer)
    expect([krithik?.matchedField, krithik?.matchedText]).toEqual(['connectsTo', 'Rohan Mehta'])
  })

  it('requires every token to match, by prefix, across fields', async () => {
    const [both] = await repo.search('rohan hosur')
    expect(both?.row.id).toBe(seedIds.rows.rohanMehta)
    expect((await repo.search('rohan pune')).map((r) => r.row.id)).not.toContain(
      seedIds.rows.rohanMehta,
    )
    const [prefix] = await repo.search('kulk')
    expect(prefix?.row.id).toBe(seedIds.rows.sunitaKulkarni)
    expect(await repo.search('zzzz')).toEqual([])
  })

  it('ranks name over company and orders ties by name', async () => {
    const results = await repo.search('foundry')
    expect(results.length).toBeGreaterThan(2)
    const scores = results.map((r) => r.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    const naveen = results.find((r) => r.row.id === seedIds.rows.naveenGowda)
    const sunita = results.find((r) => r.row.id === seedIds.rows.sunitaKulkarni)
    expect(naveen?.matchedField).toBe('company')
    expect((naveen?.score ?? 0) > (sunita?.score ?? 0)).toBe(true)
  })

  it('respects the limit and sees mutations', async () => {
    expect(await repo.search('a', { limit: 3 })).toHaveLength(3)
    await repo.updateWarmth(seedIds.rows.rohanMehta, 'cold', ctx)
    const [hit] = await repo.search('rohan mehta')
    expect(hit?.row.warmth).toBe('cold')
  })
})

describe('calendar', () => {
  it('lists one member’s events overlapping the range, sorted by start', async () => {
    const today = await repo.listCalendarEvents(DAWAR, {
      from: istInstant('2026-11-05', '00:00'),
      to: istInstant('2026-11-06', '00:00'),
    })
    expect(today.map((e) => e.id)).toEqual(['e-dawar-01', 'e-dawar-02'])

    const all = await repo.listCalendarEvents(DHRUV, {
      from: '2026-11-05T00:00:00+05:30',
      to: '2026-11-21T00:00:00+05:30',
    })
    expect(all).toHaveLength(8)
    expect(all.every((e) => e.memberId === DHRUV)).toBe(true)
    expect(all.map((e) => e.start)).toEqual(all.map((e) => e.start).sort())
  })

  it('includes events in progress and excludes events at the exclusive end', async () => {
    const midway = await repo.listCalendarEvents(DAWAR, {
      from: istInstant('2026-11-05', '12:00'),
      to: istInstant('2026-11-05', '16:00'),
    })
    expect(midway.map((e) => e.id)).toEqual(['e-dawar-01'])
    const none = await repo.listCalendarEvents(DAWAR, {
      from: istInstant('2026-11-21', '00:00'),
      to: istInstant('2026-12-01', '00:00'),
    })
    expect(none).toEqual([])
  })
})

describe('member-wide reads', () => {
  it('lists one member’s live rows across every sheet', async () => {
    const rows = await repo.listMemberRows(DAWAR)
    const counts = await repo.countRows(DAWAR)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(rows).toHaveLength(total)
    expect(rows.every((r) => r.memberId === DAWAR && r.deletedAt === null)).toBe(true)
  })

  it('lists one member’s history in a range, oldest first, and sees mutations', async () => {
    const range = {
      from: new Date('2026-10-07T00:00:00+05:30').toISOString(),
      to: new Date('2026-11-06T00:00:00+05:30').toISOString(),
    }
    const before = await repo.listMemberHistory(DAWAR, range)
    expect(before.length).toBeGreaterThan(0)
    const dawarRows = new Set((await repo.listMemberRows(DAWAR)).map((r) => r.id))
    expect(before.every((h) => dawarRows.has(h.rowId))).toBe(true)
    expect(before.every((h) => h.at >= range.from && h.at < range.to)).toBe(true)
    expect(before.map((h) => h.at)).toEqual([...before.map((h) => h.at)].sort())

    const target = (await repo.listMemberRows(DAWAR)).find((r) => r.warmth !== 'cold')
    if (!target) throw new Error('Expected a row')
    await repo.updateWarmth(target.id, 'cold', ctx)
    const after = await repo.listMemberHistory(DAWAR, range)
    expect(after).toHaveLength(before.length + 1)
    const dhruvHistory = await repo.listMemberHistory(DHRUV, range)
    expect(dhruvHistory.some((h) => dawarRows.has(h.rowId))).toBe(false)
  })
})

describe('perf sheet', () => {
  it('adds a valid 2,000-row Customers sheet for the first member, once', {
    timeout: 30_000,
  }, async () => {
    const sheet = await repo.loadPerfSheet()
    expect([sheet.id, sheet.slug, sheet.name, sheet.memberId, sheet.position]).toEqual([
      seedIds.perfSheet,
      PERF_SHEET_SLUG,
      'Customers (2,000)',
      DAWAR,
      5,
    ])
    const rows = await repo.listRows(sheet.id)
    expect(rows).toHaveLength(PERF_ROW_COUNT)
    expect(rows.map((r) => r.position)).toEqual([...Array(PERF_ROW_COUNT).keys()])
    expect(new Set(rows.map((r) => r.name)).size).toBe(PERF_ROW_COUNT)
    for (const r of rows) {
      rowSchema.parse(r)
      expect(validateRowFields(r, sheet).errors).toEqual([])
    }
    expect((await repo.countRows(DAWAR))[sheet.id]).toBe(PERF_ROW_COUNT)

    const historyCount = await repo.db.history.count()
    const again = await repo.loadPerfSheet()
    expect(again.position).toBe(5)
    expect(await repo.db.rows.where('sheetId').equals(sheet.id).count()).toBe(PERF_ROW_COUNT)
    expect(await repo.db.history.count()).toBe(historyCount)
    expect((await repo.listSheets(DAWAR)).map((s) => s.slug)).toContain(PERF_SHEET_SLUG)
  })

  it('keeps search fast over about 2,050 rows', { timeout: 30_000 }, async () => {
    await repo.loadPerfSheet()
    await repo.search('warm')
    const started = performance.now()
    const results = await repo.search('pune castings')
    const elapsed = performance.now() - started
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(50)
    expect(elapsed).toBeLessThan(1500)
    const menon = await repo.search('menon')
    expect(menon.slice(0, 2).every((r) => r.row.name.includes('Arvind Menon'))).toBe(true)
  })
})
