/**
 * An in-memory Google (OAuth + Calendar v3) behind a `fetch` function, for tests and local
 * development (Phase 2, D-050). It checks PKCE, pages results, filters time windows the way Google
 * does (by end after timeMin and start before timeMax), returns cancellations with showDeleted,
 * keeps private extended properties, opens push channels, and has a controllable clock and
 * injectable faults.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { GoogleEvent } from '../../../src/domain/calendar/google'

export const FAKE = {
  authUrl: 'https://fake.google/o/oauth2/v2/auth',
  tokenUrl: 'https://fake.google/token',
  revokeUrl: 'https://fake.google/revoke',
  apiBase: 'https://fake.google/calendar/v3',
  scope: 'https://www.googleapis.com/auth/calendar.events.owned',
} as const

export type Fault =
  | 'rate_limit'
  | 'server_error'
  | 'network'
  | 'invalid_grant'
  | 'missing_scope'
  | 'no_refresh_token'
  | 'push_unauthorized'

interface Account {
  email: string
  events: Map<string, GoogleEvent>
}

export interface FakeGoogle {
  fetch: typeof fetch
  /** The member approves consent: returns the code Google would redirect back with. */
  approve(email: string, authUrl: string): { code: string; state: string }
  now(): Date
  setNow(date: Date | string): void
  /** Faults applied to the next matching requests, in order. */
  fail(...faults: Fault[]): void
  account(email: string): Account
  addEvent(email: string, event: Partial<GoogleEvent> & { id?: string }): GoogleEvent
  /** Moves or edits an event as if in Google Calendar. */
  editEvent(email: string, id: string, patch: Partial<GoogleEvent>): GoogleEvent
  /** Deletes as Google Calendar does: kept as cancelled (showDeleted returns it). */
  deleteEvent(email: string, id: string): void
  /** Gone without trace (beyond Google's retention of deleted events). */
  purgeEvent(email: string, id: string): void
  revokeAll(email: string): void
  calls: { method: string; path: string; query: Record<string, string> }[]
  channels: Map<string, { email: string; token: string; address: string; resourceId: string }>
  revoked: Set<string>
  /** Requests to the insert, patch and delete endpoints, with their sendUpdates. */
  writes: { method: string; id: string; sendUpdates: string | null }[]
}

const b64url = (text: string) => Buffer.from(text).toString('base64url')

