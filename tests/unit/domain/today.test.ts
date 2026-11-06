import { describe, expect, it } from 'vitest'
import { newRow } from '@/domain/rows'
import { buildSheetSchema } from '@/domain/templates'
import { todayItems, weekStartIst } from '@/domain/today'
import type { FuzzyDate, Row, Sheet } from '@/domain/types'

// Thu 5 Nov 2026, 10:00 IST.
const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const newId = () => `id-${++n}`
const { columns, stages } = buildSheetSchema('customers', newId)
const sheet: Sheet = {
  id: 's1',
  memberId: 'm1',
  slug: 'customers',
  name: 'Customers',
  template: 'customers',
  position: 0,
  columns,
  stages,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  deletedAt: null,
}

function row(name: string, date: FuzzyDate | null, createdAt = '2026-10-01T05:00:00.000Z'): Row {
  const r = newRow(
    sheet,
    { name, nextAction: date ? { text: `${name} next`, date } : null },
    { id: `r-${name}`, position: 0 },
    { now: NOW, actorId: 'm1', newId },
  ).row
  return { ...r, createdAt }
}

describe('todayItems', () => {
  it('splits next actions into overdue and due today, oldest first', () => {
    const rows = [
      row('late', { date: '2026-11-04', precision: 'day' }),
      row('older', { date: '2026-10-25', precision: 'late-month' }),
      row('today', { date: '2026-11-05', precision: 'day' }),
      row('soon', { date: '2026-11-06', precision: 'day' }),
      // Mid November has not passed yet: not overdue.
      row('mid', { date: '2026-11-15', precision: 'mid-month' }),
      row('none', null),
    ]
    const items = todayItems(rows, NOW)
    expect(items.overdue.map((r) => r.name)).toEqual(['older', 'late'])
    expect(items.dueToday.map((r) => r.name)).toEqual(['today'])
  })

  it('lists rows added since Monday, newest first, and leaves out lost and deleted rows', () => {
    const rows = [
      row('mon', null, '2026-11-02T04:00:00.000Z'),
      row('wed', null, '2026-11-04T04:00:00.000Z'),
      row('lastweek', null, '2026-11-01T04:00:00.000Z'),
      { ...row('gone', null, '2026-11-04T05:00:00.000Z'), deletedAt: NOW.toISOString() },
      {
        ...row('lost', { date: '2026-11-01', precision: 'day' }),
        lost: { stageIndex: 1, date: '2026-11-02' },
      },
    ]
    const items = todayItems(rows, NOW)
    expect(items.addedThisWeek.map((r) => r.name)).toEqual(['wed', 'mon'])
    expect(items.overdue).toEqual([])
  })

  it('the week starts on Monday in IST', () => {
    expect(weekStartIst(NOW)).toBe('2026-11-02')
    expect(weekStartIst(new Date('2026-11-08T23:00:00+05:30'))).toBe('2026-11-02')
    expect(weekStartIst(new Date('2026-11-09T00:30:00+05:30'))).toBe('2026-11-09')
  })
})
