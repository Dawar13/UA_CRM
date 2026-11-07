/**
 * The calendar server (Phase 2, D-050) against the fake Google and the in-memory store: connect
 * and callback, sync, meeting history, next actions, push, the daily job, disconnect, and that
 * every endpoint acts only on the caller's own connection and rows.
 */
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { open, SealError, seal } from '../../api/_lib/crypto'
import { ConfigError, readEnv } from '../../api/_lib/env'
import { GoogleError, MAX_TRIES } from '../../api/_lib/google'
import {
  handleCallback,
  handleConnect,
  handleCron,
  handleDisconnect,
  handleNextActionEvent,
  handleSync,
  handleWebhook,
} from '../../api/_lib/handlers'
import { syncMember } from '../../api/_lib/sync'
import { DAWAR, DHRUV, meeting, setup, TOKENS } from './harness'

const GMAIL = 'dawar.personal@gmail.example'

describe('token encryption', () => {
  const keys = new Map([[1, randomBytes(32)]])

  it('round-trips, with a fresh IV each time', () => {
    const a = seal('1//refresh-token', keys, 1)
    const b = seal('1//refresh-token', keys, 1)
    expect(a.ciphertext).not.toContain('refresh')
    expect(a.iv).not.toBe(b.iv)
    expect(open(a, keys)).toBe('1//refresh-token')
  })

  it('rejects a tampered ciphertext', () => {
    const sealed = seal('1//refresh-token', keys, 1)
    const bytes = Buffer.from(sealed.ciphertext, 'base64')
    bytes[0] = (bytes[0] ?? 0) ^ 1
    expect(() => open({ ...sealed, ciphertext: bytes.toString('base64') }, keys)).toThrow(SealError)
  })

  it('reads tokens sealed with the previous key during a rotation', () => {
    const old = seal('old-token', keys, 1)
    const rotated = new Map([...keys, [2, randomBytes(32)]])
    expect(open(old, rotated)).toBe('old-token')
    expect(seal('new', rotated, 2).keyVersion).toBe(2)
    expect(() => open({ ...old, keyVersion: 3 }, rotated)).toThrow(SealError)
  })

  it('reads keys from the environment, and names what is missing', () => {
    const key = randomBytes(32).toString('base64')
    const env = readEnv({
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      CALENDAR_TOKEN_KEY: key,
      CALENDAR_TOKEN_KEY_VERSION: '2',
      CALENDAR_TOKEN_KEYS_PREVIOUS: `1:${randomBytes(32).toString('base64')}`,
      APP_BASE_URL: 'https://crm.example/',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'p',
      SUPABASE_SERVICE_ROLE_KEY: 's',
    })
    expect(env.tokenKeyVersion).toBe(2)
    expect([...env.tokenKeys.keys()].sort()).toEqual([1, 2])
    expect(env.appBaseUrl).toBe('https://crm.example')
    expect(env.calendarScope).toBe('https://www.googleapis.com/auth/calendar.events.owned')
    expect(() => readEnv({})).toThrow(ConfigError)
    try {
      readEnv({ GOOGLE_CLIENT_ID: 'x' })
    } catch (error) {
      expect((error as ConfigError).missing).toContain('CALENDAR_TOKEN_KEY')
    }
  })
})

