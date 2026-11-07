/**
 * The calendar store contract against Supabase: the server's secret key for the calendar tables,
 * and each member's own signed-in token for their rows. Runs when UA_TEST_SUPABASE_* are set (CI,
 * against the local stack, after the Repository contract); skipped otherwise. Like that suite, it
 * refuses to run where real members exist.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, it, vi } from 'vitest'
import { SupabaseStore, serverClient, supabaseRowGateway } from '../../api/_lib/supabaseStore'
import { runStoreContract } from './storeContract'

const url = process.env.UA_TEST_SUPABASE_URL ?? ''
const publishableKey = process.env.UA_TEST_SUPABASE_PUBLISHABLE_KEY ?? ''
const secretKey = process.env.UA_TEST_SUPABASE_SECRET_KEY ?? ''
const configured = url !== '' && publishableKey !== '' && secretKey !== ''

const PREFIX = 'calstore-'
const PASSWORD = `Calstore-${crypto.randomUUID()}`
const ZERO = '00000000-0000-0000-0000-000000000000'

function must<T>(what: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  return result.data
}

interface Team {
  service: SupabaseClient
  members: Record<'a' | 'b', { id: string; email: string; slug: string; token: string }>
}

let team: Promise<Team> | null = null

async function removeUsers(service: SupabaseClient) {
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 })
  for (const user of data?.users ?? []) {
    if (user.email?.startsWith(PREFIX)) await service.auth.admin.deleteUser(user.id)
  }
}

async function createTeam(): Promise<Team> {
  const service = serverClient(url, secretKey)
  const existing = must('read members', await service.from('members').select('email'))
  if ((existing ?? []).some((m) => !String(m.email).startsWith(PREFIX))) {
    throw new Error('The calendar store suite needs a project with no real members.')
  }
  must('clear members', await service.from('members').delete().neq('id', ZERO))
  await removeUsers(service)
  const members = {} as Team['members']
  for (const [position, slug] of (['a', 'b'] as const).entries()) {
    const email = `${PREFIX}${slug}@example.test`
    const [m] = must(
      `add ${slug}`,
      await service
        .from('members')
        .insert({ email, name: slug.toUpperCase(), slug, position, is_admin: false })
        .select('id'),
    ) as { id: string }[]
    const created = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    })
    if (created.error) throw new Error(`user ${slug}: ${created.error.message}`)
    const client = serverClient(url, publishableKey)
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (signedIn.error) throw new Error(`sign in ${slug}: ${signedIn.error.message}`)
    members[slug] = { id: m?.id ?? '', email, slug, token: signedIn.data.session.access_token }
  }
  return { service, members }
}

async function clearData(service: SupabaseClient) {
  for (const table of [
    'calendar_connections',
    'calendar_events',
    'calendar_event_links',
    'oauth_states',
  ]) {
    must(`clear ${table}`, await service.from(table).delete().neq('member_id', ZERO))
  }
  must('clear rows', await service.from('rows').delete().neq('id', ZERO))
  must('clear sheets', await service.from('sheets').delete().neq('id', ZERO))
}

async function addRow(service: SupabaseClient, ownerId: string, name: string, email: string) {
  const [sheet] = must(
    'add sheet',
    await service
      .from('sheets')
      .insert({ owner_id: ownerId, slug: 'customers', name: 'Customers', template: 'customers' })
      .select('id'),
  ) as { id: string }[]
  const [row] = must(
    'add row',
    await service
      .from('rows')
      .insert({
        sheet_id: sheet?.id,
        name,
        email,
        next_text: 'Send ROI note',
        next_date: '2026-11-13',
        next_precision: 'day',
      })
      .select('id'),
  ) as { id: string }[]
  return row?.id ?? ''
}

if (configured) {
  vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

  runStoreContract('SupabaseStore', async () => {
    team ??= createTeam()
    const { service, members } = await team
    await clearData(service)
    const rowA = await addRow(service, members.a.id, 'Rohan Mehta', 'rohan@hpf.example')
    const rowB = await addRow(service, members.b.id, 'Arvind Rao', 'arvind@example.test')
    const tokenOf = (memberId: string) =>
      Object.values(members).find((m) => m.id === memberId)?.token ?? ''
    return {
      store: new SupabaseStore(service),
      gatewayFor: async (memberId) =>
        supabaseRowGateway(serverClient(url, publishableKey, tokenOf(memberId)), memberId),
      a: members.a,
      b: members.b,
      rowA,
      rowB,
      addLink: async (memberId, link) => {
        must(
          'add link',
          await service.from('calendar_event_links').insert({
            member_id: memberId,
            google_event_id: link.googleEventId,
            recurring_event_id: link.recurringEventId,
            row_id: link.rowId,
            kind: link.kind,
          }),
        )
      },
      history: async (rowId) =>
        must(
          'read history',
          await service.from('history').select('kind, source, text').eq('row_id', rowId),
        ) ?? [],
      cleanup: () => clearData(service),
    }
  })

  afterAll(async () => {
    if (!team) return
    const { service } = await team
    await clearData(service)
    must('remove members', await service.from('members').delete().neq('id', ZERO))
    await removeUsers(service)
  })
} else {
  describe.skip('Calendar store contract: SupabaseStore (set UA_TEST_SUPABASE_* to run)', () => {
    it('runs against a Supabase project', () => {})
  })
}
