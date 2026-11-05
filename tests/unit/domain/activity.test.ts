import { describe, expect, it } from 'vitest'
import { ACTIVITY_DAYS, activityByDay, activityStart } from '@/domain/activity'
import type { HistoryEntry } from '@/domain/types'
import { makeRow, now } from './_fixtures'

let n = 0
function entry(kind: HistoryEntry['kind'], at: string, meta?: HistoryEntry['meta']): HistoryEntry {
  n += 1
  return {
    id: `h-${n}`,
    rowId: 'row-1',
    kind,
    source: 'manual',
    at,
    fuzzyDate: null,
    text: kind,
    memberId: 'member-dawar',
    ...(meta ? { meta } : {}),
  }
}

describe('activityByDay', () => {
  it('covers the last 30 days ending today, flagging weekends and today', () => {
    const { days } = activityByDay([], [], now)
    expect(days).toHaveLength(ACTIVITY_DAYS)
    expect(activityStart(now)).toBe('2026-10-07')
    expect(days[0]?.date).toBe('2026-10-07')
    expect(days.at(-1)).toMatchObject({ date: '2026-11-05', isToday: true, weekend: false })
    expect(days.find((d) => d.date === '2026-10-10')?.weekend).toBe(true)
    expect(days.find((d) => d.date === '2026-10-11')?.weekend).toBe(true)
    expect(days.filter((d) => d.isToday)).toHaveLength(1)
  })

  it('counts calls, meetings, WhatsApp and email as held, on their IST day', () => {
    const history = [
      entry('call', '2026-11-02T05:00:00.000Z'),
      entry('meeting', '2026-11-02T08:00:00.000Z'),
      // 23:30 IST on 3 Nov is still 3 Nov in IST.
      entry('whatsapp', '2026-11-03T18:00:00.000Z'),
      entry('email', '2026-10-20T05:00:00.000Z'),
      entry('note', '2026-11-02T05:00:00.000Z'),
      entry('warmth', '2026-11-02T05:00:00.000Z'),
      entry('created', '2026-11-02T05:00:00.000Z'),
      // Before the window.
      entry('call', '2026-10-01T05:00:00.000Z'),
    ]
    const result = activityByDay(history, [], now)
    const day = (date: string) => result.days.find((d) => d.date === date)
    expect(day('2026-11-02')?.held).toBe(2)
    expect(day('2026-11-03')?.held).toBe(1)
    expect(day('2026-10-20')?.held).toBe(1)
    expect(result.held).toBe(4)
  })

  it('counts forward stage moves, not moves back, losses or undos', () => {
    const history = [
      entry('stage', '2026-10-30T05:00:00.000Z', { fromStageIndex: 2, toStageIndex: 3 }),
      entry('stage', '2026-10-30T06:00:00.000Z', { fromStageIndex: null, toStageIndex: 0 }),
      entry('stage', '2026-10-31T05:00:00.000Z', { fromStageIndex: 3, toStageIndex: 2 }),
      entry('stage', '2026-10-31T06:00:00.000Z', {
        fromStageIndex: 2,
        toStageIndex: 3,
        undo: true,
      }),
      entry('stage', '2026-10-31T07:00:00.000Z', {
        lost: true,
        fromStageIndex: 2,
        toStageIndex: 2,
      }),
    ]
    const result = activityByDay(history, [], now)
    expect(result.days.find((d) => d.date === '2026-10-30')?.moved).toBe(2)
    expect(result.days.find((d) => d.date === '2026-10-31')?.moved).toBe(0)
    expect(result.moved).toBe(2)
  })

  it('skips imported entries dated only vaguely', () => {
    const vague = {
      ...entry('call', '2026-10-25T05:00:00.000Z'),
      fuzzyDate: { date: '2026-10-25', precision: 'late-month' as const },
    }
    expect(activityByDay([vague], [], now).held).toBe(0)
  })

  it('counts a past next action as missed when nothing happened since', () => {
    const rows = [
      makeRow({
        id: 'missed',
        nextAction: { text: 'Follow up', date: { date: '2026-11-03', precision: 'day' } },
        lastTouchAt: '2026-10-12T05:00:00.000Z',
      }),
      makeRow({
        id: 'touched-since',
        nextAction: { text: 'Call', date: { date: '2026-11-03', precision: 'day' } },
        lastTouchAt: '2026-11-04T05:00:00.000Z',
      }),
      makeRow({
        id: 'never-touched',
        nextAction: { text: 'Intro', date: { date: '2026-10-28', precision: 'day' } },
      }),
      makeRow({
        id: 'today',
        nextAction: { text: 'Today', date: { date: '2026-11-05', precision: 'day' } },
      }),
      makeRow({
        id: 'fuzzy',
        nextAction: { text: 'Mid Oct', date: { date: '2026-10-15', precision: 'mid-month' } },
      }),
      makeRow({
        id: 'lost',
        lost: { stageIndex: 1, date: '2026-11-01' },
        nextAction: { text: 'x', date: { date: '2026-10-29', precision: 'day' } },
      }),
      makeRow({
        id: 'old',
        nextAction: { text: 'x', date: { date: '2026-09-01', precision: 'day' } },
      }),
    ]
    const result = activityByDay([], rows, now)
    expect(result.days.find((d) => d.date === '2026-11-03')?.missed).toBe(1)
    expect(result.days.find((d) => d.date === '2026-10-28')?.missed).toBe(1)
    expect(result.missed).toBe(2)
  })
})