describe('connecting', () => {
  it('asks Google for offline access to calendar.events.owned with PKCE and a login hint', async () => {
    const t = setup()
    const response = await handleConnect(t.deps, t.post('/api/calendar/connect', TOKENS.dawar))
    const url = new URL(((await response.json()) as { url: string }).url)
    expect(url.searchParams.get('scope')).toBe(
      'openid email https://www.googleapis.com/auth/calendar.events.owned',
    )
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('login_hint')).toBe(DAWAR.email)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/calendar/callback')
    expect(t.store.states.size).toBe(1)
  })

  it('refuses a request without a signed-in member', async () => {
    const t = setup()
    const response = await handleConnect(t.deps, t.post('/api/calendar/connect', null))
    expect(response.status).toBe(401)
  })

  it('stores the token encrypted, runs the first sync and returns to where the member was', async () => {
    const t = setup()
    t.google.addEvent(
      GMAIL,
      meeting('2026-11-06T15:00:00', '2026-11-06T16:00:00', ['rohan@hpf.example']),
    )
    const { location } = await t.connect(TOKENS.dawar, GMAIL)
    expect(location).toBe('http://localhost:5173/m/dawar/customers?calendar=connected')
    const connection = await t.store.getConnection(DAWAR.id)
    expect(connection).toMatchObject({ status: 'active', googleEmail: GMAIL })
    expect(connection?.lastSyncedAt).not.toBeNull()
    const secret = await t.store.getSecret(DAWAR.id)
    expect(secret?.ciphertext).not.toMatch(/^rt-/)
    expect(open(secret ?? { ciphertext: '', iv: '', keyVersion: 1 }, t.env.tokenKeys)).toMatch(
      /^rt-/,
    )
    expect(await t.store.listEvents(DAWAR.id)).toHaveLength(1)
    // The first sync starts on 5 Nov 2026 00:00 IST.
    const list = t.google.calls.find((c) => c.path.endsWith('/events') && c.method === 'GET')
    expect(list?.query).toMatchObject({
      timeMin: '2026-11-04T18:30:00.000Z',
      singleEvents: 'true',
      showDeleted: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })
  })

  it('refuses a reused or expired state, and a PKCE mismatch', async () => {
    const t = setup()
    const first = await t.connect(TOKENS.dawar, GMAIL)
    const state = new URL(first.url).searchParams.get('state')
    const reused = await handleCallback(
      t.deps,
      new Request(`http://localhost/api/calendar/callback?code=x&state=${state}`),
    )
    expect(reused.headers.get('location')).toContain('reason=state_used')

    const started = await handleConnect(t.deps, t.post('/api/calendar/connect', TOKENS.dawar))
    const { url } = (await started.json()) as { url: string }
    const { code, state: fresh } = t.google.approve(GMAIL, url)
    t.google.setNow(new Date(t.google.now().getTime() + 11 * 60_000))
    const late = await handleCallback(
      t.deps,
      new Request(`http://localhost/api/calendar/callback?code=${code}&state=${fresh}`),
    )
    expect(late.headers.get('location')).toContain('reason=state_expired')

    const again = await handleConnect(t.deps, t.post('/api/calendar/connect', TOKENS.dawar))
    const approved = t.google.approve(GMAIL, ((await again.json()) as { url: string }).url)
    // Tamper with the stored verifier: Google's PKCE check refuses the exchange.
    const stored = t.store.states.get(approved.state)
    if (stored) stored.codeVerifier = 'not-the-verifier'
    const mismatch = await handleCallback(
      t.deps,
      new Request(
        `http://localhost/api/calendar/callback?code=${approved.code}&state=${approved.state}`,
      ),
    )
    expect(mismatch.headers.get('location')).toContain('reason=exchange_invalid_grant')
  })

  it('treats a missing calendar scope or refresh token as a failed connection', async () => {
    const t = setup()
    t.google.fail('missing_scope')
    expect((await t.connect(TOKENS.dawar, GMAIL)).location).toContain('reason=scope_missing')
    t.google.fail('no_refresh_token')
    expect((await t.connect(TOKENS.dawar, GMAIL)).location).toContain('reason=no_refresh_token')
    expect(await t.store.getConnection(DAWAR.id)).toBeNull()
  })

  it('says so when the member declines at Google', async () => {
    const t = setup()
    const started = await handleConnect(t.deps, t.post('/api/calendar/connect', TOKENS.dawar))
    const state = new URL(((await started.json()) as { url: string }).url).searchParams.get('state')
    const declined = await handleCallback(
      t.deps,
      new Request(`http://localhost/api/calendar/callback?error=access_denied&state=${state}`),
    )
    expect(declined.headers.get('location')).toContain('calendar=error&reason=denied')
  })
})

