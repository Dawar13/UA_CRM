/**
 * Where the server keeps calendar data. `SupabaseStore` (supabaseStore.ts) is the real one;
 * `MemoryStore` mirrors its rules (owner-only history, one entry per event and row) for tests and
 * local development without a database.
 */
import type { StoredEvent } from '../../src/domain/calendar/google.js'
import type { EventLink, MatchRow } from '../../src/domain/calendar/logging.js'
import type { Precision } from '../../src/domain/calendar/nextActionEvent.js'
import type { Sealed } from './crypto.js'

export type ConnectionStatus = 'active' | 'needs_reconnect' | 'revoked' | 'error'

export interface SyncCounts {
  fetched: number
  stored: number
  removed: number
  logged: number
  moved: number
  markedRemoved: number
}

export interface Connection {
  memberId: string
  googleEmail: string
  scopes: string
  status: ConnectionStatus
  connectedAt: string
  lastSyncedAt: string | null
  lastAttemptAt: string | null
  lastErrorCode: string | null
  lastErrorAt: string | null
  lastResult: (Partial<SyncCounts> & { channel?: string }) | null
  syncLockUntil: string | null
  channelId: string | null
  channelResourceId: string | null
  channelExpiresAt: string | null
  channelTokenHash: string | null
}

export interface MemberInfo {
  id: string
  email: string
  name: string
  slug: string
  active: boolean
}

export interface OAuthState {
  nonce: string
  memberId: string
  codeVerifier: string
  returnPath: string
  expiresAt: string
}

export interface NextActionEventRef {
  id: string
  time: string | null
  state: 'linked' | 'removed_in_google'
}

/** A member's own live row, as the calendar needs it. */
export interface OwnRow extends MatchRow {
  name: string
  sheetSlug: string
  nextAction: { text: string; date: { date: string; precision: Precision } | null } | null
  nextActionEvent: NextActionEventRef | null
}

export type TakeState =
  | { ok: true; state: OAuthState }
  | { ok: false; reason: 'state_unknown' | 'state_used' | 'state_expired' }

export interface CalendarStore {
  getMember(memberId: string): Promise<MemberInfo | null>

  createState(state: OAuthState): Promise<void>
  /** Marks the state used, once; a reused, unknown or expired state is refused. */
  takeState(nonce: string, now: Date): Promise<TakeState>
  deleteExpiredStates(now: Date): Promise<void>

  getConnection(memberId: string): Promise<Connection | null>
  findConnectionByChannel(channelId: string): Promise<Connection | null>
  listConnections(status: ConnectionStatus): Promise<Connection[]>
  upsertConnection(
    connection: Pick<Connection, 'memberId' | 'googleEmail' | 'scopes'> & Partial<Connection>,
  ): Promise<void>
  updateConnection(memberId: string, patch: Partial<Connection>): Promise<void>
  /** Takes the sync lock unless another sync holds it; true when taken. */
  acquireLock(memberId: string, now: Date, until: Date): Promise<boolean>
  releaseLock(memberId: string): Promise<void>

  saveSecret(memberId: string, sealed: Sealed): Promise<void>
  getSecret(memberId: string): Promise<Sealed | null>
  /** Disconnect: the secret, the stored events and the member's links go. */
  wipe(memberId: string): Promise<void>

  upsertEvents(memberId: string, events: readonly StoredEvent[]): Promise<void>
  listEvents(memberId: string): Promise<StoredEvent[]>
  deleteEvents(memberId: string, googleEventIds: readonly string[]): Promise<number>
  purgeEvents(memberId: string, endedBefore: string): Promise<number>

  listOwnRows(memberId: string): Promise<OwnRow[]>
  listLinks(memberId: string): Promise<EventLink[]>

  /** Through the database's owner check: refuses a row that is not the member's. */
  logMeeting(
    memberId: string,
    rowId: string,
    key: string,
    at: string,
    text: string,
  ): Promise<boolean>
  moveNextAction(
    memberId: string,
    rowId: string,
    eventId: string,
    date: string,
    time: string | null,
    note: string,
    at: string,
  ): Promise<boolean>
  markRemoved(memberId: string, rowId: string, eventId: string): Promise<boolean>
}

