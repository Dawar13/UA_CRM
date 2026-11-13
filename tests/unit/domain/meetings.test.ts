import { describe, expect, it } from 'vitest'
import {
  CONFIRM_DAYS,
  calendarEventKey,
  isMarkable,
  type MeetingOutcome,
  meetingsToConfirm,
  missedMeetingStarts,
} from '@/domain/calendar/meetings'
import type { CalendarEvent } from '@/domain/types'

// Did a meeting happen? (D-059)

const NOW = new Date('2026-11-12T18:00:00+05:30')

function meeting(id: string, start: string, end: string, over: Partial<CalendarEvent> = {}) {
  return {
    id,
    memberId: 'm-dawar',
    title: id,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    attendees: [],
    source: 'google',
    externalId: `g-${id}`,
    ...over,
  } satisfies CalendarEvent
}

const call = meeting('call', '2026-11-12T16:00:00+05:30', '2026-11-12T16:30:00+05:30')
const walk = meeting('walk', '2026-11-10T10:00:00+05:30', '2026-11-10T11:00:00+05:30')
const later = meeting('later', '2026-11-12T19:00:00+05:30', '2026-11-12T19:30:00+05:30')
const inProgress = meeting('now', '2026-11-12T17:45:00+05:30', '2026-11-12T18:15:00+05:30')
const old = meeting('old', '2026-11-04T10:00:00+05:30', '2026-11-04T11:00:00+05:30')
const holiday = meeting('holiday', '2026-11-11T00:00:00+05:30', '2026-11-12T00:00:00+05:30', {
  allDay: true,
})
const declined = meeting('declined', '2026-11-11T10:00:00+05:30', '2026-11-11T11:00:00+05:30', {
  selfResponse: 'declined',
})
const followUp = meeting('follow-up', '2026-11-11T16:00:00+05:30', '2026-11-11T16:30:00+05:30', {
  uaRowId: 'r-rohan',
})

describe('meetings held or missed', () => {
  it('an event is known by its Google id, or its own id in sample mode', () => {
    expect(calendarEventKey(call)).toBe('g-call')
    expect(calendarEventKey({ id: 'e-dawar-01' })).toBe('e-dawar-01')
  })

  it('only a timed meeting that has ended can be marked; not one declined or a follow-up', () => {
    expect(isMarkable(call, NOW)).toBe(true)
    expect(isMarkable(later, NOW)).toBe(false)
    expect(isMarkable(inProgress, NOW)).toBe(false)
    expect(isMarkable(holiday, NOW)).toBe(false)
    expect(isMarkable(declined, NOW)).toBe(false)
    expect(isMarkable(followUp, NOW)).toBe(false)
  })

  it('Today asks about the past week’s meetings with a contact and no answer, oldest first', () => {
    const all = [call, walk, later, inProgress, old, holiday, declined, followUp]
    const withContacts = new Set(all.map((e) => e.id))
    expect(meetingsToConfirm(all, withContacts, new Map(), NOW).map((e) => e.id)).toEqual([
      'walk',
      'call',
    ])
    // Older than a week: it stays held.
    expect(CONFIRM_DAYS).toBe(7)
    // Without a contact, or answered either way, it is not asked about.
    const answered = new Map<string, MeetingOutcome>([['g-walk', 'held']])
    expect(meetingsToConfirm(all, withContacts, answered, NOW).map((e) => e.id)).toEqual(['call'])
    expect(meetingsToConfirm(all, new Set(['walk']), new Map(), NOW).map((e) => e.id)).toEqual([
      'walk',
    ])
  })

  it('the missed dots come from meetings marked missed, at their start', () => {
    const marks = new Map<string, MeetingOutcome>([
      ['g-call', 'missed'],
      ['g-walk', 'held'],
    ])
    expect(missedMeetingStarts([call, walk, old], marks)).toEqual([call.start])
  })
})