describe('syncing', () => {
  it('fetches every page: 300 events in one sync, well within 10 seconds', async () => {
    const t = setup()
    for (let i = 0; i < 300; i++) {
      const day = String(7 + (i % 20)).padStart(2, '0')
      const hour = String(8 + (i % 10)).padStart(2, '0')
      t.google.addEvent(
        GMAIL,
        meeting(`2026-11-${day}T${hour}:00:00`, `2026-11-${day}T${hour}:30:00`, []),
      )
    }
    const started = Date.now()
    await t.connect(TOKENS.dawar, GMAIL)
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(await t.store.listEvents(DAWAR.id)).toHaveLength(300)
    const pages = t.google.calls.filter((c) => c.path.endsWith('/events') && c.method === 'GET')
    expect(pages.map((p) => p.query.pageToken ?? '')).toEqual(['', '250'])
  })

  it('keeps cancellations, removes what Google no longer returns, and purges old events', async () => {
    const t = setup()
    const a = t.google.addEvent(GMAIL, meeting('2026-11-08T10:00:00', '2026-11-08T11:00:00', []))
    const b = t.google.addEvent(GMAIL, meeting('2026-11-09T10:00:00', '2026-11-09T11:00:00', []))
    await t.connect(TOKENS.dawar, GMAIL)
    t.google.deleteEvent(GMAIL, a.id)
    t.google.purgeEvent(GMAIL, b.id)
    await syncMember(t.deps, DAWAR.id, 'manual')
    const stored = await t.store.listEvents(DAWAR.id)
    expect(stored.map((e) => [e.googleEventId, e.status])).toEqual([[a.id, 'cancelled']])
    // Thirty-one days later, the old event is purged.
    t.google.setNow('2026-12-10T06:30:00Z')
    await syncMember(t.deps, DAWAR.id, 'manual')
    expect(await t.store.listEvents(DAWAR.id)).toEqual([])
  })

  it('retries rate limits and server errors with backoff, then gives up keeping the last data', async () => {
    const t = setup()
    t.google.addEvent(GMAIL, meeting('2026-11-08T10:00:00', '2026-11-08T11:00:00', []))
    await t.connect(TOKENS.dawar, GMAIL)
    t.google.setNow('2026-11-06T07:00:00Z')
    t.google.fail('rate_limit', 'server_error')
    const recovered = await syncMember(t.deps, DAWAR.id, 'manual')
    expect(recovered.status).toBe('ok')
    expect(t.sleeps).toEqual([500, 1000])

    t.google.fail(...Array.from({ length: MAX_TRIES }, () => 'server_error' as const))
    const failed = await syncMember(t.deps, DAWAR.id, 'manual')
    expect(failed).toMatchObject({ status: 'error', code: 'server' })
    const connection = await t.store.getConnection(DAWAR.id)
    expect(connection).toMatchObject({ status: 'active', lastErrorCode: 'server' })
    expect(await t.store.listEvents(DAWAR.id)).toHaveLength(1)
  })

  it('asks for a reconnect when Google says invalid_grant', async () => {
    const t = setup()
    await t.connect(TOKENS.dawar, GMAIL)
    t.google.revokeAll(GMAIL)
    expect((await syncMember(t.deps, DAWAR.id, 'manual')).status).toBe('needs_reconnect')
    expect(await t.store.getConnection(DAWAR.id)).toMatchObject({
      status: 'needs_reconnect',
      lastErrorCode: 'invalid_grant',
    })
    // Later syncs do not call Google until the member reconnects.
    const calls = t.google.calls.length
    expect((await syncMember(t.deps, DAWAR.id, 'manual')).status).toBe('needs_reconnect')
    expect(t.google.calls.length).toBe(calls)
  })

  it('never runs two syncs for one member at once', async () => {
    const t = setup()
    await t.connect(TOKENS.dawar, GMAIL)
    const now = t.google.now()
    expect(await t.store.acquireLock(DAWAR.id, now, new Date(now.getTime() + 90_000))).toBe(true)
    expect((await syncMember(t.deps, DAWAR.id, 'manual')).status).toBe('busy')
    await t.store.releaseLock(DAWAR.id)
    expect((await syncMember(t.deps, DAWAR.id, 'manual')).status).toBe('ok')
  })

  it('syncs at most once a minute per member from the browser', async () => {
    const t = setup()
    await t.connect(TOKENS.dawar, GMAIL)
    t.google.setNow(new Date(t.google.now().getTime() + 30_000))
    const recent = await handleSync(t.deps, t.post('/api/calendar/sync', TOKENS.dawar))
    expect(((await recent.json()) as { status: string }).status).toBe('recent')
    t.google.setNow(new Date(t.google.now().getTime() + 60_000))
    const fresh = await handleSync(
      t.deps,
      t.post('/api/calendar/sync', TOKENS.dawar, { reason: 'open' }),
    )
    expect(((await fresh.json()) as { status: string }).status).toBe('ok')
  })

  it('after a gap, fetches from a day before the last good sync', async () => {
    const t = setup()
    await t.connect(TOKENS.dawar, GMAIL)
    t.google.setNow('2026-12-15T06:30:00Z')
    await syncMember(t.deps, DAWAR.id, 'manual')
    const lists = t.google.calls.filter((c) => c.path.endsWith('/events') && c.method === 'GET')
    expect(lists.at(-1)?.query.timeMin).toBe('2026-11-05T06:30:00.000Z')
  })
})

