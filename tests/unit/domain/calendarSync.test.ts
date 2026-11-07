import { describe, expect, it } from 'vitest'
import {
  eventDays,
  type GoogleEvent,
  istDate,
  istMidnight,
  normaliseEmail,
  normaliseEvent,
  purgeBefore,
  type StoredEvent,
  SYNC_START,
  syncWindow,
} from '@/domain/calendar/google'
import {
  type EventLink,
  linksFor,
  matchByEmail,
  meetingKey,
  meetingRows,
  meetingText,
} from '@/domain/calendar/logging'
import {
  dayLabel,
  FuzzyDateError,
  movedNote,
  movedTo,
  nextActionEventBody,
  placementOf,
  sendUpdatesFor,
} from '@/domain/calendar/nextActionEvent'
import { suggestRowForTitle } from '@/domain/calendar/suggest'

const ME = 'dawar@example.test'

function google(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: 'evt1',
    status: 'confirmed',
    summary: 'Plant walk',
    start: { dateTime: '2026-11-06T10:00:00+05:30', timeZone: 'Asia/Kolkata' },
    end: { dateTime: '2026-11-06T11:00:00+05:30', timeZone: 'Asia/Kolkata' },
    attendees: [
      { email: 'Dawar@Example.test', self: true, responseStatus: 'accepted' },
      { email: ' Rohan@HPF.example ', displayName: 'Rohan Mehta', responseStatus: 'accepted' },
    ],
    ...overrides,
  }
}

const stored = (overrides: Partial<GoogleEvent> = {}): StoredEvent =>
  normaliseEvent(google(overrides), [ME])

describe('the sync window', () => {
  const now = new Date('2026-12-20T06:00:00Z')

  it('starts the first sync on 5 Nov 2026, 00:00 IST, and looks 60 days ahead', () => {
    expect(SYNC_START).toBe(istMidnight('2026-11-05'))
    expect(syncWindow(now, null)).toEqual({
      timeMin: '2026-11-04T18:30:00.000Z',
      timeMax: '2027-02-18T06:00:00.000Z',
    })
  })

  it('goes back 14 days on later syncs, but never before 5 Nov', () => {
    const recent = new Date('2026-12-20T05:50:00Z')
    expect(syncWindow(now, recent).timeMin).toBe('2026-12-06T06:00:00.000Z')
    const early = new Date('2026-11-10T06:00:00Z')
    expect(syncWindow(early, new Date('2026-11-10T05:00:00Z')).timeMin).toBe(SYNC_START)
  })

  it('catches up a gap from a day before the last good sync', () => {
    const gap = new Date('2026-11-25T10:00:00Z')
    expect(syncWindow(now, gap).timeMin).toBe('2026-11-24T10:00:00.000Z')
  })

  it('purges events that ended more than 30 days ago', () => {
    expect(purgeBefore(now)).toBe('2026-11-20T06:00:00.000Z')
  })
})

