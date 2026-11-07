/**
 * One member's sync (Phase 2, C2 to C5): fetch the window from Google, store it, log ended
 * meetings into the member's own rows, follow CRM next-action events that moved or were deleted
 * in Google, and keep the push channel alive. Clients are injected so it runs against a fake.
 */
import { randomUUID } from 'node:crypto'
import {
  normaliseEvent,
  purgeBefore,
  type StoredEvent,
  syncWindow,
  UA_KIND_NEXT_ACTION,
} from '../../src/domain/calendar/google.js'
import { meetingKey, meetingRows, meetingText } from '../../src/domain/calendar/logging.js'
import { movedNote, movedTo, placementOf } from '../../src/domain/calendar/nextActionEvent.js'
import { open, randomToken, sha256 } from './crypto.js'
import { canReceivePush, type ServerEnv } from './env.js'
import {
  type GoogleDeps,
  GoogleError,
  getEvent,
  listEvents,
  refreshAccessToken,
  stopChannel,
  watchEvents,
} from './google.js'
import type { Logger } from './log.js'
import type { CalendarStore, Connection, SyncCounts } from './store.js'

export interface SyncDeps {
  env: Pick<ServerEnv, 'tokenKeys' | 'appBaseUrl'>
  store: CalendarStore
  google: GoogleDeps
  now: () => Date
  log: Logger
}

export type SyncReason = 'connect' | 'open' | 'interval' | 'manual' | 'webhook' | 'cron'

export type SyncOutcome =
  | { status: 'ok'; counts: SyncCounts; lastSyncedAt: string }
  | { status: 'not_connected' }
  | { status: 'needs_reconnect' }
  | { status: 'busy' }
  | { status: 'error'; code: string; lastSyncedAt: string | null }

/** How long one sync may hold the lock before another may take over. */
export const LOCK_MS = 90_000
/** Renew a push channel this long before it expires (D-051). */
export const CHANNEL_RENEW_MS = 2 * 86_400_000
export const CHANNEL_TTL_SECONDS = 7 * 86_400

const empty = (): SyncCounts => ({
  fetched: 0,
  stored: 0,
  removed: 0,
  logged: 0,
  moved: 0,
  markedRemoved: 0,
})

/** A fresh access token from the stored refresh token. */
export async function accessTokenFor(deps: SyncDeps, memberId: string): Promise<string> {
  const sealed = await deps.store.getSecret(memberId)
  if (!sealed) throw new GoogleError('invalid_grant', 400)
  const refreshToken = open(sealed, deps.env.tokenKeys)
  return (await refreshAccessToken(deps.google, refreshToken)).accessToken
}

/** Keeps the push channel alive: renews it before it expires, or opens one if missing. */
async function keepChannel(
  deps: SyncDeps,
  connection: Connection,
  accessToken: string,
): Promise<string | undefined> {
  if (!canReceivePush(deps.env)) return undefined
  const now = deps.now()
  const expires = connection.channelExpiresAt ? Date.parse(connection.channelExpiresAt) : 0
  if (connection.channelId && expires - now.getTime() > CHANNEL_RENEW_MS) return undefined
  if (connection.channelId && connection.channelResourceId) {
    await stopChannel(deps.google, accessToken, {
      id: connection.channelId,
      resourceId: connection.channelResourceId,
    }).catch(() => undefined)
  }
  const id = randomUUID()
  const token = randomToken()
  try {
    const channel = await watchEvents(deps.google, accessToken, {
      id,
      token,
      address: `${deps.env.appBaseUrl}/api/calendar/webhook`,
      ttlSeconds: CHANNEL_TTL_SECONDS,
    })
    await deps.store.updateConnection(connection.memberId, {
      channelId: id,
      channelResourceId: channel.resourceId,
      channelExpiresAt: channel.expiration,
      channelTokenHash: sha256(token),
    })
    deps.log('calendar.channel.opened', { member: connection.memberId })
    return 'open'
  } catch (error) {
    // Push is a speed-up; polling still works without it.
    const code = error instanceof GoogleError ? error.code : 'unknown'
    deps.log('calendar.channel.failed', { member: connection.memberId, code })
    await deps.store.updateConnection(connection.memberId, {
      channelId: null,
      channelResourceId: null,
      channelExpiresAt: null,
      channelTokenHash: null,
    })
    return code
  }
}

/** Applies Google's state to CRM next actions: moved in Google, or deleted there. */
async function followNextActions(
  deps: SyncDeps,
  memberId: string,
  accessToken: string,
  fetched: ReadonlyMap<string, StoredEvent>,
  previous: ReadonlyMap<string, StoredEvent>,
  counts: SyncCounts,
): Promise<void> {
  const now = deps.now()
  for (const row of await deps.store.listOwnRows(memberId)) {
    const ref = row.nextActionEvent
    if (ref?.state !== 'linked') continue
    let event = fetched.get(ref.id) ?? null
    if (!event) {
      // Outside the window, or deleted outright: ask Google about this one event.
      const raw = await getEvent(deps.google, accessToken, ref.id)
      event = raw ? normaliseEvent(raw, []) : null
    }
    if (!event || event.status === 'cancelled') {
      if (await deps.store.markRemoved(memberId, row.id, ref.id)) counts.markedRemoved++
      continue
    }
    // Only a move made in Google counts: if Google still has the event where it was at the last
    // sync, a different CRM date is a CRM edit, and the CRM is right.
    const before = previous.get(ref.id)
    const place = placementOf(event)
    if (before) {
      const was = placementOf(before)
      if (was.date === place.date && was.time === place.time) continue
    }
    // Only a new day moves the next action (it holds a date; the event keeps its own time).
    const moved = movedTo(event, row.id, row.nextAction?.date ?? null)
    if (!moved) continue
    const time = place.time
    const note = movedNote(moved, now)
    if (
      await deps.store.moveNextAction(
        memberId,
        row.id,
        ref.id,
        moved,
        time,
        note,
        now.toISOString(),
      )
    ) {
      counts.moved++
    }
  }
}

