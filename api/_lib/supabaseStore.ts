/**
 * The calendar store on Supabase (Phase 2, D-050). The server's secret key reads and writes the
 * calendar tables, which members can only read (their own) or not see at all (tokens, states).
 * Writes into rows and history go through the definer functions, which check the owner, or through
 * the member's own token, so the row policies apply.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { StoredEvent } from '../../src/domain/calendar/google.js'
import type { EventLink } from '../../src/domain/calendar/logging.js'
import type { Precision } from '../../src/domain/calendar/nextActionEvent.js'
import type { Sealed } from './crypto.js'
import {
  type CalendarStore,
  type Connection,
  type ConnectionStatus,
  type MemberInfo,
  type NextActionEventRef,
  type OAuthState,
  OwnershipError,
  type OwnRow,
  type RowGateway,
  type TakeState,
} from './store.js'

const PAGE = 1000
const CHUNK = 100

type Row = Record<string, unknown>

export class StoreError extends Error {
  constructor(operation: string, code: string | undefined) {
    super(`Calendar store: ${operation} failed (${code ?? 'unknown'})`)
    this.name = 'StoreError'
  }
}

function check<T>(operation: string, result: { data: T; error: { code?: string } | null }): T {
  if (result.error) throw new StoreError(operation, result.error.code)
  return result.data
}

/** A list result: never null once the query succeeded. */
function many<T>(
  operation: string,
  result: { data: T[] | null; error: { code?: string } | null },
): T[] {
  return check(operation, result) ?? []
}

export function serverClient(url: string, key: string, token?: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  })
}

// ---------- Mapping ----------

const CONNECTION_COLUMNS: Record<keyof Connection, string> = {
  memberId: 'member_id',
  googleEmail: 'google_email',
  scopes: 'scopes',
  status: 'status',
  connectedAt: 'connected_at',
  lastSyncedAt: 'last_synced_at',
  lastAttemptAt: 'last_attempt_at',
  lastErrorCode: 'last_error_code',
  lastErrorAt: 'last_error_at',
  lastResult: 'last_result',
  syncLockUntil: 'sync_lock_until',
  channelId: 'channel_id',
  channelResourceId: 'channel_resource_id',
  channelExpiresAt: 'channel_expires_at',
  channelTokenHash: 'channel_token_hash',
}

const iso = (value: unknown): string | null =>
  value == null ? null : new Date(String(value)).toISOString()

function toConnection(row: Row): Connection {
  return {
    memberId: String(row.member_id),
    googleEmail: String(row.google_email ?? ''),
    scopes: String(row.scopes ?? ''),
    status: row.status as ConnectionStatus,
    connectedAt: iso(row.connected_at) ?? '',
    lastSyncedAt: iso(row.last_synced_at),
    lastAttemptAt: iso(row.last_attempt_at),
    lastErrorCode: (row.last_error_code as string | null) ?? null,
    lastErrorAt: iso(row.last_error_at),
    lastResult: (row.last_result as Connection['lastResult']) ?? null,
    syncLockUntil: iso(row.sync_lock_until),
    channelId: (row.channel_id as string | null) ?? null,
    channelResourceId: (row.channel_resource_id as string | null) ?? null,
    channelExpiresAt: iso(row.channel_expires_at),
    channelTokenHash: (row.channel_token_hash as string | null) ?? null,
  }
}

function fromConnection(patch: Partial<Connection>): Row {
  const out: Row = { updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(patch)) {
    const column = CONNECTION_COLUMNS[key as keyof Connection]
    if (column && value !== undefined) out[column] = value
  }
  return out
}

function fromEvent(memberId: string, e: StoredEvent): Row {
  return {
    member_id: memberId,
    google_event_id: e.googleEventId,
    recurring_event_id: e.recurringEventId,
    status: e.status,
    summary: e.summary,
    location: e.location,
    html_link: e.htmlLink,
    start_at: e.startAt,
    end_at: e.endAt,
    all_day: e.allDay,
    start_date: e.startDate,
    end_date: e.endDate,
    time_zone: e.timeZone,
    attendees: e.attendees,
    self_response: e.selfResponse,
    ua_row_id: e.uaRowId,
    ua_kind: e.uaKind,
    google_updated_at: e.googleUpdatedAt,
    synced_at: new Date().toISOString(),
  }
}