/** A member's own row, read and written with their own token, so the row policies apply. */
export interface RowGateway {
  getRow(rowId: string): Promise<OwnRow | null>
  setNextActionEvent(
    rowId: string,
    value: NextActionEventRef | null,
    nextDate?: string,
  ): Promise<void>
}

export class OwnershipError extends Error {
  constructor() {
    super('Not the calendar owner')
    this.name = 'OwnershipError'
  }
}

// ---------- In memory ----------

export interface MemoryRow extends OwnRow {
  deleted: boolean
}

export interface MemoryHistory {
  rowId: string
  ownerId: string
  kind: string
  source: string
  at: string
  text: string
  memberId: string
  key: string | null
}

/** The same rules as the database, in memory. */
export class MemoryStore implements CalendarStore {
  members = new Map<string, MemberInfo>()
  states = new Map<string, OAuthState & { usedAt: string | null }>()
  connections = new Map<string, Connection>()
  secrets = new Map<string, Sealed>()
  events = new Map<string, Map<string, StoredEvent>>()
  links: (EventLink & { memberId: string })[] = []
  rows = new Map<string, MemoryRow>()
  history: MemoryHistory[] = []

  async getMember(memberId: string) {
    return this.members.get(memberId) ?? null
  }

  async createState(state: OAuthState) {
    this.states.set(state.nonce, { ...state, usedAt: null })
  }

  async takeState(nonce: string, now: Date): Promise<TakeState> {
    const state = this.states.get(nonce)
    if (!state) return { ok: false, reason: 'state_unknown' }
    if (state.usedAt) return { ok: false, reason: 'state_used' }
    if (Date.parse(state.expiresAt) <= now.getTime()) return { ok: false, reason: 'state_expired' }
    state.usedAt = now.toISOString()
    const { usedAt: _used, ...rest } = state
    return { ok: true, state: rest }
  }

  async deleteExpiredStates(now: Date) {
    for (const [nonce, state] of this.states) {
      if (Date.parse(state.expiresAt) < now.getTime() - 86_400_000) this.states.delete(nonce)
    }
  }

  async getConnection(memberId: string) {
    const c = this.connections.get(memberId)
    return c ? { ...c } : null
  }

  async findConnectionByChannel(channelId: string) {
    for (const c of this.connections.values()) if (c.channelId === channelId) return { ...c }
    return null
  }

  async listConnections(status: ConnectionStatus) {
    return [...this.connections.values()].filter((c) => c.status === status).map((c) => ({ ...c }))
  }

  async upsertConnection(
    connection: Pick<Connection, 'memberId' | 'googleEmail' | 'scopes'> & Partial<Connection>,
  ) {
    const before = this.connections.get(connection.memberId)
    this.connections.set(connection.memberId, {
      status: 'active',
      connectedAt: new Date().toISOString(),
      lastSyncedAt: null,
      lastAttemptAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      lastResult: null,
      syncLockUntil: null,
      channelId: null,
      channelResourceId: null,
      channelExpiresAt: null,
      channelTokenHash: null,
      ...before,
      ...connection,
    })
  }

  async updateConnection(memberId: string, patch: Partial<Connection>) {
    const c = this.connections.get(memberId)
    if (c) this.connections.set(memberId, { ...c, ...patch })
  }

  async acquireLock(memberId: string, now: Date, until: Date) {
    const c = this.connections.get(memberId)
    if (!c) return false
    if (c.syncLockUntil && Date.parse(c.syncLockUntil) > now.getTime()) return false
    c.syncLockUntil = until.toISOString()
    return true
  }

  async releaseLock(memberId: string) {
    const c = this.connections.get(memberId)
    if (c) c.syncLockUntil = null
  }

  async saveSecret(memberId: string, sealed: Sealed) {
    this.secrets.set(memberId, sealed)
  }

