/**
 * The calendar endpoints (Phase 2, D-050). Each acts only on the caller's own connection and
 * rows: the member comes from their own Supabase token, never from the request body.
 */
import { timingSafeEqual } from 'node:crypto'
import { normaliseEvent } from '../../src/domain/calendar/google.js'
import {
  FuzzyDateError,
  nextActionEventBody,
  sendUpdatesFor,
} from '../../src/domain/calendar/nextActionEvent.js'
import { open, pkceChallenge, randomToken, seal, sha256 } from './crypto.js'
import { callbackUrl, type ServerEnv } from './env.js'
import {
  authUrl,
  deleteEvent,
  exchangeCode,
  GoogleError,
  hasCalendarScope,
  idTokenEmail,
  insertEvent,
  patchEvent,
  revokeToken,
  stopChannel,
} from './google.js'
import { bearer, json, methodNotAllowed, readJson, redirect } from './http.js'
import type { MemberInfo, RowGateway } from './store.js'
import { accessTokenFor, type SyncDeps, type SyncReason, syncMember } from './sync.js'

export interface Caller {
  member: MemberInfo
  token: string
}

export interface HandlerDeps extends SyncDeps {
  env: ServerEnv
  /** The active member behind a request's Supabase token, or null. */
  authenticate: (request: Request) => Promise<Caller | null>
  /** The caller's own rows, through their own token (row policies apply). */
  rowsFor: (caller: Caller) => RowGateway
}

export const STATE_TTL_MS = 10 * 60_000
/** Sync now: at most once a minute per member; sooner returns the last result. */
export const SYNC_MIN_GAP_MS = 60_000
/** The daily job stops starting new syncs after this, to finish within the function limit. */
export const CRON_BUDGET_MS = 50_000

const unauthorized = () => json({ error: 'unauthorized' }, 401)

function safeReturnPath(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && raw.length < 300
    ? raw
    : '/'
}

function withParams(base: string, path: string, params: string): string {
  return `${base}${path}${path.includes('?') ? '&' : '?'}${params}`
}

// ---------- Connect and callback ----------