describe('meetings log themselves (C4)', () => {
  it('logs an ended meeting into every own row with that email, once, however often it syncs', async () => {
    const t = setup()
    t.google.addEvent(
      GMAIL,
      meeting('2026-11-06T10:00:00', '2026-11-06T11:00:00', ['Rohan@HPF.example']),
    )
    await t.connect(TOKENS.dawar, GMAIL)
    for (let i = 0; i < 3; i++) {
      t.google.setNow(new Date(t.google.now().getTime() + 61_000))
      await syncMember(t.deps, DAWAR.id, 'manual')
    }
    const logged = t.store.history.filter((h) => h.source === 'calendar')
    expect(logged.map((h) => [h.rowId, h.kind, h.text, h.memberId, h.at])).toEqual([
      ['r-rohan', 'meeting', 'Plant walk', DAWAR.id, '2026-11-06T04:30:00.000Z'],
      ['r-rohan-2', 'meeting', 'Plant walk', DAWAR.id, '2026-11-06T04:30:00.000Z'],
    ])
  })

  it('waits until the meeting has ended', async () => {
    const t = setup()
    t.google.addEvent(
      GMAIL,
      meeting('2026-11-06T15:00:00', '2026-11-06T16:00:00', ['asha@kovai.example']),
    )
    await t.connect(TOKENS.dawar, GMAIL)
    expect(t.store.history).toEqual([])
    t.google.setNow('2026-11-06T11:00:00Z')
    await syncMember(t.deps, DAWAR.id, 'manual')
    expect(t.store.history.map((h) => h.rowId)).toEqual(['r-asha'])
  })

  it('logs each instance of a recurring meeting', async () => {
    const t = setup({ now: '2026-11-20T06:30:00Z' })
    for (const day of ['06', '13']) {
      t.google.addEvent(GMAIL, {
        ...meeting(`2026-11-${day}T09:00:00`, `2026-11-${day}T09:30:00`, ['asha@kovai.example']),
        id: `weekly_202611${day}T033000Z`,
        recurringEventId: 'weekly',
      })
    }
    await t.connect(TOKENS.dawar, GMAIL)
    expect(t.store.history.map((h) => h.key)).toEqual([
      'weekly_20261106T033000Z',
      'weekly_20261113T033000Z',
    ])
  })

  it("never writes into another member's row: a match only in Dhruv's tab writes nothing", async () => {
    const t = setup()
    t.google.addEvent(
      GMAIL,
      meeting('2026-11-06T09:00:00', '2026-11-06T10:00:00', ['arvind@fund.example']),
    )
    await t.connect(TOKENS.dawar, GMAIL)
    expect(t.store.history).toEqual([])
  })

  it('skips declined, cancelled and CRM next-action events, and those before 5 Nov', async () => {
    const t = setup()
    t.google.addEvent(GMAIL, {
      ...meeting('2026-11-06T09:00:00', '2026-11-06T10:00:00', ['asha@kovai.example']),
      attendees: [
        { email: GMAIL, self: true, responseStatus: 'declined' },
        { email: 'asha@kovai.example' },
      ],
    })
    t.google.addEvent(GMAIL, {
      ...meeting('2026-11-06T09:00:00', '2026-11-06T10:00:00', ['asha@kovai.example']),
      status: 'cancelled',
    })
    t.google.addEvent(GMAIL, {
      ...meeting('2026-11-06T09:00:00', '2026-11-06T10:00:00', ['asha@kovai.example']),
      extendedProperties: { private: { uaRowId: 'r-asha', uaKind: 'next-action' } },
    })
    t.google.addEvent(
      GMAIL,
      meeting('2026-11-04T22:00:00', '2026-11-05T01:00:00', ['asha@kovai.example']),
    )
    await t.connect(TOKENS.dawar, GMAIL)
    expect(t.store.history).toEqual([])
  })

  it('logs through a confirmed link on a whole series', async () => {
    const t = setup()
    t.google.addEvent(GMAIL, {
      ...meeting('2026-11-06T09:00:00', '2026-11-06T10:00:00', []),
      id: 'standup_20261106T033000Z',
      recurringEventId: 'standup',
      summary: 'Kovai standup',
    })
    t.store.links.push({
      memberId: DAWAR.id,
      googleEventId: null,
      recurringEventId: 'standup',
      rowId: 'r-asha',
      kind: 'confirmed',
    })
    await t.connect(TOKENS.dawar, GMAIL)
    expect(t.store.history.map((h) => [h.rowId, h.text])).toEqual([['r-asha', 'Kovai standup']])
  })
})