  async getSecret(memberId: string) {
    return this.secrets.get(memberId) ?? null
  }

  async wipe(memberId: string) {
    this.secrets.delete(memberId)
    this.events.delete(memberId)
    this.links = this.links.filter((l) => l.memberId !== memberId)
  }

  private bucket(memberId: string) {
    let bucket = this.events.get(memberId)
    if (!bucket) {
      bucket = new Map()
      this.events.set(memberId, bucket)
    }
    return bucket
  }

  async upsertEvents(memberId: string, events: readonly StoredEvent[]) {
    const bucket = this.bucket(memberId)
    for (const e of events) bucket.set(e.googleEventId, { ...e })
  }

  async listEvents(memberId: string) {
    return [...this.bucket(memberId).values()].sort((a, b) => a.startAt.localeCompare(b.startAt))
  }

  async deleteEvents(memberId: string, ids: readonly string[]) {
    const bucket = this.bucket(memberId)
    let n = 0
    for (const id of ids) if (bucket.delete(id)) n++
    return n
  }

  async purgeEvents(memberId: string, endedBefore: string) {
    const bucket = this.bucket(memberId)
    let n = 0
    for (const [id, e] of bucket) {
      if (e.endAt < endedBefore) {
        bucket.delete(id)
        n++
      }
    }
    return n
  }

  async listOwnRows(memberId: string) {
    return [...this.rows.values()]
      .filter((r) => r.ownerId === memberId && !r.deleted)
      .map(({ deleted: _d, ...row }) => ({ ...row }))
  }

  async listLinks(memberId: string) {
    return this.links
      .filter((l) => l.memberId === memberId)
      .map(({ memberId: _m, ...link }) => link)
  }

  async logMeeting(memberId: string, rowId: string, key: string, at: string, text: string) {
    const row = this.rows.get(rowId)
    if (!row || row.ownerId !== memberId || row.deleted) throw new OwnershipError()
    if (this.history.some((h) => h.rowId === rowId && h.source === 'calendar' && h.key === key)) {
      return false
    }
    this.history.push({
      rowId,
      ownerId: memberId,
      kind: 'meeting',
      source: 'calendar',
      at,
      text: text.trim() || 'Meeting',
      memberId,
      key,
    })
    return true
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
    const row = this.rows.get(rowId)
    if (!row || row.ownerId !== memberId || row.deleted || row.nextActionEvent?.id !== eventId) {
      return false
    }
    row.nextAction = { text: row.nextAction?.text ?? '', date: { date, precision: 'day' } }
    row.nextActionEvent = { id: eventId, time, state: 'linked' }
    this.history.push({
      rowId,
      ownerId: memberId,
      kind: 'note',
      source: 'system',
      at,
      text: note,
      memberId,
      key: null,
    })
    return true
  }

  async markRemoved(memberId: string, rowId: string, eventId: string) {
    const row = this.rows.get(rowId)
    if (!row || row.ownerId !== memberId || row.nextActionEvent?.id !== eventId) return false
    if (row.nextActionEvent.state === 'removed_in_google') return false
    row.nextActionEvent = { ...row.nextActionEvent, state: 'removed_in_google' }
    return true
  }

  /** A gateway acting as `memberId`: their own rows only, as the row policies allow. */
  gatewayFor(memberId: string): RowGateway {
    return {
      getRow: async (rowId) => {
        const row = this.rows.get(rowId)
        if (!row || row.ownerId !== memberId || row.deleted) return null
        const { deleted: _d, ...rest } = row
        return { ...rest }
      },
      setNextActionEvent: async (rowId, value, nextDate) => {
        const row = this.rows.get(rowId)
        if (!row || row.ownerId !== memberId) throw new OwnershipError()
        row.nextActionEvent = value
        if (nextDate && row.nextAction) {
          row.nextAction = { ...row.nextAction, date: { date: nextDate, precision: 'day' } }
        }
      },
    }
  }
}
