import { describe, expect, it } from 'vitest'
import { summariseSheet } from '@/domain/summary'
import type { Row } from '@/domain/types'
import { sheetFigures } from '@/features/sheet-summary/figures'
import { makeRow, makeSheet, now } from '../domain/_fixtures'

const customers = makeSheet('customers')
const connectors = makeSheet('connectors')
const advisors = makeSheet('advisors')
const ticket = customers.columns.find((c) => c.type === 'currency')

function figuresOf(sheet: typeof customers, rows: Row[]) {
  return sheetFigures(sheet, rows, summariseSheet(sheet, rows, now))
}

describe('sheetFigures', () => {
  it('shows people, open pipeline, won and due for a sheet with stages and a value column', () => {
    if (!ticket) throw new Error('Customers has a currency column')
    const figures = figuresOf(customers, [
      makeRow({
        id: 'a',
        warmth: 'warm',
        stageIndex: 1,
        fields: { [ticket.key]: 2_500_000 },
        nextAction: { text: 'Call', date: { date: '2026-11-05', precision: 'day' } },
      }),
      makeRow({
        id: 'b',
        warmth: 'warm',
        stageIndex: 6,
        fields: { [ticket.key]: 12_000_000 },
        nextAction: { text: 'Late', date: { date: '2026-11-01', precision: 'day' } },
      }),
      makeRow({ id: 'c', stageIndex: null, lost: { stageIndex: 2, date: '2026-11-01' } }),
    ])
    expect(figures.map((f) => [f.label, f.value, f.sub])).toEqual([
      ['People', '3', '2 warm'],
      // The unit in brackets is dropped: "Ticket estimate (₹ L/yr)" reads "Ticket estimate".
      ['Open pipeline', '₹25 L', 'Ticket estimate · 1 open'],
      ['Won', '₹1.2 Cr', '1 won · 1 lost'],
      ['Due', '2', '1 overdue · 1 today'],
    ])
    expect(figures.map((f) => f.inline)).toEqual(['people', 'open pipeline', 'won', 'due'])
  })

  it('counts won people and touches this week when there is no value column', () => {
    const figures = figuresOf(advisors, [
      makeRow({ id: 'a', stageIndex: 2, lastTouchAt: '2026-11-04T10:00:00.000Z' }),
      makeRow({ id: 'b', stageIndex: 0 }),
    ])
    expect(figures.map((f) => [f.label, f.value, f.sub])).toEqual([
      ['People', '2', 'No warmth set yet'],
      ['This week', '1', 'touched in the last 7 days'],
      ['Won', '1', '1 won · 0 lost'],
      ['Due', '0', 'Nothing due'],
    ])
  })

  it('counts next actions on a sheet without stages', () => {
    const figures = figuresOf(connectors, [
      makeRow({ id: 'a', warmth: 'cold', nextAction: { text: 'Thank them', date: null } }),
      makeRow({ id: 'b', nextAction: { text: '  ', date: null } }),
      makeRow({ id: 'c' }),
    ])
    expect(figures.map((f) => f.key)).toEqual(['people', 'week', 'next', 'due'])
    expect(figures[2]).toMatchObject({
      label: 'Next actions',
      value: '1',
      sub: '2 without one',
      inline: 'next action',
    })
  })

  it('says person for one', () => {
    expect(figuresOf(connectors, [makeRow({ id: 'a' })])[0]?.inline).toBe('person')
  })
})
