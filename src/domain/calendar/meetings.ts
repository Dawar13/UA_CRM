/**
 * Did a meeting happen? (D-059) Google Calendar cannot say whether anyone joined, so a meeting
 * that ended counts as held until its owner says it was missed: in Today's check-in, on the
 * calendar page, or on its entry in a contact's history. A missed meeting is a missed dot in the
 * 30-day field and is never a touch, so it does not move last touch. Pure.
 */
import type { CalendarEvent, IsoDateTime } from '../types'

export type MeetingOutcome = 'held' | 'missed'

/** A member's answer for one meeting of their own calendar, by the event's Google id. */
export interface MeetingMark {
  eventKey: string
  outcome: MeetingOutcome
}

/** How long a meeting waits on Today for an answer; after that it stays held. */
export const CONFIRM_DAYS = 7

const DAY_MS = 86_400_000

/** The Google id of an event (sample events have none: their own id stands in). */
export function calendarEventKey(event: Pick<CalendarEvent, 'id' | 'externalId'>): string {
  return event.externalId ?? event.id
}

/**
 * A meeting its owner can mark held or missed: it has ended, has a time (not all day), was not
 * declined, and is not one of the CRM's own next-action events (those are follow-ups, which
 * count as missed on their own).
 */
export function isMarkable(event: CalendarEvent, now: Date): boolean {
  return (
    !event.allDay &&
    !event.uaRowId &&
    event.selfResponse !== 'declined' &&
    Date.parse(event.end) <= now.getTime()
  )
}

/**
 * Today's check-in: the member's meetings with a contact that ended in the last week and have
 * no answer yet, oldest first. `withContacts` holds the ids of events matched to a contact.
 */
export function meetingsToConfirm(
  events: readonly CalendarEvent[],
  withContacts: ReadonlySet<string>,
  outcomes: ReadonlyMap<string, MeetingOutcome>,
  now: Date,
): CalendarEvent[] {
  const since = now.getTime() - CONFIRM_DAYS * DAY_MS
  return events
    .filter(
      (e) =>
        isMarkable(e, now) &&
        Date.parse(e.end) > since &&
        withContacts.has(e.id) &&
        !outcomes.has(calendarEventKey(e)),
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
}

/** When each missed meeting started, for the 30-day field. */
export function missedMeetingStarts(
  events: readonly CalendarEvent[],
  outcomes: ReadonlyMap<string, MeetingOutcome>,
): IsoDateTime[] {
  return events.filter((e) => outcomes.get(calendarEventKey(e)) === 'missed').map((e) => e.start)
}
