import { describe, expect, it } from 'vitest'
import { groupEventsByDay, matchEventToRows } from '@/domain/calendar'
import type { CalendarEvent } from '@/domain/types'
import { makeRow } from './_fixtures'

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev-1',
    memberId: 'member-dawar',
    title: 'Plant visit',
    start: '2026-11-06T04:30:00.000Z',
    end: '2026-11-06T05:30:00.000Z',
    attendees: [],
    source: 'sample',
    ...overrides,
  }
}

describe('matchEventToRows', () => {
  const rohan = makeRow({ id: 'r1', email: 'rohan@hpf.example' })
  const priya = makeRow({ id: 'r2', name: 'Priya Nair', email: 'Priya@Kaveri.example' })
  const noEmail = makeRow({ id: 'r3', email: '' })
  const deleted = makeRow({
    id: 'r4',
    email: 'rohan@hpf.example',
    deletedAt: '2026-11-01T04:30:00.000Z',
  })
  const rows = [rohan, priya, noEmail, deleted]

  it('matches attendee emails exactly, ignoring case and spaces', () => {
    const ev = event({
      attendees: [
        { email: ' ROHAN@hpf.example ', name: 'Rohan' },
        { email: 'priya@kaveri.example' },
        { email: 'dawar@utopianautonomy.example' },
      ],
    })
    expect(matchEventToRows(ev, rows).map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('never matches deleted rows or rows without an email', () => {
    const ev = event({ attendees: [{ email: 'rohan@hpf.example' }, { email: '' }] })
    expect(matchEventToRows(ev, rows).map((r) => r.id)).toEqual(['r1'])
  })

  it('does not match partial emails or names in the title', () => {
    const ev = event({
      title: 'Call with Rohan Mehta, Hosur Precision Forge',
      attendees: [{ email: 'rohan@hpf.example.in' }, { email: 'ohan@hpf.example' }],
    })
    expect(matchEventToRows(ev, rows)).toEqual([])
    expect(matchEventToRows(event(), rows)).toEqual([])
  })
})

describe('groupEventsByDay', () => {
  it('groups by IST date in ascending order, sorted by start', () => {
    const late = event({
      id: 'late',
      start: '2026-11-06T12:30:00.000Z',
      end: '2026-11-06T13:00:00.000Z',
    })
    const morning = event({ id: 'morning' })
    // 19:00 UTC on 5 Nov is 00:30 IST on 6 Nov.
    const afterIstMidnight = event({
      id: 'night',
      start: '2026-11-05T19:00:00.000Z',
      end: '2026-11-05T19:30:00.000Z',
    })
    const today = event({
      id: 'today',
      start: '2026-11-05T09:30:00.000Z',
      end: '2026-11-05T10:00:00.000Z',
    })
    const later = event({
      id: 'later',
      start: '2026-11-10T05:30:00.000Z',
      end: '2026-11-10T06:30:00.000Z',
    })
    const groups = groupEventsByDay([later, late, morning, afterIstMidnight, today])
    expect(groups.map((g) => [g.date, g.events.map((e) => e.id)])).toEqual([
      ['2026-11-05', ['today']],
      ['2026-11-06', ['night', 'morning', 'late']],
      ['2026-11-10', ['later']],
    ])
  })

  it('breaks ties by end, then title, then id', () => {
    const start = '2026-11-06T04:30:00.000Z'
    const long = event({ id: 'a', title: 'A', start, end: '2026-11-06T06:30:00.000Z' })
    const shortB = event({ id: 'c', title: 'B', start, end: '2026-11-06T05:00:00.000Z' })
    const shortA = event({ id: 'd', title: 'A', start, end: '2026-11-06T05:00:00.000Z' })
    const shortA2 = event({ id: 'b', title: 'A', start, end: '2026-11-06T05:00:00.000Z' })
    const [group] = groupEventsByDay([long, shortB, shortA, shortA2])
    expect(group?.events.map((e) => e.id)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('does not mutate the input and handles no events', () => {
    const input = [event({ id: 'x', start: '2026-11-07T04:30:00.000Z' }), event({ id: 'y' })]
    groupEventsByDay(input)
    expect(input.map((e) => e.id)).toEqual(['x', 'y'])
    expect(groupEventsByDay([])).toEqual([])
  })
})