describe('next actions as calendar events (C5)', () => {
  async function connected() {
    const t = setup()
    const rohan = t.store.rows.get('r-rohan')
    if (rohan)
      rohan.nextAction = { text: 'Send ROI note', date: { date: '2026-11-13', precision: 'day' } }
    await t.connect(TOKENS.dawar, GMAIL)
    return t
  }

  it('creates a timed event with the CRM properties and no guests by default', async () => {
    const t = await connected()
    const response = await handleNextActionEvent(
      t.deps,
      t.post('/api/calendar/next-action-event', TOKENS.dawar, {
        rowId: 'r-rohan',
        op: 'save',
        time: '16:00',
      }),
    )
    expect(response.status).toBe(200)
    const created = [...t.google.account(GMAIL).events.values()][0]
    expect(created).toMatchObject({
      summary: 'Send ROI note · Rohan Mehta',
      start: { dateTime: '2026-11-13T16:00:00+05:30' },
      extendedProperties: { private: { uaRowId: 'r-rohan', uaKind: 'next-action' } },
      attendees: [],
    })
    expect(created?.description).toContain('http://localhost:5173/m/dawar/customers?row=r-rohan')
    expect(t.google.writes.at(-1)).toMatchObject({ method: 'POST', sendUpdates: 'none' })
    expect(t.store.rows.get('r-rohan')?.nextActionEvent).toMatchObject({
      time: '16:00',
      state: 'linked',
    })
  })

  it('updates the same event when the next action changes, and invites only when asked', async () => {
    const t = await connected()
    const save = (body: Record<string, unknown>) =>
      handleNextActionEvent(
        t.deps,
        t.post('/api/calendar/next-action-event', TOKENS.dawar, {
          rowId: 'r-rohan',
          op: 'save',
          ...body,
        }),
      )
    await save({ time: null })
    await save({ date: '2026-11-14', invite: true })
    const events = [...t.google.account(GMAIL).events.values()]
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      start: { date: '2026-11-14' },
      attendees: [{ email: 'rohan@hpf.example' }],
    })
    expect(t.google.writes.at(-1)).toMatchObject({ method: 'PATCH', sendUpdates: 'all' })
    expect(t.store.rows.get('r-rohan')?.nextAction?.date).toEqual({
      date: '2026-11-14',
      precision: 'day',
    })
  })

  it('asks for an exact day first when the next action is fuzzy', async () => {
    const t = await connected()
    const rohan = t.store.rows.get('r-rohan')
    if (rohan)
      rohan.nextAction = { text: 'Follow up', date: { date: '2026-11-15', precision: 'mid-month' } }
    const response = await handleNextActionEvent(
      t.deps,
      t.post('/api/calendar/next-action-event', TOKENS.dawar, { rowId: 'r-rohan', op: 'save' }),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: 'fuzzy_date' })
  })

  it("refuses another member's row", async () => {
    const t = await connected()
    await t.connect(TOKENS.dhruv, 'dhruv.personal@gmail.example')
    const response = await handleNextActionEvent(
      t.deps,
      t.post('/api/calendar/next-action-event', TOKENS.dhruv, { rowId: 'r-rohan', op: 'save' }),
    )
    expect(response.status).toBe(403)
    expect(t.google.account('dhruv.personal@gmail.example').events.size).toBe(0)
  })

  it('follows a move in Google: the next action takes the new day, with a note', async () => {
    const t = await connected()
    await handleNextActionEvent(
      t.deps,
      t.post('/api/calendar/next-action-event', TOKENS.dawar, {
        rowId: 'r-rohan',
        op: 'save',
        time: '16:00',
      }),
    )
    const id = t.store.rows.get('r-rohan')?.nextActionEvent?.id ?? ''
    t.google.editEvent(GMAIL, id, {
      start: { dateTime: '2026-11-20T09:00:00+05:30' },
      end: { dateTime: '2026-11-20T09:30:00+05:30' },
    })
    t.google.setNow(new Date(t.google.now().getTime() + 61_000))
    await syncMember(t.deps, DAWAR.id, 'manual')
    const rohan = t.store.rows.get('r-rohan')
    expect(rohan?.nextAction?.date).toEqual({ date: '2026-11-20', precision: 'day' })
    expect(rohan?.nextActionEvent).toMatchObject({ time: '09:00', state: 'linked' })
    expect(t.store.history.at(-1)).toMatchObject({
      kind: 'note',
      source: 'system',
      text: 'Next action moved in Google Calendar to Fri 20 Nov',
    })
  })

  it('keeps a CRM date edit when Google did not move the event (the CRM is right)', async () => {
    const t = await connected()
    await handleNextActionEvent(
      t.deps,
      t.post('/api/calendar/next-action-event', TOKENS.dawar, {
        rowId: 'r-rohan',
        op: 'save',
        time: '16:00',
      }),
    )
    // Edited in the CRM; the event update has not reached Google yet when a sync runs.
    const rohan = t.store.rows.get('r-rohan')
    if (rohan?.nextAction) {
      rohan.nextAction = { ...rohan.nextAction, date: { date: '2026-11-16', precision: 'day' } }
    }
    const notes = t.store.history.length
    t.google.setNow(new Date(t.google.now().getTime() + 61_000))
    await syncMember(t.deps, DAWAR.id, 'manual')
    expect(t.store.rows.get('r-rohan')?.nextAction?.date).toEqual({
      date: '2026-11-16',
      precision: 'day',
    })
    expect(t.store.history).toHaveLength(notes)
  })

  it('keeps the next action when its event is deleted in Google, marked for "Add again"', async () => {
    const t = await connected()
    await handleNextActionEvent(
      t.deps,
      t.post('/api/calendar/next-action-event', TOKENS.dawar, { rowId: 'r-rohan', op: 'save' }),
    )
    const id = t.store.rows.get('r-rohan')?.nextActionEvent?.id ?? ''
    t.google.purgeEvent(GMAIL, id)
    t.google.setNow(new Date(t.google.now().getTime() + 61_000))
    await syncMember(t.deps, DAWAR.id, 'manual')
    expect(t.store.rows.get('r-rohan')?.nextAction?.text).toBe('Send ROI note')
    expect(t.store.rows.get('r-rohan')?.nextActionEvent?.state).toBe('removed_in_google')
  })

  it('removes the event when the next action is cleared', async () => {
    const t = await connected()
    const call = (op: string) =>
      handleNextActionEvent(
        t.deps,
        t.post('/api/calendar/next-action-event', TOKENS.dawar, { rowId: 'r-rohan', op }),
      )
    await call('save')
    const id = t.store.rows.get('r-rohan')?.nextActionEvent?.id ?? ''
    await call('remove')
    expect(t.google.account(GMAIL).events.get(id)?.status).toBe('cancelled')
    expect(t.store.rows.get('r-rohan')?.nextActionEvent).toBeNull()
  })
})

