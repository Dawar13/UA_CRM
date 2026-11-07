/**
 * Calendar matching. Phase 0: attendee email, exact only (case-insensitive, trimmed).
 * Name and title matching is Phase 2. Pure.
 */
import { istDateOf } from '../dates'
import type { CalendarEvent, IsoDate, Row } from '../types'

function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

/** Rows whose email matches an attendee email. Deleted rows never match. Input order is kept. */
export function matchEventToRows(event: CalendarEvent, rows: readonly Row[]): Row[] {
  const attendees = new Set(event.attendees.map((a) => emailKey(a.email)).filter((e) => e !== ''))
  if (attendees.size === 0) return []
  return rows.filter((row) => {
    if (row.deletedAt !== null) return false
    const email = emailKey(row.email)
    return email !== '' && attendees.has(email)
  })
}

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  const byStart = Date.parse(a.start) - Date.parse(b.start)
  if (byStart !== 0) return byStart
  const byEnd = Date.parse(a.end) - Date.parse(b.end)
  if (byEnd !== 0) return byEnd
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
}

/** Groups events by IST calendar date, sorted by start; keys in ascending date order. */
export function groupEventsByDay(
  events: readonly CalendarEvent[],
): { date: IsoDate; events: CalendarEvent[] }[] {
  const groups: { date: IsoDate; events: CalendarEvent[] }[] = []
  for (const event of [...events].sort(compareEvents)) {
    const date = istDateOf(event.start)
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.events.push(event)
    else groups.push({ date, events: [event] })
  }
  return groups
}
