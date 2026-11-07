/**
 * A small typed client for Google's OAuth and Calendar REST endpoints, with `fetch` and the base
 * URLs injected so tests point it at a fake (D-050: no googleapis package). Retries 429,
 * rate-limit 403s and 5xx with exponential backoff and jitter, up to 4 tries.
 */
import type { GoogleEvent } from '../../src/domain/calendar/google.js'
import type { ServerEnv } from './env.js'

export type GoogleErrorCode =
  | 'invalid_grant'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'not_found'
  | 'forbidden'
  | 'bad_request'
  | 'unauthorized'
  | 'push_unauthorized'

/** A failure from Google, by code only (Google's messages may carry personal data). */
export class GoogleError extends Error {
  readonly code: GoogleErrorCode
  readonly status: number
  constructor(code: GoogleErrorCode, status: number) {
    super(`Google request failed: ${code} (${status})`)
    this.name = 'GoogleError'
    this.code = code
    this.status = status
  }
}

export interface GoogleDeps {
  env: Pick<
    ServerEnv,
    | 'googleClientId'
    | 'googleClientSecret'
    | 'googleAuthUrl'
    | 'googleTokenUrl'
    | 'googleRevokeUrl'
    | 'googleApiBase'
    | 'calendarScope'
  >
  fetch: typeof fetch
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

export const MAX_TRIES = 4

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function reason(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as {
      error?: string | { errors?: { reason?: string }[]; status?: string }
    }
    if (typeof body.error === 'string') return body.error
    return body.error?.errors?.[0]?.reason ?? body.error?.status ?? ''
  } catch {
    return ''
  }
}

function retryable(status: number, why: string): boolean {
  if (status === 429 || status >= 500) return true
  return status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(why)
}

async function toError(response: Response): Promise<GoogleError> {
  const why = await reason(response)
  const status = response.status
  if (why === 'invalid_grant') return new GoogleError('invalid_grant', status)
  if (/push\.webhookUrl/i.test(why)) return new GoogleError('push_unauthorized', status)
  if (status === 429 || /rateLimitExceeded/.test(why))
    return new GoogleError('rate_limited', status)
  if (status >= 500) return new GoogleError('server', status)
  if (status === 401) return new GoogleError('unauthorized', status)
  if (status === 403) return new GoogleError('forbidden', status)
  if (status === 404 || status === 410) return new GoogleError('not_found', status)
  return new GoogleError('bad_request', status)
}

/** One request with retries. Returns the response when it is OK (2xx). */
async function request(deps: GoogleDeps, url: string, init: RequestInit): Promise<Response> {
  const sleep = deps.sleep ?? wait
  const random = deps.random ?? Math.random
  let last: GoogleError | null = null
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    if (attempt > 0) await sleep(2 ** (attempt - 1) * 500 + Math.floor(random() * 250))
    let response: Response
    try {
      response = await deps.fetch(url, init)
    } catch {
      last = new GoogleError('network', 0)
      continue
    }
    if (response.ok) return response
    const why = await reason(response)
    if (!retryable(response.status, why)) throw await toError(response)
    last = await toError(response)
  }
  throw last ?? new GoogleError('server', 0)
}

// ---------- OAuth ----------

export interface TokenResponse {
  accessToken: string
  refreshToken: string | null
  /** Space-separated scopes Google actually granted. */
  scope: string
  idToken: string | null
  expiresIn: number
}

export function authUrl(
  deps: Pick<GoogleDeps, 'env'>,
  params: { state: string; codeChallenge: string; redirectUri: string; loginHint?: string },
): string {
  const url = new URL(deps.env.googleAuthUrl)
  url.search = new URLSearchParams({
    client_id: deps.env.googleClientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: `openid email ${deps.env.calendarScope}`,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    ...(params.loginHint ? { login_hint: params.loginHint } : {}),
  }).toString()
  return url.toString()
}

function form(values: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values).toString(),
  }
}

function readToken(body: Record<string, unknown>): TokenResponse {
  return {
    accessToken: String(body.access_token ?? ''),
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    scope: typeof body.scope === 'string' ? body.scope : '',
    idToken: typeof body.id_token === 'string' ? body.id_token : null,
    expiresIn: Number(body.expires_in ?? 0),
  }
}

export async function exchangeCode(
  deps: GoogleDeps,
  params: { code: string; codeVerifier: string; redirectUri: string },
): Promise<TokenResponse> {
  const response = await request(
    deps,
    deps.env.googleTokenUrl,
    form({
      grant_type: 'authorization_code',
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
      client_id: deps.env.googleClientId,
      client_secret: deps.env.googleClientSecret,
    }),
  )
  return readToken((await response.json()) as Record<string, unknown>)
}

export async function refreshAccessToken(
  deps: GoogleDeps,
  refreshToken: string,
): Promise<TokenResponse> {
  const response = await request(
    deps,
    deps.env.googleTokenUrl,
    form({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: deps.env.googleClientId,
      client_secret: deps.env.googleClientSecret,
    }),
  )
  return readToken((await response.json()) as Record<string, unknown>)
}