describe('push notifications and the daily job', () => {
  it('opens a push channel on connect when the app has a public address', async () => {
    const t = setup({ appBaseUrl: 'https://crm.example' })
    await t.connect(TOKENS.dawar, GMAIL)
    const connection = await t.store.getConnection(DAWAR.id)
    expect(connection?.channelId).toBeTruthy()
    const channel = t.google.channels.get(connection?.channelId ?? '')
    expect(channel?.address).toBe('https://crm.example/api/calendar/webhook')
    expect(connection?.channelTokenHash).not.toBe(channel?.token)
  })

  it('syncs on a ping with the right token, and refuses a wrong one', async () => {
    const t = setup({ appBaseUrl: 'https://crm.example' })
    await t.connect(TOKENS.dawar, GMAIL)
    const connection = await t.store.getConnection(DAWAR.id)
    const channel = t.google.channels.get(connection?.channelId ?? '')
    const ping = (token: string, state = 'exists') =>
      handleWebhook(
        t.deps,
        new Request('https://crm.example/api/calendar/webhook', {
          method: 'POST',
          headers: {
            'x-goog-channel-id': connection?.channelId ?? '',
            'x-goog-channel-token': token,
            'x-goog-resource-state': state,
          },
        }),
      )
    expect((await ping('wrong')).status).toBe(403)
    t.google.addEvent(GMAIL, meeting('2026-11-09T10:00:00', '2026-11-09T11:00:00', []))
    t.google.setNow(new Date(t.google.now().getTime() + 5_000))
    expect((await ping(channel?.token ?? '')).status).toBe(200)
    expect(await t.store.listEvents(DAWAR.id)).toHaveLength(1)
  })

  it('keeps working by polling when Google refuses the push address', async () => {
    const t = setup({ appBaseUrl: 'https://crm.example' })
    t.google.fail('push_unauthorized')
    const { location } = await t.connect(TOKENS.dawar, GMAIL)
    expect(location).toContain('calendar=connected')
    const connection = await t.store.getConnection(DAWAR.id)
    expect(connection).toMatchObject({ status: 'active', channelId: null })
    expect(connection?.lastResult?.channel).toBe('push_unauthorized')
  })

  it('syncs every active connection with the cron secret, and renews channels that are ending', async () => {
    const t = setup({ appBaseUrl: 'https://crm.example' })
    await t.connect(TOKENS.dawar, GMAIL)
    await t.connect(TOKENS.dhruv, 'dhruv.personal@gmail.example', '/m/dhruv/investors')
    const firstChannel = (await t.store.getConnection(DAWAR.id))?.channelId
    const cron = (secret: string | null) =>
      handleCron(
        t.deps,
        new Request('https://crm.example/api/cron/calendar-sync', {
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        }),
      )
    expect((await cron(null)).status).toBe(401)
    expect((await cron('wrong')).status).toBe(401)
    t.google.setNow(new Date(t.google.now().getTime() + 6 * 86_400_000))
    const response = await cron('cron-secret')
    expect(await response.json()).toEqual({ synced: 2, failed: 0, reconnect: 0, skipped: 0 })
    expect((await t.store.getConnection(DAWAR.id))?.channelId).not.toBe(firstChannel)
  })
})

