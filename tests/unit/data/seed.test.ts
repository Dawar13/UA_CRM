import { describe, expect, it } from 'vitest'
import { buildSeed, istInstant, SEED_VERSION, seedIds } from '@/data/local/seed'
import { matchEventToRows } from '@/domain/calendar/events'
import { formatFuzzyDate, isOverdue, isToday, istDateOf } from '@/domain/dates'
import { validateRowFields } from '@/domain/fields'
import { normaliseEmail, normalisePhone } from '@/domain/identity'
import {
  calendarEventSchema,
  historyEntrySchema,
  memberSchema,
  rowSchema,
  sheetSchema,
  tagSchema,
} from '@/domain/schemas'
import { isWon } from '@/domain/stages'
import type { Row, Sheet } from '@/domain/types'

const NOW = new Date('2026-11-05T10:00:00+05:30')
const seed = buildSeed()
const sheetById = new Map(seed.sheets.map((s) => [s.id, s]))
const rowById = new Map(seed.rows.map((r) => [r.id, r]))

function sheetOf(row: Row): Sheet {
  const sheet = sheetById.get(row.sheetId)
  if (!sheet) throw new Error(`No sheet for ${row.id}`)
  return sheet
}

function rowsOf(sheetId: string): Row[] {
  return seed.rows.filter((r) => r.sheetId === sheetId)
}