export async function handleConnect(deps: HandlerDeps, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const caller = await deps.authenticate(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const now = deps.now()
  const nonce = randomToken(24)
  const verifier = randomToken(48)
  await deps.store.deleteExpiredStates(now)
  await deps.store.createState({
    nonce,
    memberId: caller.member.id,
    codeVerifier: verifier,
    returnPath: safeReturnPath(body.returnPath),
    expiresAt: new Date(now.getTime() + STATE_TTL_MS).toISOString(),
  })
  deps.log('calendar.connect.start', { member: caller.member.id })
  return json({
    url: authUrl(deps.google, {
      state: nonce,
      codeChallenge: pkceChallenge(verifier),
      redirectUri: callbackUrl(deps.env),
      loginHint: caller.member.email,
    }),
  })
}

export async function handleCallback(deps: HandlerDeps, request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const url = new URL(request.url)
  const base = deps.env.appBaseUrl
  const taken = await deps.store.takeState(url.searchParams.get('state') ?? '', deps.now())
  if (!taken.ok) {
    deps.log('calendar.connect.refused', { reason: taken.reason })
    return redirect(withParams(base, '/', `calendar=error&reason=${taken.reason}`))
  }
  const { state } = taken
  const fail = (reason: string) => {
    deps.log('calendar.connect.failed', { member: state.memberId, reason })
    return redirect(withParams(base, state.returnPath, `calendar=error&reason=${reason}`))
  }
  if (url.searchParams.get('error')) return fail('denied')
  const code = url.searchParams.get('code')
  if (!code) return fail('no_code')

  let tokens: Awaited<ReturnType<typeof exchangeCode>>
  try {
    tokens = await exchangeCode(deps.google, {
      code,
      codeVerifier: state.codeVerifier,
      redirectUri: callbackUrl(deps.env),
    })
  } catch (error) {
    return fail(error instanceof GoogleError ? `exchange_${error.code}` : 'exchange_failed')
  }
  // All-or-nothing consent should grant it, but the token response is the truth (D-050).
  if (!hasCalendarScope(tokens.scope, deps.env.calendarScope)) return fail('scope_missing')
  if (!tokens.refreshToken) return fail('no_refresh_token')

  const now = deps.now().toISOString()
  await deps.store.upsertConnection({
    memberId: state.memberId,
    googleEmail: idTokenEmail(tokens.idToken) ?? '',
    scopes: tokens.scope,
    status: 'active',
    connectedAt: now,
    lastErrorCode: null,
    lastErrorAt: null,
    syncLockUntil: null,
  })
  await deps.store.saveSecret(
    state.memberId,
    seal(tokens.refreshToken, deps.env.tokenKeys, deps.env.tokenKeyVersion),
  )
  const outcome = await syncMember(deps, state.memberId, 'connect')
  deps.log('calendar.connect.done', { member: state.memberId, sync: outcome.status })
  return redirect(withParams(base, state.returnPath, 'calendar=connected'))
}

// ---------- Sync and disconnect ----------

const SYNC_REASONS: readonly SyncReason[] = ['open', 'interval', 'manual']

export async function handleSync(deps: HandlerDeps, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const caller = await deps.authenticate(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const reason = SYNC_REASONS.find((r) => r === body.reason) ?? 'manual'
  const connection = await deps.store.getConnection(caller.member.id)
  if (!connection || connection.status === 'revoked') return json({ status: 'not_connected' })
  const now = deps.now().getTime()
  if (connection.lastAttemptAt && now - Date.parse(connection.lastAttemptAt) < SYNC_MIN_GAP_MS) {
    return json({
      status: connection.status === 'active' ? 'recent' : connection.status,
      lastSyncedAt: connection.lastSyncedAt,
      counts: connection.lastResult,
      errorCode: connection.lastErrorCode,
    })
  }
  return json(await syncMember(deps, caller.member.id, reason))
}

export async function handleDisconnect(deps: HandlerDeps, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const caller = await deps.authenticate(request)
  if (!caller) return unauthorized()
  const memberId = caller.member.id
  const connection = await deps.store.getConnection(memberId)
  if (connection && connection.status !== 'revoked') {
    // Best effort at Google: the local wipe happens whatever Google says.
    try {
      const sealed = await deps.store.getSecret(memberId)
      if (connection.channelId && connection.channelResourceId) {
        const accessToken = await accessTokenFor(deps, memberId)
        await stopChannel(deps.google, accessToken, {
          id: connection.channelId,
          resourceId: connection.channelResourceId,
        })
      }
      if (sealed) await revokeToken(deps.google, open(sealed, deps.env.tokenKeys))
    } catch (error) {
      deps.log('calendar.disconnect.google_failed', {
        member: memberId,
        code: error instanceof GoogleError ? error.code : 'unknown',
      })
    }
    await deps.store.wipe(memberId)
    await deps.store.updateConnection(memberId, {
      status: 'revoked',
      channelId: null,
      channelResourceId: null,
      channelExpiresAt: null,
      channelTokenHash: null,
      syncLockUntil: null,
      lastErrorCode: null,
      lastErrorAt: null,
      lastResult: null,
    })
    deps.log('calendar.disconnect.done', { member: memberId })
  }
  return json({ status: 'revoked' })
}

// ---------- Next actions as events (C5) ----------

export async function handleNextActionEvent(
  deps: HandlerDeps,
  request: Request,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const caller = await deps.authenticate(request)
  if (!caller) return unauthorized()
  const body = await readJson(request)
  const memberId = caller.member.id
  const connection = await deps.store.getConnection(memberId)
  if (connection?.status !== 'active') return json({ error: 'not_connected' }, 409)
  const rowId = typeof body.rowId === 'string' ? body.rowId : ''
  const rows = deps.rowsFor(caller)
  // Only the caller's own live row: another member's row is refused, never read.
  const row = await rows.getRow(rowId)
  if (!row) return json({ error: 'not_yours' }, 403)

  const accessToken = await accessTokenFor(deps, memberId).catch(() => null)
  if (!accessToken) return json({ error: 'needs_reconnect' }, 409)
  const stored = new Map((await deps.store.listEvents(memberId)).map((e) => [e.googleEventId, e]))

  if (body.op === 'remove') {
    const ref = row.nextActionEvent
    if (ref) {
      const invited = (stored.get(ref.id)?.attendees ?? []).some((a) => !a.self)
      await deleteEvent(deps.google, accessToken, ref.id, invited ? 'all' : 'none')
      await deps.store.deleteEvents(memberId, [ref.id])
      await rows.setNextActionEvent(rowId, null)
    }
    deps.log('calendar.next_action.removed', { member: memberId, row: rowId })
    return json({ ok: true })
  }

  if (body.op !== 'save') return json({ error: 'bad_request' }, 400)
  if (!row.nextAction) return json({ error: 'no_next_action' }, 422)
  const date = typeof body.date === 'string' ? body.date : (row.nextAction.date?.date ?? '')
  const precision =
    typeof body.date === 'string' ? 'day' : (row.nextAction.date?.precision ?? 'month')
  const time =
    body.time === null || typeof body.time === 'string'
      ? (body.time as string | null)
      : (row.nextActionEvent?.time ?? null)
  const inviteEmail = body.invite === true ? row.email.trim() : ''
  if (body.invite === true && inviteEmail === '') return json({ error: 'no_email' }, 422)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'fuzzy_date' }, 422)

  let payload: ReturnType<typeof nextActionEventBody>
  try {
    payload = nextActionEventBody({
      rowId,
      rowName: row.name,
      text: row.nextAction.text,
      date,
      precision,
      time,
      rowUrl: `${deps.env.appBaseUrl}/m/${caller.member.slug}/${row.sheetSlug}?row=${rowId}`,
      inviteEmail: inviteEmail || null,
    })
  } catch (error) {
    return json({ error: error instanceof FuzzyDateError ? 'fuzzy_date' : 'bad_time' }, 422)
  }

  const send = sendUpdatesFor(inviteEmail || null)
  const ref = row.nextActionEvent
  let event = null
  if (ref && ref.state === 'linked') {
    event = await patchEvent(deps.google, accessToken, ref.id, payload, send).catch((error) => {
      if (error instanceof GoogleError && error.code === 'not_found') return null
      throw error
    })
  }
  event ??= await insertEvent(deps.google, accessToken, payload, send)
  const member = await deps.store.getMember(memberId)
  await deps.store.upsertEvents(memberId, [
    normaliseEvent(event, [connection.googleEmail, member?.email ?? '']),
  ])
  await rows.setNextActionEvent(
    rowId,
    { id: event.id, time, state: 'linked' },
    typeof body.date === 'string' ? date : undefined,
  )
  deps.log('calendar.next_action.saved', { member: memberId, row: rowId })
  return json({ event: { id: event.id, date, time } })
}