function toEvent(row: Row): StoredEvent {
  return {
    googleEventId: String(row.google_event_id),
    recurringEventId: (row.recurring_event_id as string | null) ?? null,
    status: row.status as StoredEvent['status'],
    summary: String(row.summary ?? ''),
    location: String(row.location ?? ''),
    htmlLink: String(row.html_link ?? ''),
    startAt: iso(row.start_at) ?? '',
    endAt: iso(row.end_at) ?? '',
    allDay: Boolean(row.all_day),
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    timeZone: (row.time_zone as string | null) ?? null,
    attendees: (row.attendees as StoredEvent['attendees']) ?? [],
    selfResponse: (row.self_response as StoredEvent['selfResponse']) ?? null,
    uaRowId: (row.ua_row_id as string | null) ?? null,
    uaKind: (row.ua_kind as string | null) ?? null,
    googleUpdatedAt: iso(row.google_updated_at),
  }
}

const OWN_ROW_COLUMNS =
  'id, owner_id, name, email, next_text, next_date, next_precision, next_action_event_id, ' +
  'next_action_event_time, next_action_event_state, sheets!inner(slug, deleted_at)'

function toOwnRow(row: Row): OwnRow {
  const sheet = row.sheets as { slug?: string } | null
  const hasNext = row.next_text != null || row.next_date != null
  const event: NextActionEventRef | null = row.next_action_event_id
    ? {
        id: String(row.next_action_event_id),
        time: (row.next_action_event_time as string | null) ?? null,
        state: (row.next_action_event_state as NextActionEventRef['state']) ?? 'linked',
      }
    : null
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    email: String(row.email ?? ''),
    name: String(row.name ?? ''),
    sheetSlug: sheet?.slug ?? '',
    nextAction: hasNext
      ? {
          text: String(row.next_text ?? ''),
          date: row.next_date
            ? { date: String(row.next_date), precision: row.next_precision as Precision }
            : null,
        }
      : null,
    nextActionEvent: event,
  }
}

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// ---------- The store ----------

export class SupabaseStore implements CalendarStore {
  private readonly db: SupabaseClient

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async getMember(memberId: string): Promise<MemberInfo | null> {
    const data = check(
      'getMember',
      await this.db
        .from('members')
        .select('id, email, name, slug, active')
        .eq('id', memberId)
        .maybeSingle(),
    )
    return data
      ? {
          id: String(data.id),
          email: String(data.email),
          name: String(data.name),
          slug: String(data.slug),
          active: Boolean(data.active),
        }
      : null
  }

  async createState(state: OAuthState) {
    check(
      'createState',
      await this.db.from('oauth_states').insert({
        nonce: state.nonce,
        member_id: state.memberId,
        code_verifier: state.codeVerifier,
        return_path: state.returnPath,
        expires_at: state.expiresAt,
      }),
    )
  }

  async takeState(nonce: string, now: Date): Promise<TakeState> {
    if (!nonce) return { ok: false, reason: 'state_unknown' }
    // One conditional update: a state is used once, before it expires.
    const taken = many(
      'takeState',
      await this.db
        .from('oauth_states')
        .update({ used_at: now.toISOString() })
        .eq('nonce', nonce)
        .is('used_at', null)
        .gt('expires_at', now.toISOString())
        .select('nonce, member_id, code_verifier, return_path, expires_at'),
    )
    const row = taken[0]
    if (row) {
      return {
        ok: true,
        state: {
          nonce: String(row.nonce),
          memberId: String(row.member_id),
          codeVerifier: String(row.code_verifier),
          returnPath: String(row.return_path),
          expiresAt: iso(row.expires_at) ?? '',
        },
      }
    }
    const existing = check(
      'takeState',
      await this.db.from('oauth_states').select('used_at').eq('nonce', nonce).maybeSingle(),
    )
    if (!existing) return { ok: false, reason: 'state_unknown' }
    return { ok: false, reason: existing.used_at ? 'state_used' : 'state_expired' }
  }

  async deleteExpiredStates(now: Date) {
    check(
      'deleteExpiredStates',
      await this.db
        .from('oauth_states')
        .delete()
        .lt('expires_at', new Date(now.getTime() - 86_400_000).toISOString()),
    )
  }

