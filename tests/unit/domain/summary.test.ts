import { describe, expect, it } from 'vitest'
import { conversion, recencyOf, summariseSheet } from '@/domain/summary'
import type { Row } from '@/domain/types'
import { makeRow, makeSheet, now, sid } from './_fixtures'

const customers = makeSheet('customers')
const connectors = makeSheet('connectors')
const ticket = customers.columns.find((c) => c.type === 'currency')

function customer(id: string, overrides: Partial<Row>): Row {
  return makeRow({ id, name: `Person ${id}`, ...overrides })
}

describe('recencyOf', () => {
  it('shades by how recently someone was touched', () => {
    expect(recencyOf(null, now)).toBe(0)
    expect(recencyOf('2026-11-04T10:00:00.000Z', now)).toBe(2)
    expect(recencyOf('2026-10-29T10:00:00.000Z', now)).toBe(2)
    expect(recencyOf('2026-10-27T10:00:00.000Z', now)).toBe(1)
    expect(recencyOf('2026-10-22T10:00:00.000Z', now)).toBe(1)
    expect(recencyOf('2026-10-20T10:00:00.000Z', now)).toBe(0)
  })
})

describe('summariseSheet with stages', () => {
  if (!ticket) throw new Error('Customers has a currency column')
  const rows: Row[] = [
    customer('a', {
      warmth: 'warm',
      stageIndex: 2,
      stageDates: {
        [sid(customers, 0)]: '2026-10-02',
        [sid(customers, 1)]: '2026-10-08',
        [sid(customers, 2)]: '2026-10-21',
      },
      fields: { [ticket.key]: 2_500_000 },
      lastTouchAt: '2026-11-02T10:00:00.000Z',
      nextAction: { text: 'Send ROI note', date: { date: '2026-11-05', precision: 'day' } },
    }),
    customer('b', {
      warmth: 'cold',
      stageIndex: null,
      lost: { stageIndex: 3, date: '2026-11-02' },
      fields: { [ticket.key]: 1_000_000 },
      nextAction: { text: 'Old', date: { date: '2026-10-01', precision: 'day' } },
    }),
    customer('c', {
      warmth: 'waiting',
      stageIndex: 6,
      fields: { [ticket.key]: 3_000_000 },
      nextAction: { text: 'Overdue', date: { date: '2026-11-03', precision: 'day' } },
    }),
    customer('d', { stageIndex: 0 }),
    customer('e', { stageIndex: null }),
  ]
  const summary = summariseSheet(customers, rows, now)

  it('counts people, warmth, won, lost and open', () => {
    expect(summary.people).toBe(5)
    expect(summary.warmth).toEqual({ warm: 1, waiting: 1, cold: 1, none: 2 })
    expect(summary.won).toBe(1)
    expect(summary.lost).toBe(1)
    expect(summary.open).toBe(3)
  })

  it('totals the first currency column for open and won rows, skipping lost ones', () => {
    expect(summary.value?.column.key).toBe(ticket.key)
    expect(summary.value?.open).toBe(2_500_000)
    expect(summary.value?.won).toBe(3_000_000)
  })

  it('counts next actions due today and overdue, ignoring lost rows', () => {
    expect(summary.due).toEqual({ overdue: 1, today: 1 })
  })

  it('counts everyone who reached each stage; lost rows count up to where they stopped', () => {
    expect(summary.stages.map((s) => s.reached)).toEqual([4, 3, 3, 2, 1, 1, 1])
    expect(summary.stages[2]?.here.map((p) => p.id)).toEqual(['a'])
    expect(summary.stages[3]?.here).toEqual([])
    expect(summary.stages[6]?.isWin).toBe(true)
    expect(summary.lostPeople.map((p) => p.id)).toEqual(['b'])
    // b was lost at Plant visit (stage 4): counted there as stopped, not as here.
    expect(summary.stages.map((s) => s.stopped)).toEqual([0, 0, 0, 1, 0, 0, 0])
    expect(summary.groups).toBeNull()
  })

  it('gives each person a recency shade', () => {
    expect(summary.stages[2]?.here[0]).toEqual({
      id: 'a',
      name: 'Person a',
      warmth: 'warm',
      recency: 2,
    })
  })

  it('counts rows touched in the last seven days', () => {
    expect(summary.touchedThisWeek).toBe(1)
  })

  it('works out the share that moved on between stages', () => {
    expect(conversion(summary.stages, 0)).toBe(75)
    expect(conversion(summary.stages, 6)).toBeNull()
  })
})

describe('summariseSheet without stages', () => {
  const relationship = connectors.columns.find((c) => c.type === 'dropdown')
  if (!relationship) throw new Error('Connectors has a dropdown column')

  it('groups people by the first dropdown column, in option order, with a Not set group', () => {
    const rows = [
      makeRow({ id: 'k1', sheetId: connectors.id, fields: { [relationship.key]: 'Alumni' } }),
      makeRow({ id: 'k2', sheetId: connectors.id, fields: { [relationship.key]: 'Friend' } }),
      makeRow({ id: 'k3', sheetId: connectors.id, fields: { [relationship.key]: 'Alumni' } }),
      makeRow({ id: 'k4', sheetId: connectors.id, fields: {} }),
    ]
    const summary = summariseSheet(connectors, rows, now)
    expect(summary.stages).toEqual([])
    expect(summary.open).toBe(4)
    expect(summary.value).toBeNull()
    expect(summary.groups?.column.key).toBe(relationship.key)
    expect(
      summary.groups?.groups.find((g) => g.label === 'Alumni')?.people.map((p) => p.id),
    ).toEqual(['k1', 'k3'])
    expect(
      summary.groups?.groups.find((g) => g.label === 'Friend')?.people.map((p) => p.id),
    ).toEqual(['k2'])
    expect(summary.groups?.groups.at(-1)).toEqual({
      label: 'Not set',
      people: [expect.objectContaining({ id: 'k4' })],
    })
    expect(summary.groups?.groups.map((g) => g.label).slice(0, -1)).toEqual(relationship.options)
  })
})
