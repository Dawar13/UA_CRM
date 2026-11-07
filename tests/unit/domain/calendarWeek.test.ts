import { describe, expect, it } from 'vitest'
import { coversDay, layoutDay, weekDays, weekStartOf } from '@/domain/calendar/week'
import type { CalendarEvent } from '@/domain/types'

/** An event on an IST day and times ("09:00" to "10:00"). */
function ev(id: string, day: string, from: string, to: string, extra: Partial<CalendarEvent> = {}) {
  return {
    id,
    memberId: 'm',
    title: id,
    start: new Date(`${day}T${from}:00+05:30`).toISOString(),
    end: new Date(`${day}T${to}:00+05:30`).toISOString(),
    attendees: [],
    source: 'google',
    ...extra,
  } satisfies CalendarEvent
}

describe('weeks', () => {
  it('start on Monday, in IST', () => {
    expect(weekStartOf('2026-11-05')).toBe('2026-11-02') // Thu → Mon
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09') // Mon
    expect(weekStartOf('2026-11-08')).toBe('2026-11-02') // Sun belongs to the week before
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28')
    expect(weekDays('2026-11-09')).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
  })
})

describe('layoutDay', () => {
  it('places events by IST minutes', () => {
    const [p] = layoutDay([ev('a', '2026-11-09', '11:30', '12:15')], '2026-11-09')
    expect(p).toMatchObject({ startMinute: 690, endMinute: 735, lane: 0, lanes: 1 })
  })

  it('puts overlapping events side by side, and reuses a lane once it is free', () => {
    const placed = layoutDay(
      [
        ev('a', '2026-11-09', '09:00', '10:00'),
        ev('b', '2026-11-09', '09:30', '10:30'),
        ev('c', '2026-11-09', '10:00', '11:00'),
        ev('d', '2026-11-09', '14:00', '15:00'),
      ],
      '2026-11-09',
    )
    const byId = Object.fromEntries(placed.map((p) => [p.event.id, p]))
    expect(byId.a).toMatchObject({ lane: 0, lanes: 2 })
    expect(byId.b).toMatchObject({ lane: 1, lanes: 2 })
    expect(byId.c).toMatchObject({ lane: 0, lanes: 2 })
    expect(byId.d).toMatchObject({ lane: 0, lanes: 1 })
  })

  it('clips events that cross midnight, and gives short ones a readable height', () => {
    const late = ev('late', '2026-11-09', '23:00', '23:30', {
      end: new Date('2026-11-10T01:00:00+05:30').toISOString(),
    })
    expect(layoutDay([late], '2026-11-09')[0]).toMatchObject({ startMinute: 1380, endMinute: 1440 })
    expect(layoutDay([late], '2026-11-10')[0]).toMatchObject({ startMinute: 0, endMinute: 60 })
    const blip = ev('blip', '2026-11-09', '09:00', '09:05')
    expect(layoutDay([blip], '2026-11-09')[0]?.endMinute).toBe(560)
  })

  it('leaves all-day events to the all-day row', () => {
    const allDay = {
      ...ev('x', '2026-11-09', '00:00', '00:00'),
      end: new Date('2026-11-11T00:00:00+05:30').toISOString(),
      allDay: true,
    }
    expect(layoutDay([allDay], '2026-11-09')).toEqual([])
    expect(coversDay(allDay, '2026-11-09')).toBe(true)
    expect(coversDay(allDay, '2026-11-10')).toBe(true)
    expect(coversDay(allDay, '2026-11-11')).toBe(false)
  })
})