  async getConnection(memberId: string) {
    const data = check(
      'getConnection',
      await this.db
        .from('calendar_connections')
        .select('*')
        .eq('member_id', memberId)
        .maybeSingle(),
    )
    return data ? toConnection(data) : null
  }

  async findConnectionByChannel(channelId: string) {
    const data = check(
      'findConnectionByChannel',
      await this.db
        .from('calendar_connections')
        .select('*')
        .eq('channel_id', channelId)
        .maybeSingle(),
    )
    return data ? toConnection(data) : null
  }

  async listConnections(status: ConnectionStatus) {
    const data = many(
      'listConnections',
      await this.db.from('calendar_connections').select('*').eq('status', status),
    )
    return data.map(toConnection)
  }

  async upsertConnection(
    connection: Pick<Connection, 'memberId' | 'googleEmail' | 'scopes'> & Partial<Connection>,
  ) {
    check(
      'upsertConnection',
      await this.db
        .from('calendar_connections')
        .upsert(fromConnection(connection), { onConflict: 'member_id' }),
    )
  }

  async updateConnection(memberId: string, patch: Partial<Connection>) {
    check(
      'updateConnection',
      await this.db
        .from('calendar_connections')
        .update(fromConnection(patch))
        .eq('member_id', memberId),
    )
  }

  async acquireLock(memberId: string, now: Date, until: Date) {
    const data = many(
      'acquireLock',
      await this.db
        .from('calendar_connections')
        .update({ sync_lock_until: until.toISOString() })
        .eq('member_id', memberId)
        .or(`sync_lock_until.is.null,sync_lock_until.lte."${now.toISOString()}"`)
        .select('member_id'),
    )
    return data.length > 0
  }

  async releaseLock(memberId: string) {
    check(
      'releaseLock',
      await this.db
        .from('calendar_connections')
        .update({ sync_lock_until: null })
        .eq('member_id', memberId),
    )
  }

  async saveSecret(memberId: string, sealed: Sealed) {
    check(
      'saveSecret',
      await this.db.from('calendar_secrets').upsert(
        {
          member_id: memberId,
          refresh_token_ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          key_version: sealed.keyVersion,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'member_id' },
      ),
    )
  }

  async getSecret(memberId: string): Promise<Sealed | null> {
    const data = check(
      'getSecret',
      await this.db
        .from('calendar_secrets')
        .select('refresh_token_ciphertext, iv, key_version')
        .eq('member_id', memberId)
        .maybeSingle(),
    )
    return data
      ? {
          ciphertext: String(data.refresh_token_ciphertext),
          iv: String(data.iv),
          keyVersion: Number(data.key_version),
        }
      : null
  }

  async wipe(memberId: string) {
    for (const table of ['calendar_secrets', 'calendar_events', 'calendar_event_links']) {
      check('wipe', await this.db.from(table).delete().eq('member_id', memberId))
    }
  }

  async upsertEvents(memberId: string, events: readonly StoredEvent[]) {
    for (const part of chunks(events, 200)) {
      check(
        'upsertEvents',
        await this.db.from('calendar_events').upsert(
          part.map((e) => fromEvent(memberId, e)),
          { onConflict: 'member_id,google_event_id' },
        ),
      )
    }
  }

  async listEvents(memberId: string) {
    const out: StoredEvent[] = []
    for (let from = 0; ; from += PAGE) {
      const data = many(
        'listEvents',
        await this.db
          .from('calendar_events')
          .select('*')
          .eq('member_id', memberId)
          .order('start_at')
          .order('google_event_id')
          .range(from, from + PAGE - 1),
      )
      out.push(...data.map(toEvent))
      if (data.length < PAGE) return out
    }
  }

  async deleteEvents(memberId: string, ids: readonly string[]) {
    let n = 0
    for (const part of chunks(ids)) {
      const data = many(
        'deleteEvents',
        await this.db
          .from('calendar_events')
          .delete()
          .eq('member_id', memberId)
          .in('google_event_id', part)
          .select('id'),
      )
      n += data.length
    }
    return n
  }