/** One member's sync. Never throws: the outcome says what happened. */
export async function syncMember(
  deps: SyncDeps,
  memberId: string,
  reason: SyncReason,
): Promise<SyncOutcome> {
  const started = deps.now()
  const connection = await deps.store.getConnection(memberId)
  if (!connection || connection.status === 'revoked') return { status: 'not_connected' }
  if (connection.status === 'needs_reconnect') return { status: 'needs_reconnect' }
  if (!(await deps.store.acquireLock(memberId, started, new Date(started.getTime() + LOCK_MS)))) {
    return { status: 'busy' }
  }
  const counts = empty()
  try {
    await deps.store.updateConnection(memberId, { lastAttemptAt: started.toISOString() })
    const accessToken = await accessTokenFor(deps, memberId)
    const member = await deps.store.getMember(memberId)
    const selfEmails = [connection.googleEmail, member?.email ?? ''].filter(Boolean)

    const window = syncWindow(
      started,
      connection.lastSyncedAt ? new Date(connection.lastSyncedAt) : null,
    )
    const raw = await listEvents(deps.google, accessToken, window)
    const events = raw.map((e) => normaliseEvent(e, selfEmails))
    counts.fetched = events.length
    const stored = await deps.store.listEvents(memberId)
    await deps.store.upsertEvents(memberId, events)
    counts.stored = events.length

    // Stored events in the window that Google no longer returns are gone (or moved out of it).
    const seen = new Set(events.map((e) => e.googleEventId))
    const stale = stored.filter(
      (e) =>
        e.startAt >= window.timeMin && e.startAt < window.timeMax && !seen.has(e.googleEventId),
    )
    counts.removed = await deps.store.deleteEvents(
      memberId,
      stale.map((e) => e.googleEventId),
    )
    counts.removed += await deps.store.purgeEvents(memberId, purgeBefore(started))

    // Meetings that ended become history in the member's own rows (C4).
    const ownRows = await deps.store.listOwnRows(memberId)
    const links = await deps.store.listLinks(memberId)
    for (const event of events) {
      if (event.uaKind === UA_KIND_NEXT_ACTION) continue
      const { rowIds } = meetingRows(event, started, { memberId, ownRows, links, selfEmails })
      for (const rowId of rowIds) {
        if (
          await deps.store.logMeeting(
            memberId,
            rowId,
            meetingKey(event),
            event.startAt,
            meetingText(event),
          )
        ) {
          counts.logged++
        }
      }
    }

    await followNextActions(
      deps,
      memberId,
      accessToken,
      new Map(events.map((e) => [e.googleEventId, e])),
      new Map(stored.map((e) => [e.googleEventId, e])),
      counts,
    )

    // The push channel is opened on connect and renewed by the daily job (D-051).
    const latest = (await deps.store.getConnection(memberId)) ?? connection
    const channel =
      reason === 'connect' || reason === 'cron'
        ? await keepChannel(deps, latest, accessToken)
        : undefined

    const lastSyncedAt = deps.now().toISOString()
    await deps.store.updateConnection(memberId, {
      status: 'active',
      lastSyncedAt,
      lastErrorCode: null,
      lastErrorAt: null,
      lastResult: { ...counts, ...(channel ? { channel } : {}) },
    })
    deps.log('calendar.sync.ok', { member: memberId, reason, ...counts })
    return { status: 'ok', counts, lastSyncedAt }
  } catch (error) {
    const code =
      error instanceof GoogleError
        ? error.code
        : error instanceof Error && error.name === 'SealError'
          ? 'token_unreadable'
          : 'unknown'
    const at = deps.now().toISOString()
    if (code === 'invalid_grant' || code === 'token_unreadable') {
      // Revoked, unused for six months, or a key that no longer reads it: reconnect.
      await deps.store.updateConnection(memberId, {
        status: 'needs_reconnect',
        lastErrorCode: code,
        lastErrorAt: at,
      })
      deps.log('calendar.sync.reconnect', { member: memberId, reason, code })
      return { status: 'needs_reconnect' }
    }
    // Network, rate limits, Google's own errors: the last good data stays.
    await deps.store.updateConnection(memberId, { lastErrorCode: code, lastErrorAt: at })
    deps.log('calendar.sync.failed', { member: memberId, reason, code })
    return { status: 'error', code, lastSyncedAt: connection.lastSyncedAt }
  } finally {
    await deps.store.releaseLock(memberId)
  }
}
