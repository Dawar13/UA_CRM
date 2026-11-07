/**
 * Google Calendar, as the CRM stores it (Phase 2, D-050). Pure TypeScript with no imports outside
 * this folder, so the Vercel functions in api/ can import it without the app's path aliases.
 * Relative imports in this folder carry their `.js` extension for the same reason.
 */

/** 5 Nov 2026 00:00 IST: nothing earlier is fetched or logged. */
export const SYNC_START = '2026-11-04T18:30:00.000Z'

/** IST is a fixed UTC+5:30 (no daylight saving). */
export const IST_OFFSET_MS = 330 * 60_000
export const DAY_MS = 86_400_000

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled'
export type ResponseStatus = 'accepted' | 'declined' | 'tentative' | 'needsAction'

/** The CRM's own events carry this in their private extended properties. */
export const UA_KIND_NEXT_ACTION = 'next-action'

/** The part of a Google Calendar API event the CRM reads. */
export interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  updated?: string
  recurringEventId?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  originalStartTime?: { dateTime?: string; date?: string }
  attendees?: {
    email?: string
    displayName?: string
    responseStatus?: string
    self?: boolean
    organizer?: boolean
  }[]
  organizer?: { email?: string; self?: boolean }
  extendedProperties?: { private?: Record<string, string> }
}

export interface StoredAttendee {
  /** Lowercased and trimmed. */
  email: string
  name?: string
  responseStatus?: ResponseStatus
  self?: boolean
}

/** One event as stored in `calendar_events` (and read by the browser). */
export interface StoredEvent {
  googleEventId: string
  /** The series an instance belongs to (`singleEvents=true` expands series into instances). */
  recurringEventId: string | null
  status: EventStatus
  summary: string
  location: string
  htmlLink: string
  /** UTC instants. For all-day events, IST midnight of the first day and of the day after. */
  startAt: string
  endAt: string
  allDay: boolean
  /** All-day events only: the first day and the day after the last (Google's end is exclusive). */
  startDate: string | null
  endDate: string | null
  timeZone: string | null
  attendees: StoredAttendee[]
  /** The member's own answer; null when they organise it with no guest list. */
  selfResponse: ResponseStatus | null
  uaRowId: string | null
  uaKind: string | null
  googleUpdatedAt: string | null
}

const RESPONSES: readonly ResponseStatus[] = ['accepted', 'declined', 'tentative', 'needsAction']

export function normaliseEmail(raw: string | undefined | null): string {
  return (raw ?? '')
    .trim()
    .replace(/^mailto:/i, '')
    .toLowerCase()
}

function response(raw: string | undefined): ResponseStatus | undefined {
  return RESPONSES.find((r) => r === raw)
}

function status(raw: string | undefined): EventStatus {
  return raw === 'cancelled' || raw === 'tentative' ? raw : 'confirmed'
}

/** IST midnight of a calendar date ("2026-11-05"), as a UTC instant. */
export function istMidnight(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - IST_OFFSET_MS).toISOString()
}

/** The IST calendar date of an instant. */
export function istDate(instant: string | Date): string {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime()
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

function instant(value: { dateTime?: string; date?: string } | undefined): string | null {
  if (value?.dateTime) {
    const ms = Date.parse(value.dateTime)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
  }
  if (value?.date) return istMidnight(value.date)
  return null
}

/**
 * A Google event in the stored shape. `selfEmails` are the member's own addresses (the connected
 * Google account), so their own attendee entry is known even when Google omits `self`.
 * A cancelled instance may carry only its id and original start; it is kept so the cancellation
 * can be applied.
 */
export function normaliseEvent(event: GoogleEvent, selfEmails: readonly string[]): StoredEvent {
  const selves = new Set(selfEmails.map(normaliseEmail).filter(Boolean))
  const allDay = Boolean(event.start?.date && !event.start?.dateTime)
  const startDate = allDay ? (event.start?.date ?? null) : null
  const endDate = allDay ? (event.end?.date ?? (startDate ? addDays(startDate, 1) : null)) : null
  const fallback = instant(event.originalStartTime) ?? SYNC_START
  const startAt = instant(event.start) ?? fallback
  const endAt =
    instant(allDay && endDate ? { date: endDate } : event.end) ??
    new Date(Date.parse(startAt) + 30 * 60_000).toISOString()

  const attendees: StoredAttendee[] = (event.attendees ?? [])
    .map((a) => {
      const email = normaliseEmail(a.email)
      const out: StoredAttendee = { email }
      if (a.displayName?.trim()) out.name = a.displayName.trim()
      const r = response(a.responseStatus)
      if (r) out.responseStatus = r
      if (a.self || selves.has(email)) out.self = true
      return out
    })
    .filter((a) => a.email !== '')
  const own = attendees.find((a) => a.self)
  const privateProps = event.extendedProperties?.private ?? {}

  return {
    googleEventId: event.id,
    recurringEventId: event.recurringEventId ?? null,
    status: status(event.status),
    summary: (event.summary ?? '').trim(),
    location: (event.location ?? '').trim(),
    htmlLink: event.htmlLink ?? '',
    startAt,
    endAt,
    allDay,
    startDate,
    endDate,
    timeZone: event.start?.timeZone ?? null,
    attendees,
    selfResponse: own?.responseStatus ?? null,
    uaRowId: privateProps.uaRowId ?? null,
    uaKind: privateProps.uaKind ?? null,
    googleUpdatedAt: event.updated ?? null,
  }
}

/** The IST calendar days an event covers, in order (multi-day events cover several). */
export function eventDays(
  event: Pick<StoredEvent, 'allDay' | 'startDate' | 'endDate' | 'startAt' | 'endAt'>,
): string[] {
  const first = event.allDay && event.startDate ? event.startDate : istDate(event.startAt)
  // The last day: the day before an exclusive all-day end, or the day of the last instant.
  const last =
    event.allDay && event.endDate
      ? addDays(event.endDate, -1)
      : istDate(new Date(Math.max(Date.parse(event.startAt), Date.parse(event.endAt) - 1)))
  const days: string[] = []
  for (let day = first; day <= last && days.length < 62; day = addDays(day, 1)) days.push(day)
  return days.length > 0 ? days : [first]
}

// ---------- The sync window (D-050) ----------

export interface SyncWindow {
  timeMin: string
  timeMax: string
}

/** How far ahead every sync looks, and how far back a regular one goes. */
export const AHEAD_DAYS = 60
export const BEHIND_DAYS = 14
/** Stored events older than this are purged (history already written stays). */
export const KEEP_DAYS = 30

/**
 * The window to fetch. The first sync starts on 5 Nov 2026. Later ones go back 14 days, or to a
 * day before the last good sync if that is earlier (a reconnect or a gap), never before 5 Nov.
 */
export function syncWindow(now: Date, lastSyncedAt: Date | null): SyncWindow {
  const start = Date.parse(SYNC_START)
  const timeMax = new Date(now.getTime() + AHEAD_DAYS * DAY_MS).toISOString()
  if (!lastSyncedAt) return { timeMin: SYNC_START, timeMax }
  const back = Math.min(now.getTime() - BEHIND_DAYS * DAY_MS, lastSyncedAt.getTime() - DAY_MS)
  return { timeMin: new Date(Math.max(start, back)).toISOString(), timeMax }
}

/** Events that ended before this are purged from storage. */
export function purgeBefore(now: Date): string {
  return new Date(now.getTime() - KEEP_DAYS * DAY_MS).toISOString()
}
