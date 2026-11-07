import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalendarError, NOT_CONNECTED } from '@/data/repository'
import { calendarApi, toCalendarEvent, toConnection } from '@/data/supabase/calendar'

function clientWith(token: string | null): SupabaseClient {
  return {
    auth: {
      getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
    },
  } as unknown as SupabaseClient
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toConnection', () => {
  it('reads no row, or a revoked one, as not connected', () => {
    expect(toConnection(null)).toEqual(NOT_CONNECTED)
    expect(toConnection({ status: 'revoked', google_email: 'a@b.example' })).toEqual(NOT_CONNECTED)
  })

  it('keeps the state, the account and when it last synced', () => {
    expect(
      toConnection({
        status: 'needs_reconnect',
        google_email: 'a@b.example',
        connected_at: '2026-11-05T03:30:00.000Z',
        last_synced_at: '2026-11-05T04:40:00.000Z',
        last_error_code: 'invalid_grant',
      }),
    ).toEqual({
      state: 'needs_reconnect',
      googleEmail: 'a@b.example',
      connectedAt: '2026-11-05T03:30:00.000Z',
      lastSyncedAt: '2026-11-05T04:40:00.000Z',
      lastErrorCode: 'invalid_grant',
    })
    expect(toConnection({ status: 'active' }).state).toBe('active')
  })
})

describe('toCalendarEvent', () => {
  it('maps a stored Google event for the panel and the week page', () => {
    const event = toCalendarEvent({
      id: 'db-1',
      member_id: 'm-1',
      google_event_id: 'g-1',
      recurring_event_id: 'series-1',
      summary: 'Plant visit',
      location: 'Hosur',
      html_link: 'https://calendar.example/g-1',
      start_at: '2026-11-06T04:30:00+00:00',
      end_at: '2026-11-06T05:30:00+00:00',
      all_day: false,
      attendees: [
        { email: 'rohan@hpf.example', name: 'Rohan', responseStatus: 'accepted' },
        { email: 'me@example.com', self: true },
      ],
      self_response: 'accepted',
      ua_row_id: null,
    })
    expect(event).toEqual({
      id: 'db-1',
      memberId: 'm-1',
      title: 'Plant visit',
      start: '2026-11-06T04:30:00.000Z',
      end: '2026-11-06T05:30:00.000Z',
      attendees: [
        { email: 'rohan@hpf.example', name: 'Rohan', responseStatus: 'accepted' },
        { email: 'me@example.com', self: true },
      ],
      location: 'Hosur',
      source: 'google',
      externalId: 'g-1',
      allDay: false,
      htmlLink: 'https://calendar.example/g-1',
      recurringEventId: 'series-1',
      selfResponse: 'accepted',
      uaRowId: null,
    })
  })
})

describe('calendarApi', () => {
  it('posts as the signed-in member', async () => {
    const fetch = vi.fn(async () => Response.json({ url: 'https://accounts.example/consent' }))
    vi.stubGlobal('fetch', fetch)
    expect(await calendarApi(clientWith('jwt-1'), 'connect', { returnPath: '/today' })).toEqual({
      url: 'https://accounts.example/consent',
    })
    expect(fetch).toHaveBeenCalledWith('/api/calendar/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer jwt-1' },
      body: JSON.stringify({ returnPath: '/today' }),
    })
  })

  it('turns a refusal, a server without settings or no network into a code', async () => {
    const code = (promise: Promise<unknown>) =>
      promise.then(
        () => 'resolved',
        (error: unknown) => (error instanceof CalendarError ? error.code : 'other'),
      )
    expect(await code(calendarApi(clientWith(null), 'sync'))).toBe('unauthorized')

    vi.stubGlobal('fetch', async () => Response.json({ error: 'fuzzy_date' }, { status: 422 }))
    expect(await code(calendarApi(clientWith('t'), 'next-action-event'))).toBe('fuzzy_date')

    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }))
    expect(await code(calendarApi(clientWith('t'), 'sync'))).toBe('http_500')

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    expect(await code(calendarApi(clientWith('t'), 'sync'))).toBe('network')
  })
})
