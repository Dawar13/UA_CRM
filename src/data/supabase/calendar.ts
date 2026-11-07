/**
 * The browser side of Google Calendar on Supabase (Phase 2, D-050). Reads come straight from the
 * calendar tables, which policies limit to the member's own; actions go to the app's /api
 * functions with the member's Supabase token. Google tokens never reach the browser.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent } from '@/domain/types'
import { type CalendarConnection, CalendarError, NOT_CONNECTED } from '../repository'

type Record_ = Record<string, unknown>

/** POSTs to /api/calendar/<path> as the signed-in member; a refusal throws its code. */
export async function calendarApi(
  client: SupabaseClient,
  path: string,
  body: Record_ = {},
): Promise<Record_> {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new CalendarError('unauthorized')
  let response: Response
  try {
    response = await fetch(`/api/calendar/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new CalendarError('network')
  }
  const result = (await response.json().catch(() => ({}))) as Record_
  if (!response.ok) {
    throw new CalendarError(
      typeof result.error === 'string' ? result.error : `http_${response.status}`,
    )
  }
  return result
}

export function toConnection(row: Record_ | null): CalendarConnection {
  if (!row || row.status === 'revoked') return NOT_CONNECTED
  return {
    state: row.status === 'needs_reconnect' ? 'needs_reconnect' : 'active',
    googleEmail: (row.google_email as string | null) ?? null,
    connectedAt: (row.connected_at as string | null) ?? null,
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
    lastErrorCode: (row.last_error_code as string | null) ?? null,
  }
}

const iso = (value: unknown) => new Date(String(value)).toISOString()

/** A stored Google event as the panel and the week page show it. */
export function toCalendarEvent(row: Record_): CalendarEvent {
  const attendees = Array.isArray(row.attendees) ? (row.attendees as Record_[]) : []
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    title: String(row.summary ?? ''),
    start: iso(row.start_at),
    end: iso(row.end_at),
    attendees: attendees.map((a) => ({
      email: String(a.email ?? ''),
      ...(a.name ? { name: String(a.name) } : {}),
      ...(a.responseStatus
        ? {
            responseStatus: a.responseStatus as
              | 'accepted'
              | 'declined'
              | 'tentative'
              | 'needsAction',
          }
        : {}),
      ...(a.self ? { self: true } : {}),
    })),
    ...(row.location ? { location: String(row.location) } : {}),
    source: 'google',
    externalId: String(row.google_event_id),
    allDay: Boolean(row.all_day),
    ...(row.html_link ? { htmlLink: String(row.html_link) } : {}),
    recurringEventId: (row.recurring_event_id as string | null) ?? null,
    selfResponse: (row.self_response as CalendarEvent['selfResponse']) ?? null,
    uaRowId: (row.ua_row_id as string | null) ?? null,
  }
}