// ---------- Google push and the daily job ----------

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function handleWebhook(deps: HandlerDeps, request: Request): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST')
  const channelId = request.headers.get('x-goog-channel-id') ?? ''
  const token = request.headers.get('x-goog-channel-token') ?? ''
  const state = request.headers.get('x-goog-resource-state') ?? ''
  if (!channelId) return new Response(null, { status: 400 })
  const connection = await deps.store.findConnectionByChannel(channelId)
  if (!connection) {
    deps.log('calendar.webhook.unknown_channel', {})
    return new Response(null, { status: 200 })
  }
  if (!connection.channelTokenHash || !sameHash(sha256(token), connection.channelTokenHash)) {
    deps.log('calendar.webhook.bad_token', { member: connection.memberId })
    return new Response(null, { status: 403 })
  }
  // "sync" is Google's hello when a channel opens; there is nothing to fetch yet.
  if (state !== 'sync') {
    const outcome = await syncMember(deps, connection.memberId, 'webhook')
    deps.log('calendar.webhook.synced', { member: connection.memberId, status: outcome.status })
  }
  return new Response(null, { status: 200 })
}

export async function handleCron(deps: HandlerDeps, request: Request): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET')
  const secret = deps.env.cronSecret
  if (!secret || bearer(request) !== secret) return unauthorized()
  const deadline = deps.now().getTime() + CRON_BUDGET_MS
  const tally = { synced: 0, failed: 0, reconnect: 0, skipped: 0 }
  for (const connection of await deps.store.listConnections('active')) {
    if (deps.now().getTime() > deadline) {
      tally.skipped++
      continue
    }
    const outcome = await syncMember(deps, connection.memberId, 'cron')
    if (outcome.status === 'ok') tally.synced++
    else if (outcome.status === 'needs_reconnect') tally.reconnect++
    else tally.failed++
  }
  deps.log('calendar.cron.done', tally)
  return json(tally)
}