  async purgeEvents(memberId: string, endedBefore: string) {
    const data = many(
      'purgeEvents',
      await this.db
        .from('calendar_events')
        .delete()
        .eq('member_id', memberId)
        .lt('end_at', endedBefore)
        .select('id'),
    )
    return data.length
  }

  async listOwnRows(memberId: string) {
    const out: OwnRow[] = []
    for (let from = 0; ; from += PAGE) {
      const data = many(
        'listOwnRows',
        await this.db
          .from('rows')
          .select(OWN_ROW_COLUMNS)
          .eq('owner_id', memberId)
          .is('deleted_at', null)
          .is('sheets.deleted_at', null)
          .order('id')
          .range(from, from + PAGE - 1),
      )
      out.push(...(data as unknown as Row[]).map(toOwnRow))
      if (data.length < PAGE) return out
    }
  }

  async listLinks(memberId: string): Promise<EventLink[]> {
    const data = many(
      'listLinks',
      await this.db
        .from('calendar_event_links')
        .select('google_event_id, recurring_event_id, row_id, kind')
        .eq('member_id', memberId),
    )
    return data.map((l) => ({
      googleEventId: (l.google_event_id as string | null) ?? null,
      recurringEventId: (l.recurring_event_id as string | null) ?? null,
      rowId: String(l.row_id),
      kind: l.kind as EventLink['kind'],
    }))
  }

  async logMeeting(memberId: string, rowId: string, key: string, at: string, text: string) {
    const result = await this.db.rpc('ua_calendar_log_meeting', {
      p_member: memberId,
      p_row: rowId,
      p_event_key: key,
      p_at: at,
      p_text: text,
    })
    if (result.error?.code === '42501') throw new OwnershipError()
    return check('logMeeting', result) === true
  }

  async moveNextAction(
    memberId: string,
    rowId: string,
    eventId: string,
    date: string,
    time: string | null,
    note: string,
    at: string,
  ) {
    return (
      check(
        'moveNextAction',
        await this.db.rpc('ua_calendar_move_next_action', {
          p_member: memberId,
          p_row: rowId,
          p_event_id: eventId,
          p_date: date,
          p_time: time,
          p_note: note,
          p_at: at,
        }),
      ) === true
    )
  }

  async markRemoved(memberId: string, rowId: string, eventId: string) {
    return (
      check(
        'markRemoved',
        await this.db.rpc('ua_calendar_mark_removed', {
          p_member: memberId,
          p_row: rowId,
          p_event_id: eventId,
        }),
      ) === true
    )
  }
}

// ---------- The member's own token ----------

/** The active member behind a Supabase access token, through the same `api_me` the app uses. */
export async function memberForToken(
  url: string,
  publishableKey: string,
  token: string,
  onRefused?: (code: string) => void,
): Promise<MemberInfo | null> {
  const { data, error } = await serverClient(url, publishableKey, token).rpc('api_me')
  if (error || !data) {
    onRefused?.(error ? (error.code ?? 'error') : 'not_on_team')
    return null
  }
  const m = data as { id?: string; email?: string; name?: string; slug?: string; active?: boolean }
  if (!m.id || m.active === false) return null
  return {
    id: m.id,
    email: m.email ?? '',
    name: m.name ?? '',
    slug: m.slug ?? '',
    active: true,
  }
}

/** Rows read and written as the member: the row policies refuse anything that is not theirs. */
export function supabaseRowGateway(db: SupabaseClient, memberId: string): RowGateway {
  return {
    async getRow(rowId) {
      const data = check(
        'getRow',
        await db
          .from('rows')
          .select(OWN_ROW_COLUMNS)
          .eq('id', rowId)
          .eq('owner_id', memberId)
          .is('deleted_at', null)
          .maybeSingle(),
      )
      return data ? toOwnRow(data as unknown as Row) : null
    },
    async setNextActionEvent(rowId, value, nextDate) {
      const patch: Row = {
        next_action_event_id: value?.id ?? null,
        next_action_event_time: value?.time ?? null,
        next_action_event_state: value?.state ?? null,
        ...(nextDate ? { next_date: nextDate, next_precision: 'day' } : {}),
      }
      const data = many(
        'setNextActionEvent',
        await db.from('rows').update(patch).eq('id', rowId).eq('owner_id', memberId).select('id'),
      )
      if (data.length === 0) throw new OwnershipError()
    },
  }
}
