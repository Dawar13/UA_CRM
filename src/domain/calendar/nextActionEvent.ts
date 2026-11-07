/**
 * Next actions as Google Calendar events (Phase 2, C5): the event the CRM creates for a next
 * action, and how a move in Google maps back onto the next action. Pure.
 */
import { addDays, IST_OFFSET_MS, istDate, type StoredEvent, UA_KIND_NEXT_ACTION } from './google.js'

export type Precision = 'day' | 'early-month' | 'mid-month' | 'late-month' | 'month'

export const DEFAULT_DURATION_MINUTES = 30

export interface NextActionEventInput {
  rowId: string
  rowName: string
  text: string
  date: string
  precision: Precision
  /** "16:00" in IST, or null for an all-day event. */
  time: string | null
  durationMinutes?: number
  /** A link straight to the row, for the event's description. */
  rowUrl: string
  /** The contact's email when they are invited; null keeps the event to the member. */
  inviteEmail: string | null
}

/** A fuzzy date ("Mid Nov") cannot become an event; an exact day is asked for first. */
export class FuzzyDateError extends Error {
  constructor() {
    super('Pick an exact day for the calendar first.')
    this.name = 'FuzzyDateError'
  }
}

export interface GoogleEventBody {
  summary: string
  description: string
  start: { date?: string; dateTime?: string; timeZone?: string }
  end: { date?: string; dateTime?: string; timeZone?: string }
  attendees: { email: string }[]
  extendedProperties: { private: Record<string, string> }
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

function istLocal(ms: number): string {
  return `${new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19)}+05:30`
}

/** The event for a next action: timed (30 minutes) with a time, all-day without one. */
export function nextActionEventBody(input: NextActionEventInput): GoogleEventBody {
  if (input.precision !== 'day') throw new FuzzyDateError()
  if (input.time !== null && !TIME.test(input.time)) {
    throw new RangeError(`Not a 24-hour time: ${input.time}`)
  }
  const summary = `${input.text.trim() || 'Next action'} · ${input.rowName.trim()}`
  const description = `Next action in UA Internal CRM.\n${input.rowUrl}`
  let start: GoogleEventBody['start']
  let end: GoogleEventBody['end']
  if (input.time === null) {
    start = { date: input.date }
    end = { date: addDays(input.date, 1) }
  } else {
    const startMs = Date.parse(`${input.date}T${input.time}:00+05:30`)
    const minutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES
    start = { dateTime: istLocal(startMs), timeZone: 'Asia/Kolkata' }
    end = { dateTime: istLocal(startMs + minutes * 60_000), timeZone: 'Asia/Kolkata' }
  }
  return {
    summary,
    description,
    start,
    end,
    attendees: input.inviteEmail ? [{ email: input.inviteEmail }] : [],
    extendedProperties: { private: { uaRowId: input.rowId, uaKind: UA_KIND_NEXT_ACTION } },
  }
}

/** Google's `sendUpdates`: guests hear about it only when the contact is invited. */
export function sendUpdatesFor(inviteEmail: string | null): 'all' | 'none' {
  return inviteEmail ? 'all' : 'none'
}

export interface Placement {
  date: string
  /** "HH:MM" in IST, or null for all-day. */
  time: string | null
}

/** Where an event sits now, in IST. */
export function placementOf(
  event: Pick<StoredEvent, 'allDay' | 'startDate' | 'startAt'>,
): Placement {
  if (event.allDay && event.startDate) return { date: event.startDate, time: null }
  return {
    date: istDate(event.startAt),
    time: new Date(Date.parse(event.startAt) + IST_OFFSET_MS).toISOString().slice(11, 16),
  }
}

/**
 * The next action's new date when its CRM event was moved in Google, or null when nothing moved.
 * Only events the CRM created for this row count.
 */
export function movedTo(
  event: StoredEvent,
  rowId: string,
  current: { date: string; precision: Precision } | null,
): string | null {
  if (event.uaKind !== UA_KIND_NEXT_ACTION || event.uaRowId !== rowId) return null
  if (event.status === 'cancelled') return null
  const { date } = placementOf(event)
  if (current && current.precision === 'day' && current.date === date) return null
  return date
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** "Fri 13 Nov", with the year when it is not the current one (CLAUDE.md §3.5). */
export function dayLabel(date: string, now: Date): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  const label = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return date.slice(0, 4) === istDate(now).slice(0, 4) ? label : `${label} ${date.slice(0, 4)}`
}

/** The system note written when Google moves a next action. */
export function movedNote(date: string, now: Date): string {
  return `Next action moved in Google Calendar to ${dayLabel(date, now)}`
}
