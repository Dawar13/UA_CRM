/** The calendar endpoints wired to an in-memory store and the fake Google, for tests. */
import { randomBytes } from 'node:crypto'
import type { ServerEnv } from '../../api/_lib/env'
import {
  type Caller,
  type HandlerDeps,
  handleCallback,
  handleConnect,
} from '../../api/_lib/handlers'
import { bearer } from '../../api/_lib/http'
import { memoryLogger } from '../../api/_lib/log'
import { type MemoryRow, MemoryStore } from '../../api/_lib/store'
import { createFakeGoogle, FAKE } from '../fakes/google/fakeGoogle'

export const DAWAR = {
  id: 'm-dawar',
  email: 'dawar@example.test',
  name: 'Dawar',
  slug: 'dawar',
  active: true,
}
export const DHRUV = {
  id: 'm-dhruv',
  email: 'dhruv@example.test',
  name: 'Dhruv',
  slug: 'dhruv',
  active: true,
}
export const TOKENS = { dawar: 'jwt-dawar', dhruv: 'jwt-dhruv' } as const

function row(
  id: string,
  ownerId: string,
  name: string,
  email: string,
  extra: Partial<MemoryRow> = {},
): MemoryRow {
  return {
    id,
    ownerId,
    name,
    email,
    sheetSlug: 'customers',
    nextAction: null,
    nextActionEvent: null,
    deleted: false,
    ...extra,
  }
}

export function setup(options: { appBaseUrl?: string; now?: string } = {}) {
  const google = createFakeGoogle(options.now ?? '2026-11-06T06:30:00Z')
  const store = new MemoryStore()
  store.members.set(DAWAR.id, DAWAR)
  store.members.set(DHRUV.id, DHRUV)
  for (const r of [
    row('r-rohan', DAWAR.id, 'Rohan Mehta', 'rohan@hpf.example'),
    row('r-rohan-2', DAWAR.id, 'Rohan Mehta (plant)', 'ROHAN@hpf.example'),
    row('r-asha', DAWAR.id, 'Asha Rao', 'asha@kovai.example'),
    row('r-arvind', DHRUV.id, 'Arvind Menon', 'arvind@fund.example'),
  ]) {
    store.rows.set(r.id, r)
  }
  const env: ServerEnv = {
    googleClientId: 'client-id',
    googleClientSecret: 'client-secret',
    googleAuthUrl: FAKE.authUrl,
    googleTokenUrl: FAKE.tokenUrl,
    googleRevokeUrl: FAKE.revokeUrl,
    googleApiBase: FAKE.apiBase,
    calendarScope: FAKE.scope,
    appBaseUrl: options.appBaseUrl ?? 'http://localhost:5173',
    supabaseUrl: 'http://supabase.invalid',
    supabasePublishableKey: 'publishable',
    supabaseSecretKey: 'secret',
    tokenKeys: new Map([[1, randomBytes(32)]]),
    tokenKeyVersion: 1,
    cronSecret: 'cron-secret',
  }
  const log = memoryLogger()
  const sleeps: number[] = []
  const callers = new Map<string, Caller>([
    [TOKENS.dawar, { member: DAWAR, token: TOKENS.dawar }],
    [TOKENS.dhruv, { member: DHRUV, token: TOKENS.dhruv }],
  ])
  const deps: HandlerDeps = {
    env,
    store,
    google: {
      env,
      fetch: google.fetch,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      random: () => 0,
    },
    now: () => google.now(),
    log,
    authenticate: async (request) => callers.get(bearer(request) ?? '') ?? null,
    rowsFor: (caller) => store.gatewayFor(caller.member.id),
  }

  const post = (path: string, token: string | null, body: unknown = {}) =>
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })

  /** Connect: the member's request, Google's consent, and the callback. */
  async function connect(token: string, googleEmail: string, returnPath = '/m/dawar/customers') {
    const started = await handleConnect(deps, post('/api/calendar/connect', token, { returnPath }))
    const { url } = (await started.json()) as { url: string }
    const { code, state } = google.approve(googleEmail, url)
    const response = await handleCallback(
      deps,
      new Request(`http://localhost/api/calendar/callback?code=${code}&state=${state}`),
    )
    return { response, url, location: response.headers.get('location') ?? '' }
  }

  return { google, store, env, deps, log, sleeps, post, connect }
}

/** A timed event in IST. */
export function meeting(
  start: string,
  end: string,
  guests: string[],
  extra: Record<string, unknown> = {},
) {
  return {
    summary: 'Plant walk',
    start: { dateTime: `${start}+05:30`, timeZone: 'Asia/Kolkata' },
    end: { dateTime: `${end}+05:30`, timeZone: 'Asia/Kolkata' },
    attendees: [
      { email: 'dawar.personal@gmail.example', self: true, responseStatus: 'accepted' },
      ...guests.map((email) => ({ email, responseStatus: 'accepted' })),
    ],
    ...extra,
  }
}
