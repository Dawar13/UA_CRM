/**
 * Calendar matching. Phase 0: attendee email, exact only (case-insensitive, trimmed).
 * Name and title matching is Phase 2. Pure.
 *
 * CONTRACT (signatures are fixed; bodies are implemented in M0.3).
 */
import type { CalendarEvent, IsoDate, Row } from './types'

/** Rows whose email matches an attendee email. Deleted rows never match. */
export declare function matchEventToRows(event: CalendarEvent, rows: readonly Row[]): Row[]

/** Groups events by IST calendar date, sorted by start; keys in ascending date order. */
export declare function groupEventsByDay(
  events: readonly CalendarEvent[],
): { date: IsoDate; events: CalendarEvent[] }[]