describe('normalising Google events', () => {
  it('keeps timed events as UTC instants, emails lowercased, the member marked as self', () => {
    const e = stored()
    expect(e).toMatchObject({
      googleEventId: 'evt1',
      status: 'confirmed',
      startAt: '2026-11-06T04:30:00.000Z',
      endAt: '2026-11-06T05:30:00.000Z',
      allDay: false,
      startDate: null,
      timeZone: 'Asia/Kolkata',
      selfResponse: 'accepted',
      uaRowId: null,
    })
    expect(e.attendees).toEqual([
      { email: 'dawar@example.test', responseStatus: 'accepted', self: true },
      { email: 'rohan@hpf.example', name: 'Rohan Mehta', responseStatus: 'accepted' },
    ])
  })

  it('knows the member by email even when Google leaves out self', () => {
    const e = stored({ attendees: [{ email: ME, responseStatus: 'declined' }] })
    expect(e.selfResponse).toBe('declined')
  })

  it('treats all-day ends as exclusive and anchors days at IST midnight', () => {
    const e = stored({ start: { date: '2026-11-09' }, end: { date: '2026-11-12' } })
    expect(e).toMatchObject({
      allDay: true,
      startDate: '2026-11-09',
      endDate: '2026-11-12',
      startAt: '2026-11-08T18:30:00.000Z',
      endAt: '2026-11-11T18:30:00.000Z',
    })
    expect(eventDays(e)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
    expect(
      eventDays(stored({ start: { date: '2026-11-09' }, end: { date: '2026-11-10' } })),
    ).toEqual(['2026-11-09'])
  })

  it('places timed events across IST midnight on both days', () => {
    const late = stored({
      start: { dateTime: '2026-11-06T23:00:00+05:30' },
      end: { dateTime: '2026-11-07T01:00:00+05:30' },
    })
    expect(eventDays(late)).toEqual(['2026-11-06', '2026-11-07'])
    // Ending exactly at midnight stays on one day.
    const toMidnight = stored({
      start: { dateTime: '2026-11-06T23:00:00+05:30' },
      end: { dateTime: '2026-11-07T00:00:00+05:30' },
    })
    expect(eventDays(toMidnight)).toEqual(['2026-11-06'])
    expect(istDate('2026-11-06T18:29:59.000Z')).toBe('2026-11-06')
    expect(istDate('2026-11-06T18:30:00.000Z')).toBe('2026-11-07')
  })

  it('keeps recurring instance ids, cancellations and the CRM properties', () => {
    const instance = stored({
      id: 'series1_20261110T043000Z',
      recurringEventId: 'series1',
      extendedProperties: { private: { uaRowId: 'row-1', uaKind: 'next-action' } },
    })
    expect(instance).toMatchObject({
      googleEventId: 'series1_20261110T043000Z',
      recurringEventId: 'series1',
      uaRowId: 'row-1',
      uaKind: 'next-action',
    })
    const cancelled = normaliseEvent(
      {
        id: 'series1_20261117T043000Z',
        status: 'cancelled',
        recurringEventId: 'series1',
        originalStartTime: { dateTime: '2026-11-17T10:00:00+05:30' },
      },
      [ME],
    )
    expect(cancelled).toMatchObject({ status: 'cancelled', startAt: '2026-11-17T04:30:00.000Z' })
  })

  it('normalises emails', () => {
    expect(normaliseEmail(' MailTo:Asha@Example.Test ')).toBe('asha@example.test')
    expect(normaliseEmail(undefined)).toBe('')
  })
})

describe('matching and meeting history', () => {
  const now = new Date('2026-11-06T12:00:00Z')
  const rows = [
    { id: 'r-rohan', email: 'rohan@hpf.example', ownerId: 'm-dawar' },
    { id: 'r-rohan-2', email: 'ROHAN@hpf.example', ownerId: 'm-dawar' },
    { id: 'r-dhruv-rohan', email: 'rohan@hpf.example', ownerId: 'm-dhruv' },
    { id: 'r-asha', email: 'asha@example.test', ownerId: 'm-dawar' },
  ]
  const context = (links: EventLink[] = []) => ({
    memberId: 'm-dawar',
    ownRows: rows,
    links,
    selfEmails: [ME],
  })

  it('matches guests by email, never the member themself', () => {
    expect(matchByEmail(stored(), rows, [ME]).map((r) => r.id)).toEqual([
      'r-rohan',
      'r-rohan-2',
      'r-dhruv-rohan',
    ])
    const solo = stored({ attendees: [{ email: ME, self: true }] })
    expect(matchByEmail(solo, [{ id: 'me', email: ME, ownerId: 'm-dawar' }], [ME])).toEqual([])
  })

  it('logs an ended meeting into every own row it matches, and only own rows', () => {
    expect(meetingRows(stored(), now, context())).toEqual({ rowIds: ['r-rohan', 'r-rohan-2'] })
    expect(meetingText(stored())).toBe('Plant walk')
    expect(meetingText(stored({ summary: '  ' }))).toBe('Meeting')
    expect(meetingKey(stored())).toBe('evt1')
  })

  it('skips meetings that have not ended, started before 5 Nov, were cancelled or declined', () => {
    const notEnded = stored({ end: { dateTime: '2026-11-06T18:00:00+05:30' } })
    expect(meetingRows(notEnded, now, context()).skipped).toBe('not-ended')
    const before = stored({
      start: { dateTime: '2026-11-04T23:00:00+05:30' },
      end: { dateTime: '2026-11-05T01:00:00+05:30' },
    })
    expect(meetingRows(before, now, context()).skipped).toBe('before-sync-start')
    expect(meetingRows(stored({ status: 'cancelled' }), now, context()).skipped).toBe('cancelled')
    const declined = stored({
      attendees: [
        { email: ME, self: true, responseStatus: 'declined' },
        { email: 'rohan@hpf.example' },
      ],
    })
    expect(meetingRows(declined, now, context()).skipped).toBe('declined')
  })

  it("never logs the CRM's own next-action events", () => {
    const crm = stored({
      extendedProperties: { private: { uaRowId: 'r-rohan', uaKind: 'next-action' } },
    })
    expect(meetingRows(crm, now, context()).skipped).toBe('crm-next-action')
  })

  it("does not write into another member's row, even when only they match", () => {
    const onlyDhruv = { ...context(), ownRows: rows.filter((r) => r.ownerId === 'm-dhruv') }
    expect(meetingRows(stored(), now, onlyDhruv)).toEqual({ rowIds: [], skipped: 'no-own-match' })
  })

  it('logs through a confirmed link, on one event or a whole series, and respects dismissals', () => {
    const noGuests = stored({ attendees: [], recurringEventId: 'series1' })
    const series: EventLink = {
      googleEventId: null,
      recurringEventId: 'series1',
      rowId: 'r-asha',
      kind: 'confirmed',
    }
    expect(linksFor(noGuests, [series])).toEqual([series])
    expect(meetingRows(noGuests, now, context([series]))).toEqual({ rowIds: ['r-asha'] })
    // A confirmed link to someone else's row is ignored.
    const foreign: EventLink = { ...series, rowId: 'r-dhruv-rohan' }
    expect(meetingRows(noGuests, now, context([foreign])).rowIds).toEqual([])
    // A dismissal stops an email match from logging into that row.
    const dismissed: EventLink = {
      googleEventId: 'evt1',
      recurringEventId: null,
      rowId: 'r-rohan-2',
      kind: 'dismissed',
    }
    expect(meetingRows(stored(), now, context([dismissed])).rowIds).toEqual(['r-rohan'])
  })
})

describe('next actions as events', () => {
  const base = {
    rowId: 'r-rohan',
    rowName: 'Rohan Mehta',
    text: 'Send ROI note',
    date: '2026-11-13',
    precision: 'day' as const,
    rowUrl: 'https://crm.example/m/dawar/customers?row=r-rohan',
    inviteEmail: null,
  }

  it('makes a 30-minute timed event in IST with the CRM properties, guests off by default', () => {
    const body = nextActionEventBody({ ...base, time: '16:00' })
    expect(body).toEqual({
      summary: 'Send ROI note · Rohan Mehta',
      description:
        'Next action in UA Internal CRM.\nhttps://crm.example/m/dawar/customers?row=r-rohan',
      start: { dateTime: '2026-11-13T16:00:00+05:30', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2026-11-13T16:30:00+05:30', timeZone: 'Asia/Kolkata' },
      attendees: [],
      extendedProperties: { private: { uaRowId: 'r-rohan', uaKind: 'next-action' } },
    })
    expect(sendUpdatesFor(null)).toBe('none')
  })

  it('makes an all-day event without a time, and invites the contact only when asked', () => {
    const body = nextActionEventBody({ ...base, time: null, inviteEmail: 'rohan@hpf.example' })
    expect(body.start).toEqual({ date: '2026-11-13' })
    expect(body.end).toEqual({ date: '2026-11-14' })
    expect(body.attendees).toEqual([{ email: 'rohan@hpf.example' }])
    expect(sendUpdatesFor('rohan@hpf.example')).toBe('all')
  })

  it('refuses a fuzzy date and a malformed time', () => {
    expect(() => nextActionEventBody({ ...base, precision: 'mid-month', time: null })).toThrow(
      FuzzyDateError,
    )
    expect(() => nextActionEventBody({ ...base, time: '25:00' })).toThrow(RangeError)
  })

  it('reads a move in Google back as the next action’s new date', () => {
    const moved = stored({
      start: { dateTime: '2026-11-20T09:00:00+05:30' },
      end: { dateTime: '2026-11-20T09:30:00+05:30' },
      extendedProperties: { private: { uaRowId: 'r-rohan', uaKind: 'next-action' } },
    })
    expect(placementOf(moved)).toEqual({ date: '2026-11-20', time: '09:00' })
    expect(movedTo(moved, 'r-rohan', { date: '2026-11-13', precision: 'day' })).toBe('2026-11-20')
    expect(movedTo(moved, 'r-rohan', { date: '2026-11-20', precision: 'day' })).toBeNull()
    expect(movedTo(moved, 'r-other', { date: '2026-11-13', precision: 'day' })).toBeNull()
    expect(movedTo({ ...moved, status: 'cancelled' }, 'r-rohan', null)).toBeNull()
    const now = new Date('2026-11-06T12:00:00Z')
    expect(dayLabel('2026-11-13', now)).toBe('Fri 13 Nov')
    expect(dayLabel('2027-01-08', now)).toBe('Fri 8 Jan 2027')
    expect(movedNote('2026-11-13', now)).toBe('Next action moved in Google Calendar to Fri 13 Nov')
  })
})

describe('title suggestions', () => {
  const rows = [
    { id: 'r-rohan', name: 'Rohan Mehta', company: 'Hosur Precision Forge Pvt Ltd' },
    { id: 'r-asha', name: 'Asha Rao', company: 'Kovai Pumps' },
    { id: 'r-asha-2', name: 'Dr. Asha Iyer', company: 'Kovai Pumps' },
  ]

  it('suggests the one row whose full name is in the title', () => {
    expect(suggestRowForTitle('Call with Rohan Mehta re pilot', rows)).toBe('r-rohan')
    expect(suggestRowForTitle('Sync: asha iyer', rows)).toBe('r-asha-2')
  })

  it('falls back to a company held by exactly one row', () => {
    expect(suggestRowForTitle('Hosur Precision Forge plant walk', rows)).toBe('r-rohan')
    // Two rows work at Kovai Pumps: ambiguous, no suggestion.
    expect(suggestRowForTitle('Kovai Pumps review', rows)).toBeNull()
  })

  it('never suggests on a first name alone, or a part of a word', () => {
    expect(suggestRowForTitle('Lunch with Rohan', rows)).toBeNull()
    expect(suggestRowForTitle('Rohan Mehtani visit', rows)).toBeNull()
    expect(suggestRowForTitle('', rows)).toBeNull()
  })
})