export async function revokeToken(deps: GoogleDeps, token: string): Promise<void> {
  await request(deps, deps.env.googleRevokeUrl, form({ token }))
}

/**
 * The email in an id_token, read without verifying the signature: the token came straight from
 * Google's token endpoint over TLS (D-050).
 */
export function idTokenEmail(idToken: string | null): string | null {
  const payload = idToken?.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: unknown
    }
    return typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null
  } catch {
    return null
  }
}

/** Whether Google granted the calendar scope (the member may not have, D-050). */
export function hasCalendarScope(granted: string, wanted: string): boolean {
  return granted.split(/\s+/).includes(wanted)
}

// ---------- Calendar ----------

const PRIMARY = 'primary'

function auth(accessToken: string, extra: Record<string, string> = {}): HeadersInit {
  return { authorization: `Bearer ${accessToken}`, ...extra }
}

/** Every event in a window: series expanded, cancellations included, all pages. */
export async function listEvents(
  deps: GoogleDeps,
  accessToken: string,
  window: { timeMin: string; timeMax: string; updatedMin?: string },
): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 100; page++) {
    const url = new URL(`${deps.env.googleApiBase}/calendars/${PRIMARY}/events`)
    url.search = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      ...(window.updatedMin ? { updatedMin: window.updatedMin } : {}),
      ...(pageToken ? { pageToken } : {}),
    }).toString()
    const response = await request(deps, url.toString(), { headers: auth(accessToken) })
    const body = (await response.json()) as { items?: GoogleEvent[]; nextPageToken?: string }
    events.push(...(body.items ?? []))
    pageToken = body.nextPageToken
    if (!pageToken) break
  }
  return events
}

/** One event; null when Google says it is gone. */
export async function getEvent(
  deps: GoogleDeps,
  accessToken: string,
  eventId: string,
): Promise<GoogleEvent | null> {
  try {
    const response = await request(
      deps,
      `${deps.env.googleApiBase}/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}`,
      { headers: auth(accessToken) },
    )
    return (await response.json()) as GoogleEvent
  } catch (error) {
    if (error instanceof GoogleError && error.code === 'not_found') return null
    throw error
  }
}

export async function insertEvent(
  deps: GoogleDeps,
  accessToken: string,
  body: object,
  sendUpdates: 'all' | 'none',
): Promise<GoogleEvent> {
  const response = await request(
    deps,
    `${deps.env.googleApiBase}/calendars/${PRIMARY}/events?sendUpdates=${sendUpdates}`,
    {
      method: 'POST',
      headers: auth(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    },
  )
  return (await response.json()) as GoogleEvent
}

export async function patchEvent(
  deps: GoogleDeps,
  accessToken: string,
  eventId: string,
  body: object,
  sendUpdates: 'all' | 'none',
): Promise<GoogleEvent> {
  const response = await request(
    deps,
    `${deps.env.googleApiBase}/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`,
    {
      method: 'PATCH',
      headers: auth(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    },
  )
  return (await response.json()) as GoogleEvent
}

/** Deletes an event; an event already gone counts as deleted. */
export async function deleteEvent(
  deps: GoogleDeps,
  accessToken: string,
  eventId: string,
  sendUpdates: 'all' | 'none',
): Promise<void> {
  try {
    await request(
      deps,
      `${deps.env.googleApiBase}/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`,
      { method: 'DELETE', headers: auth(accessToken) },
    )
  } catch (error) {
    if (error instanceof GoogleError && error.code === 'not_found') return
    throw error
  }
}

/** Push notifications on the primary calendar (D-051). */
export async function watchEvents(
  deps: GoogleDeps,
  accessToken: string,
  channel: { id: string; token: string; address: string; ttlSeconds: number },
): Promise<{ resourceId: string; expiration: string }> {
  const response = await request(
    deps,
    `${deps.env.googleApiBase}/calendars/${PRIMARY}/events/watch`,
    {
      method: 'POST',
      headers: auth(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        id: channel.id,
        type: 'web_hook',
        address: channel.address,
        token: channel.token,
        params: { ttl: String(channel.ttlSeconds) },
      }),
    },
  )
  const body = (await response.json()) as { resourceId?: string; expiration?: string | number }
  return {
    resourceId: String(body.resourceId ?? ''),
    expiration: new Date(Number(body.expiration ?? 0)).toISOString(),
  }
}

export async function stopChannel(
  deps: GoogleDeps,
  accessToken: string,
  channel: { id: string; resourceId: string },
): Promise<void> {
  try {
    await request(deps, `${deps.env.googleApiBase}/channels/stop`, {
      method: 'POST',
      headers: auth(accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify(channel),
    })
  } catch (error) {
    if (error instanceof GoogleError && error.code === 'not_found') return
    throw error
  }
}