describe('disconnecting and privacy', () => {
  it('revokes at Google and wipes the token, events and links', async () => {
    const t = setup()
    t.google.addEvent(GMAIL, meeting('2026-11-08T10:00:00', '2026-11-08T11:00:00', []))
    await t.connect(TOKENS.dawar, GMAIL)
    t.store.links.push({
      memberId: DAWAR.id,
      googleEventId: 'x',
      recurringEventId: null,
      rowId: 'r-asha',
      kind: 'dismissed',
    })
    const response = await handleDisconnect(
      t.deps,
      t.post('/api/calendar/disconnect', TOKENS.dawar),
    )
    expect(await response.json()).toEqual({ status: 'revoked' })
    expect(t.google.revoked.has(GMAIL)).toBe(true)
    expect(await t.store.getSecret(DAWAR.id)).toBeNull()
    expect(await t.store.listEvents(DAWAR.id)).toEqual([])
    expect(await t.store.listLinks(DAWAR.id)).toEqual([])
    expect(await t.store.getConnection(DAWAR.id)).toMatchObject({ status: 'revoked' })
  })

  it("a member's calls never touch another member's connection", async () => {
    const t = setup()
    await t.connect(TOKENS.dawar, GMAIL)
    await handleDisconnect(t.deps, t.post('/api/calendar/disconnect', TOKENS.dhruv))
    await handleSync(t.deps, t.post('/api/calendar/sync', TOKENS.dhruv))
    expect(await t.store.getConnection(DAWAR.id)).toMatchObject({ status: 'active' })
    expect(await t.store.getSecret(DAWAR.id)).not.toBeNull()
    expect(t.google.revoked.has(GMAIL)).toBe(false)
    expect((await t.store.getConnection(DHRUV.id)) ?? null).toBeNull()
  })

  it('logs ids, counts and codes, never titles or emails', async () => {
    const t = setup()
    t.google.addEvent(GMAIL, {
      ...meeting('2026-11-06T09:00:00', '2026-11-06T10:00:00', ['rohan@hpf.example']),
      summary: 'Confidential board meeting',
    })
    await t.connect(TOKENS.dawar, GMAIL)
    t.google.revokeAll(GMAIL)
    await syncMember(t.deps, DAWAR.id, 'manual')
    const text = JSON.stringify(t.log.lines)
    expect(text).not.toMatch(/Confidential|rohan@|@gmail|@example/)
    expect(t.log.lines.map((l) => l.event)).toContain('calendar.sync.reconnect')
  })

  it('reports Google failures by code', () => {
    expect(new GoogleError('rate_limited', 429).message).toBe(
      'Google request failed: rate_limited (429)',
    )
  })
})