describe('seed', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(buildSeed())).toBe(JSON.stringify(seed))
    expect(SEED_VERSION).toBeGreaterThanOrEqual(1)
  })

  it('validates every entity against the Zod schemas', () => {
    for (const m of seed.members) expect(memberSchema.parse(m)).toEqual(m)
    for (const s of seed.sheets) expect(sheetSchema.parse(s)).toEqual(s)
    for (const t of seed.tags) expect(tagSchema.parse(t)).toEqual(t)
    for (const r of seed.rows) expect(rowSchema.parse(r)).toEqual(r)
    for (const h of seed.history) expect(historyEntrySchema.parse(h)).toEqual(h)
    for (const e of seed.calendarEvents) expect(calendarEventSchema.parse(e)).toEqual(e)
  })

  it('fills custom fields that validate against each sheet', () => {
    for (const row of seed.rows) {
      const result = validateRowFields(row, sheetOf(row))
      expect(result.errors, row.id).toEqual([])
    }
  })

  it('stores currency fields in rupees', () => {
    const rohan = rowById.get(seedIds.rows.rohanMehta)
    expect(rohan?.fields.ticketEstimate).toBe(2_500_000)
    const ananya = rowById.get(seedIds.rows.ananyaKrishnan)
    expect(ananya?.fields.chequeSize).toBe(15_000_000)
  })

  it('has two members with the expected sheets and row counts', () => {
    expect(seed.members.map((m) => [m.id, m.slug, m.email, m.position])).toEqual([
      ['m-dawar', 'dawar', 'dawar@utopianautonomy.example', 0],
      ['m-dhruv', 'dhruv', 'dhruv@utopianautonomy.example', 1],
    ])
    const layout = seed.sheets.map((s) => [
      s.memberId,
      s.position,
      s.slug,
      s.name,
      rowsOf(s.id).length,
    ])
    expect(layout).toEqual([
      ['m-dawar', 0, 'customers', 'Customers', 12],
      ['m-dawar', 1, 'investors', 'Investors', 6],
      ['m-dawar', 2, 'advisors', 'Advisors and experts', 3],
      ['m-dawar', 3, 'connectors', 'Connectors', 6],
      ['m-dawar', 4, 'service-providers', 'Service providers', 4],
      ['m-dhruv', 0, 'customers', 'Customers', 5],
      ['m-dhruv', 1, 'investors', 'Investors', 5],
      ['m-dhruv', 2, 'connectors', 'Connectors', 4],
    ])
    for (const sheet of seed.sheets) {
      expect(rowsOf(sheet.id).map((r) => r.position)).toEqual(rowsOf(sheet.id).map((_, i) => i))
    }
  })

  it('gives every id in seedIds a matching entity', () => {
    for (const id of Object.values(seedIds.rows)) expect(rowById.has(id), id).toBe(true)
    for (const id of Object.values(seedIds.sheets)) expect(sheetById.has(id), id).toBe(true)
    const tagIds = new Set(seed.tags.map((t) => t.id))
    for (const id of Object.values(seedIds.tags)) expect(tagIds.has(id), id).toBe(true)
    const eventIds = new Set(seed.calendarEvents.map((e) => e.id))
    for (const id of Object.values(seedIds.events)) expect(eventIds.has(id), id).toBe(true)
    expect(Object.keys(seedIds.rows)).toHaveLength(seed.rows.length)
  })

  it('keeps ids unique', () => {
    const all = [
      ...seed.members.map((m) => m.id),
      ...seed.sheets.map((s) => s.id),
      ...seed.sheets.flatMap((s) => s.columns.map((c) => c.id)),
      ...seed.sheets.flatMap((s) => s.stages.map((st) => st.id)),
      ...seed.tags.map((t) => t.id),
      ...seed.rows.map((r) => r.id),
      ...seed.history.map((h) => h.id),
      ...seed.calendarEvents.map((e) => e.id),
    ]
    expect(new Set(all).size).toBe(all.length)
  })

  it('sets row ownership from the sheet', () => {
    for (const row of seed.rows) {
      const owner = sheetOf(row).memberId
      expect([row.memberId, row.createdBy, row.updatedBy]).toEqual([owner, owner, owner])
      expect(row.deletedAt).toBeNull()
    }
  })

  it('covers every warmth value and some rows without one', () => {
    const warmths = new Set(seed.rows.map((r) => r.warmth))
    expect(warmths).toEqual(new Set(['warm', 'waiting', 'cold', null]))
    expect(seed.rows.filter((r) => r.warmth === null).length).toBeGreaterThanOrEqual(3)
  })

  it("reaches every Customers stage in Dawar's sheet", () => {
    const sheet = sheetById.get(seedIds.sheets.dawarCustomers) as Sheet
    expect(sheet.stages.map((s) => s.name)).toEqual([
      'Identified',
      'Intro asked',
      'First call',
      'Plant visit',
      'Pilot scoped',
      'Pilot live',
      'Paid',
    ])
    const current = new Set(rowsOf(sheet.id).map((r) => r.stageIndex))
    for (let i = 0; i < sheet.stages.length; i++) expect(current.has(i), `stage ${i}`).toBe(true)
  })

  it('has exactly one won row and two lost rows', () => {
    const won = seed.rows.filter((r) => isWon(r, sheetOf(r)))
    expect(won.map((r) => r.id)).toEqual([seedIds.wonRow])
    const lost = seed.rows.filter((r) => r.lost !== null)
    expect(lost.map((r) => r.id)).toEqual([...seedIds.lostRows])
    for (const row of lost) expect(row.lost?.stageIndex).toBe(row.stageIndex)
  })

  it('has one row whose earlier stages were skipped', () => {
    const skipped = seed.rows.filter((r) => Object.values(r.stageDates).some((d) => d === null))
    expect(skipped.map((r) => r.id)).toEqual([seedIds.skippedStagesRow])
    const row = skipped[0] as Row
    const sheet = sheetOf(row)
    expect(row.stageIndex).toBe(3)
    expect(sheet.stages.slice(0, 3).map((s) => row.stageDates[s.id])).toEqual([null, null, null])
    expect(row.stageDates[sheet.stages[3]?.id ?? '']).toBe('2026-10-23')
  })

  it('keeps stage dates consistent with the stage index', () => {
    for (const row of seed.rows) {
      const sheet = sheetOf(row)
      const keys = Object.keys(row.stageDates)
      if (row.stageIndex === null) {
        expect(keys, row.id).toEqual([])
        continue
      }
      expect(keys, row.id).toEqual(sheet.stages.slice(0, row.stageIndex + 1).map((s) => s.id))
      expect(row.stageDates[sheet.stages[row.stageIndex]?.id ?? ''], row.id).not.toBeNull()
    }
  })

  it('includes fuzzy dates', () => {
    const fuzzy = seed.history.flatMap((h) =>
      h.fuzzyDate ? [formatFuzzyDate(h.fuzzyDate, NOW)] : [],
    )
    expect(fuzzy).toEqual(expect.arrayContaining(['Mid Oct', 'Late Oct']))
    const nextFuzzy = seed.rows.filter(
      (r) => r.nextAction?.date && r.nextAction.date.precision !== 'day',
    )
    expect(nextFuzzy.length).toBeGreaterThanOrEqual(3)
  })

  it('has one overdue next action, one due today and several in the future', () => {
    const withDates = seed.rows.filter((r) => r.nextAction?.date)
    const overdue = withDates.filter((r) => r.nextAction?.date && isOverdue(r.nextAction.date, NOW))
    const today = withDates.filter((r) => r.nextAction?.date && isToday(r.nextAction.date, NOW))
    expect(overdue.map((r) => r.id)).toEqual([seedIds.overdueRow])
    expect(overdue[0]?.nextAction?.date).toEqual({ date: '2026-11-03', precision: 'day' })
    expect(today.map((r) => r.id)).toEqual([seedIds.dueTodayRow])
    const future = withDates.length - overdue.length - today.length
    expect(future).toBeGreaterThanOrEqual(5)
    const exactFuture = withDates.filter(
      (r) => r.nextAction?.date?.precision === 'day' && r.nextAction.date.date > '2026-11-05',
    )
    expect(exactFuture.length).toBeGreaterThanOrEqual(3)
  })

  it('stores Indian phone numbers in E.164 and .example emails', () => {
    const phones = new Map<string, string[]>()
    for (const row of seed.rows) {
      expect(row.phone, row.id).toMatch(/^\+9198\d{8}$/)
      expect(normalisePhone(row.phone), row.id).toBe(row.phone)
      phones.set(row.phone, [...(phones.get(row.phone) ?? []), row.id])
      expect(normaliseEmail(row.email), row.id).toBe(row.email)
      expect(row.email.endsWith('.example'), row.id).toBe(true)
    }
    const shared = [...phones.values()].filter((ids) => ids.length > 1)
    expect(shared).toEqual([[seedIds.arvindMenon.dawar, seedIds.arvindMenon.dhruv]])
    for (const m of seed.members) expect(m.email.endsWith('.example')).toBe(true)
  })

  it('spreads eight tags with distinct colours across sheets', () => {
    expect(seed.tags).toHaveLength(8)
    expect(new Set(seed.tags.map((t) => t.colour)).size).toBe(8)
    expect(seed.tags.map((t) => t.colour)).toEqual([
      'indigo',
      'violet',
      'pink',
      'orange',
      'amber',
      'lime',
      'teal',
      'slate',
    ])
    for (const tag of seed.tags) {
      const sheets = new Set(
        seed.rows.filter((r) => r.tagIds.includes(tag.id)).map((r) => r.sheetId),
      )
      expect(sheets.size, tag.name).toBeGreaterThanOrEqual(1)
    }
    const taggedSheets = new Set(seed.rows.filter((r) => r.tagIds.length > 0).map((r) => r.sheetId))
    expect(taggedSheets.size).toBeGreaterThanOrEqual(6)
  })

  it('links rows through Introduced by and Connects to', () => {
    const introRows = seed.rows.filter((r) => r.introducedBy?.kind === 'row')
    const connectRows = seed.rows.flatMap((r) => r.connectsTo.filter((l) => l.kind === 'row'))
    const freeText = seed.rows.flatMap((r) => r.connectsTo.filter((l) => l.kind === 'text'))
    expect(introRows.length).toBeGreaterThanOrEqual(3)
    expect(connectRows.length).toBeGreaterThanOrEqual(3)
    expect(freeText.length).toBeGreaterThanOrEqual(1)
    for (const row of seed.rows) {
      const links = [...row.connectsTo, ...(row.introducedBy ? [row.introducedBy] : [])]
      for (const link of links) {
        if (link.kind === 'row') {
          expect(rowById.has(link.rowId), `${row.id} → ${link.rowId}`).toBe(true)
          expect(link.rowId).not.toBe(row.id)
        }
      }
    }
    // At least one link crosses member tabs.
    const kiran = rowById.get(seedIds.crossTabIntroRow) as Row
    const intro = kiran.introducedBy
    expect(intro?.kind).toBe('row')
    if (intro?.kind === 'row') expect(rowById.get(intro.rowId)?.memberId).not.toBe(kiran.memberId)
  })

  it('has the cross-tab Arvind Menon pair with the same phone', () => {
    const a = rowById.get(seedIds.arvindMenon.dawar) as Row
    const b = rowById.get(seedIds.arvindMenon.dhruv) as Row
    expect([a.name, a.sheetId, a.memberId]).toEqual([
      'Cdr Arvind Menon',
      seedIds.sheets.dawarConnectors,
      seedIds.members.dawar,
    ])
    expect([b.name, b.sheetId, b.memberId]).toEqual([
      'Arvind Menon',
      seedIds.sheets.dhruvInvestors,
      seedIds.members.dhruv,
    ])
    expect(a.phone).toBe(b.phone)
  })

  it('gives every row 1 to 6 history entries between 1 Oct and 5 Nov 2026', () => {
    const start = istInstant('2026-10-01', '00:00')
    const end = NOW.toISOString()
    const kinds = new Set<string>()
    for (const row of seed.rows) {
      const entries = seed.history.filter((h) => h.rowId === row.id)
      expect(entries.length, row.id).toBeGreaterThanOrEqual(1)
      expect(entries.length, row.id).toBeLessThanOrEqual(6)
      const ats = entries.map((h) => h.at).sort()
      expect(ats[0] && ats[0] >= start, row.id).toBe(true)
      expect(ats[ats.length - 1] && (ats[ats.length - 1] as string) < end, row.id).toBe(true)
      expect(row.lastTouchAt).toBe(ats[ats.length - 1])
      expect(row.createdAt).toBe(ats[0])
      for (const h of entries) {
        kinds.add(h.kind)
        expect(h.memberId).toBe(row.memberId)
        expect(h.source).toBe(
          ['stage', 'created', 'imported'].includes(h.kind) ? 'system' : 'manual',
        )
        // IST working hours.
        const hour = Number(
          new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            hourCycle: 'h23',
            timeZone: 'Asia/Kolkata',
          }).format(new Date(h.at)),
        )
        expect(hour, h.id).toBeGreaterThanOrEqual(9)
        expect(hour, h.id).toBeLessThan(19)
      }
    }
    expect(kinds).toEqual(
      new Set(['created', 'imported', 'call', 'meeting', 'whatsapp', 'email', 'note', 'stage']),
    )
  })

  it('keeps stage history consistent with stage dates', () => {
    for (const row of seed.rows) {
      const sheet = sheetOf(row)
      const moves = seed.history
        .filter((h) => h.rowId === row.id && h.kind === 'stage' && h.meta?.toStageIndex != null)
        .sort((a, b) => a.at.localeCompare(b.at))
      const lastMove = moves[moves.length - 1]
      if (!lastMove) continue
      expect(lastMove.meta?.toStageIndex, row.id).toBe(row.stageIndex)
      const stageId = sheet.stages[row.stageIndex ?? 0]?.id ?? ''
      expect(istDateOf(lastMove.at), row.id).toBe(row.stageDates[stageId])
      const lostEntry = seed.history.find((h) => h.rowId === row.id && h.meta?.lost)
      if (row.lost) expect(istDateOf(lostEntry?.at ?? ''), row.id).toBe(row.lost.date)
      else expect(lostEntry, row.id).toBeUndefined()
    }
  })

  it('has 8 sample events per member in IST working hours, 3 matching seeded rows', () => {
    for (const member of seed.members) {
      const events = seed.calendarEvents.filter((e) => e.memberId === member.id)
      expect(events).toHaveLength(8)
      const memberRows = seed.rows
      const matched = events.filter((e) => matchEventToRows(e, memberRows).length > 0)
      expect(matched, member.name).toHaveLength(3)
      for (const e of events) {
        expect(e.source).toBe('sample')
        expect(e.end > e.start).toBe(true)
        expect(e.start >= istInstant('2026-11-05', '09:00')).toBe(true)
        expect(e.end <= istInstant('2026-11-20', '19:00')).toBe(true)
        expect(e.start.endsWith('Z')).toBe(true)
      }
      const upcomingToday = events.filter(
        (e) => istDateOf(e.start) === '2026-11-05' && e.start > NOW.toISOString(),
      )
      expect(upcomingToday.length, member.name).toBeGreaterThanOrEqual(1)
    }
    const dawarMatch = seed.calendarEvents.find((e) => e.id === seedIds.events.dawarMatched)
    expect(dawarMatch && matchEventToRows(dawarMatch, seed.rows).map((r) => r.id)).toEqual([
      seedIds.rows.rohanMehta,
    ])
    const dhruvMatch = seed.calendarEvents.find((e) => e.id === seedIds.events.dhruvMatched)
    expect(dhruvMatch && matchEventToRows(dhruvMatch, seed.rows).map((r) => r.id)).toEqual([
      seedIds.arvindMenon.dhruv,
    ])
  })
})