function idToken(email: string): string {
  return `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ email, email_verified: true }))}.sig`
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function googleError(status: number, reason: string): Response {
  return jsonResponse({ error: { code: status, errors: [{ reason }], status: reason } }, status)
}

function instantOf(value: GoogleEvent['start']): number {
  if (value?.dateTime) return Date.parse(value.dateTime)
  if (value?.date) return Date.parse(`${value.date}T00:00:00+05:30`)
  return 0
}

export function createFakeGoogle(start: Date | string = '2026-11-06T06:30:00Z'): FakeGoogle {
  let now = new Date(start)
  const accounts = new Map<string, Account>()
  const codes = new Map<string, { email: string; challenge: string; redirectUri: string }>()
  const refreshTokens = new Map<string, string>()
  const accessTokens = new Map<string, string>()
  const faults: Fault[] = []
  const calls: FakeGoogle['calls'] = []
  const channels: FakeGoogle['channels'] = new Map()
  const revoked = new Set<string>()
  const writes: FakeGoogle['writes'] = []

  const account = (email: string): Account => {
    let a = accounts.get(email)
    if (!a) {
      a = { email, events: new Map() }
      accounts.set(email, a)
    }
    return a
  }

  const takeFault = (...kinds: Fault[]): Fault | null => {
    const index = faults.findIndex((f) => kinds.includes(f))
    if (index === -1) return null
    return faults.splice(index, 1)[0] ?? null
  }

  const stamp = (event: GoogleEvent): GoogleEvent => ({ ...event, updated: now.toISOString() })

  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams) })
    if (takeFault('network')) throw new TypeError('fetch failed')
    if (takeFault('rate_limit')) return googleError(429, 'rateLimitExceeded')
    if (takeFault('server_error')) return googleError(500, 'backendError')

    const form = () => new URLSearchParams(String(init?.body ?? ''))
    const body = () => JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>

    // ---------- OAuth ----------
    if (url.href === FAKE.tokenUrl) {
      const f = form()
      if (f.get('grant_type') === 'authorization_code') {
        const issued = codes.get(f.get('code') ?? '')
        codes.delete(f.get('code') ?? '')
        const verifier = f.get('code_verifier') ?? ''
        const challenge = createHash('sha256').update(verifier).digest('base64url')
        if (
          !issued ||
          issued.challenge !== challenge ||
          issued.redirectUri !== f.get('redirect_uri')
        ) {
          return jsonResponse({ error: 'invalid_grant' }, 400)
        }
        const refresh = `rt-${randomUUID()}`
        const access = `at-${randomUUID()}`
        refreshTokens.set(refresh, issued.email)
        accessTokens.set(access, issued.email)
        return jsonResponse({
          access_token: access,
          expires_in: 3599,
          ...(takeFault('no_refresh_token') ? {} : { refresh_token: refresh }),
          scope: takeFault('missing_scope') ? 'openid email' : `openid email ${FAKE.scope}`,
          id_token: idToken(issued.email),
          token_type: 'Bearer',
        })
      }
      if (f.get('grant_type') === 'refresh_token') {
        const email = refreshTokens.get(f.get('refresh_token') ?? '')
        if (!email || takeFault('invalid_grant'))
          return jsonResponse({ error: 'invalid_grant' }, 400)
        const access = `at-${randomUUID()}`
        accessTokens.set(access, email)
        return jsonResponse({
          access_token: access,
          expires_in: 3599,
          scope: `openid email ${FAKE.scope}`,
        })
      }
      return jsonResponse({ error: 'unsupported_grant_type' }, 400)
    }
    if (url.href === FAKE.revokeUrl) {
      const token = form().get('token') ?? ''
      const email = refreshTokens.get(token)
      if (email) {
        refreshTokens.delete(token)
        revoked.add(email)
      }
      return new Response(null, { status: 200 })
    }

    // ---------- Calendar ----------
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? ''
    const email = accessTokens.get(auth.replace(/^Bearer /, ''))
    if (!email) return googleError(401, 'authError')
    const cal = account(email)
    const path = url.pathname.replace('/calendar/v3', '')

    if (path === '/channels/stop' && method === 'POST') {
      channels.delete(String(body().id))
      return new Response(null, { status: 204 })
    }
    if (path === '/calendars/primary/events/watch' && method === 'POST') {
      if (takeFault('push_unauthorized')) return googleError(400, 'push.webhookUrlUnauthorized')
      const b = body()
      const resourceId = `res-${randomUUID()}`
      const params = b.params as { ttl?: string } | undefined
      channels.set(String(b.id), {
        email,
        token: String(b.token),
        address: String(b.address),
        resourceId,
      })
      return jsonResponse({
        kind: 'api#channel',
        id: b.id,
        resourceId,
        expiration: String(now.getTime() + Number(params?.ttl ?? 604800) * 1000),
      })
    }
    if (path === '/calendars/primary/events' && method === 'GET') {
      const q = url.searchParams
      const min = Date.parse(q.get('timeMin') ?? '1970-01-01T00:00:00Z')
      const max = Date.parse(q.get('timeMax') ?? '9999-01-01T00:00:00Z')
      const updatedMin = q.get('updatedMin') ? Date.parse(q.get('updatedMin') ?? '') : null
      const showDeleted = q.get('showDeleted') === 'true'
      const all = [...cal.events.values()]
        .filter((e) => showDeleted || e.status !== 'cancelled')
        .filter((e) => {
          const s = instantOf(e.start ?? e.originalStartTime)
          const end = e.end ? instantOf(e.end) : s
          return end > min && s < max
        })
        .filter((e) => updatedMin === null || Date.parse(e.updated ?? '') >= updatedMin)
        .sort(
          (a, b) =>
            instantOf(a.start ?? a.originalStartTime) - instantOf(b.start ?? b.originalStartTime),
        )
      const size = Number(q.get('maxResults') ?? '250')
      const offset = Number(q.get('pageToken') ?? '0')
      const page = all.slice(offset, offset + size)
      return jsonResponse({
        items: page,
        ...(offset + size < all.length ? { nextPageToken: String(offset + size) } : {}),
      })
    }
    const one = /^\/calendars\/primary\/events\/([^/]+)$/.exec(path)
    if (one) {
      const id = decodeURIComponent(one[1] ?? '')
      const existing = cal.events.get(id)
      if (method === 'GET') return existing ? jsonResponse(existing) : googleError(404, 'notFound')
      writes.push({ method, id, sendUpdates: url.searchParams.get('sendUpdates') })
      if (method === 'DELETE') {
        if (!existing || existing.status === 'cancelled') return googleError(410, 'deleted')
        cal.events.set(id, stamp({ ...existing, status: 'cancelled' }))
        return new Response(null, { status: 204 })
      }
      if (method === 'PATCH') {
        if (!existing || existing.status === 'cancelled') return googleError(404, 'notFound')
        const updated = stamp({ ...existing, ...(body() as Partial<GoogleEvent>) })
        cal.events.set(id, updated)
        return jsonResponse(updated)
      }
    }
    if (path === '/calendars/primary/events' && method === 'POST') {
      const id = `evt${randomUUID().replace(/-/g, '')}`
      writes.push({ method, id, sendUpdates: url.searchParams.get('sendUpdates') })
      const created = stamp({
        ...(body() as Partial<GoogleEvent>),
        id,
        status: 'confirmed',
        htmlLink: `https://calendar.example/event?eid=${id}`,
      } as GoogleEvent)
      cal.events.set(id, created)
      return jsonResponse(created)
    }
    return googleError(404, 'notFound')
  }) as typeof fetch

  return {
    fetch: fakeFetch,
    approve(email, authUrl) {
      const url = new URL(authUrl)
      const code = `code-${randomUUID()}`
      codes.set(code, {
        email,
        challenge: url.searchParams.get('code_challenge') ?? '',
        redirectUri: url.searchParams.get('redirect_uri') ?? '',
      })
      return { code, state: url.searchParams.get('state') ?? '' }
    },
    now: () => now,
    setNow(date) {
      now = new Date(date)
    },
    fail(...more) {
      faults.push(...more)
    },
    account,
    addEvent(email, event) {
      const id = event.id ?? `evt${randomUUID().replace(/-/g, '')}`
      const full = stamp({
        status: 'confirmed',
        summary: '',
        htmlLink: `https://calendar.example/event?eid=${id}`,
        ...event,
        id,
      } as GoogleEvent)
      account(email).events.set(id, full)
      return full
    },
    editEvent(email, id, patch) {
      const cal = account(email)
      const existing = cal.events.get(id)
      if (!existing) throw new Error(`No event ${id}`)
      const updated = stamp({ ...existing, ...patch })
      cal.events.set(id, updated)
      return updated
    },
    deleteEvent(email, id) {
      const cal = account(email)
      const existing = cal.events.get(id)
      if (existing) cal.events.set(id, stamp({ ...existing, status: 'cancelled' }))
    },
    purgeEvent(email, id) {
      account(email).events.delete(id)
    },
    revokeAll(email) {
      for (const [token, owner] of refreshTokens) if (owner === email) refreshTokens.delete(token)
    },
    calls,
    channels,
    revoked,
    writes,
  }
}
