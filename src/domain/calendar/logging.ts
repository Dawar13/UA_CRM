/**
 * Which rows an event matches, and which meetings become history (Phase 2, C3 and C4). Pure and
 * import-free beyond this folder, so the server's sync uses the same rules as the browser.
 */
import { normaliseEmail, type StoredEvent, SYNC_START, UA_KIND_NEXT_ACTION } from './google.js'

/** A row as matching sees it: only the owner's rows are ever written to. */
export interface MatchRow {
  id: string
  email: string
  ownerId: string
}

/** A link the member made by hand: one event, or every instance of a series. */
export interface EventLink {
  googleEventId: string | null
  recurringEventId: string | null
  rowId: string
  kind: 'confirmed' | 'dismissed'
}

/** Attendee emails of an event, without the member's own. */
export function guestEmails(event: StoredEvent, selfEmails: readonly string[]): Set<string> {
  const selves = new Set(selfEmails.map(normaliseEmail).filter(Boolean))
  return new Set(
    event.attendees
      .filter((a) => !a.self && a.email !== '' && !selves.has(a.email))
      .map((a) => a.email),
  )
}

/** Rows whose email is one of the event's guests. */
export function matchByEmail<R extends MatchRow>(
  event: StoredEvent,
  rows: readonly R[],
  selfEmails: readonly string[],
): R[] {
  const guests = guestEmails(event, selfEmails)
  if (guests.size === 0) return []
  return rows.filter((row) => {
    const email = normaliseEmail(row.email)
    return email !== '' && guests.has(email)
  })
}

/** Links that apply to an event: to it directly, or to its whole series. */
export function linksFor(event: StoredEvent, links: readonly EventLink[]): EventLink[] {
  return links.filter(
    (l) =>
      (l.googleEventId !== null && l.googleEventId === event.googleEventId) ||
      (l.recurringEventId !== null &&
        event.recurringEventId !== null &&
        l.recurringEventId === event.recurringEventId),
  )
}

/** The text of an auto-logged meeting. */
export function meetingText(event: StoredEvent): string {
  return event.summary.trim() || 'Meeting'
}

/** What makes an entry unique per row: the Google id (instances of a series have their own). */
export function meetingKey(event: StoredEvent): string {
  return event.googleEventId
}

export type SkipReason =
  | 'not-ended'
  | 'before-sync-start'
  | 'cancelled'
  | 'declined'
  | 'crm-next-action'
  | 'no-own-match'

/**
 * The member's own rows an event writes a meeting into (C4): it ended before now, started on or
 * after 5 Nov 2026, is not cancelled, was not declined, is not a CRM next-action event, and is
 * matched by email or a confirmed link to the member's own rows. Title suggestions never count
 * until confirmed.
 */
export function meetingRows(
  event: StoredEvent,
  now: Date,
  context: {
    memberId: string
    ownRows: readonly MatchRow[]
    links: readonly EventLink[]
    selfEmails: readonly string[]
  },
): { rowIds: string[]; skipped?: SkipReason } {
  if (Date.parse(event.endAt) >= now.getTime()) return { rowIds: [], skipped: 'not-ended' }
  if (Date.parse(event.startAt) < Date.parse(SYNC_START)) {
    return { rowIds: [], skipped: 'before-sync-start' }
  }
  if (event.status === 'cancelled') return { rowIds: [], skipped: 'cancelled' }
  if (event.selfResponse === 'declined') return { rowIds: [], skipped: 'declined' }
  if (event.uaKind === UA_KIND_NEXT_ACTION) return { rowIds: [], skipped: 'crm-next-action' }

  const own = context.ownRows.filter((r) => r.ownerId === context.memberId)
  const ownIds = new Set(own.map((r) => r.id))
  const byEmail = matchByEmail(event, own, context.selfEmails).map((r) => r.id)
  const applying = linksFor(event, context.links)
  const dismissed = new Set(applying.filter((l) => l.kind === 'dismissed').map((l) => l.rowId))
  const confirmed = applying
    .filter((l) => l.kind === 'confirmed' && ownIds.has(l.rowId))
    .map((l) => l.rowId)
  const rowIds = [...new Set([...byEmail, ...confirmed])].filter(
    (id) => !dismissed.has(id) || confirmed.includes(id),
  )
  return rowIds.length > 0 ? { rowIds } : { rowIds: [], skipped: 'no-own-match' }
}
