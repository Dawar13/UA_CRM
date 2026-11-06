/**
 * The Repository contract against Supabase. Runs when UA_TEST_SUPABASE_URL,
 * UA_TEST_SUPABASE_PUBLISHABLE_KEY and UA_TEST_SUPABASE_SECRET_KEY are set: in CI against the
 * local stack, and once by hand against an empty project. Skipped otherwise.
 *
 * Four invented members sign in with their own clients, so every refusal comes from the same
 * row-level security the app meets. The project must hold no other members: the suite refuses to
 * run (and to clean up) anywhere real data could be.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, describe, it, vi } from 'vitest'
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository'
import { type MemberKey, runRepositoryContract } from './repositoryContract'

const url = process.env.UA_TEST_SUPABASE_URL ?? ''
const publishableKey = process.env.UA_TEST_SUPABASE_PUBLISHABLE_KEY ?? ''
const secretKey = process.env.UA_TEST_SUPABASE_SECRET_KEY ?? ''
const configured = url !== '' && publishableKey !== '' && secretKey !== ''

const EMAIL_PREFIX = 'contract-'
const PASSWORD = `Contract-${crypto.randomUUID()}`
const ZERO = '00000000-0000-0000-0000-000000000000'

const team: { key: MemberKey; name: string; isAdmin: boolean; active: boolean }[] = [
  { key: 'dawar', name: 'Dawar', isAdmin: true, active: true },
  { key: 'dhruv', name: 'Dhruv', isAdmin: true, active: true },
  { key: 'asha', name: 'Asha', isAdmin: false, active: true },
  { key: 'gone', name: 'Gone', isAdmin: true, active: false },
]

const emailOf = (key: string) => `${EMAIL_PREFIX}${key}@example.test`

function newClient(key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

interface Team {
  service: SupabaseClient
  repos: Record<MemberKey | 'stranger', SupabaseRepository>
  memberIds: Record<MemberKey, string>
  userIds: string[]
}

let setup: Promise<Team> | null = null

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`)
}

async function wipeData(service: SupabaseClient): Promise<void> {
  // Rows first (history, tags, links and files go with them), then sheets (columns and stages
  // go with them), then tags.
  fail('clear rows', (await service.from('rows').delete().neq('id', ZERO)).error)
  fail('clear sheets', (await service.from('sheets').delete().neq('id', ZERO)).error)
  fail('clear tags', (await service.from('tags').delete().neq('id', ZERO)).error)
}

async function createTeam(): Promise<Team> {
  const service = newClient(secretKey)
  const { data: existing, error } = await service.from('members').select('email')
  fail('read members', error)
  const strangers = (existing ?? []).filter((m) => !m.email.startsWith(EMAIL_PREFIX))
  if (strangers.length > 0) {
    throw new Error('The Supabase contract suite needs a project with no real members.')
  }
  await wipeData(service)
  fail('clear members', (await service.from('members').delete().neq('id', ZERO)).error)
  await removeUsers(service)

  // Everyone starts active so the sign-up gate lets their users be created; the stranger is
  // listed only while their user is created.
  const rows = [...team, { key: 'stranger', name: 'Stranger', isAdmin: false, active: true }].map(
    (m, position) => ({
      email: emailOf(m.key),
      name: m.name,
      slug: m.key,
      position,
      is_admin: m.isAdmin,
      active: true,
    }),
  )
  const inserted = await service.from('members').insert(rows).select('id, slug')
  fail('add members', inserted.error)
  const idBySlug = new Map((inserted.data ?? []).map((m) => [m.slug, m.id as string]))

  const userIds: string[] = []
  const repos = {} as Team['repos']
  for (const key of [...team.map((m) => m.key), 'stranger'] as const) {
    const created = await service.auth.admin.createUser({
      email: emailOf(key),
      password: PASSWORD,
      email_confirm: true,
    })
    fail(`create user ${key}`, created.error)
    if (created.data.user) userIds.push(created.data.user.id)
  }
  fail('unlist the stranger', (await service.from('members').delete().eq('slug', 'stranger')).error)
  fail(
    'deactivate Gone',
    (await service.from('members').update({ active: false }).eq('slug', 'gone')).error,
  )
  for (const key of [...team.map((m) => m.key), 'stranger'] as const) {
    const client = newClient(publishableKey)
    fail(
      `sign in ${key}`,
      (await client.auth.signInWithPassword({ email: emailOf(key), password: PASSWORD })).error,
    )
    repos[key] = new SupabaseRepository(client)
  }
  const memberIds = Object.fromEntries(
    team.map((m) => [m.key, idBySlug.get(m.key) ?? '']),
  ) as Record<MemberKey, string>
  return { service, repos, memberIds, userIds }
}

async function removeUsers(service: SupabaseClient): Promise<void> {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 })
  fail('list users', error)
  for (const user of data?.users ?? []) {
    if (user.email?.startsWith(EMAIL_PREFIX)) {
      fail('remove user', (await service.auth.admin.deleteUser(user.id)).error)
    }
  }
}

/** Puts the team back as it started: no data, no extra members, Asha active and named Asha. */
async function resetTeam(t: Team): Promise<void> {
  await wipeData(t.service)
  fail(
    'remove extra members',
    (await t.service.from('members').delete().not('slug', 'in', '(dawar,dhruv,asha,gone)')).error,
  )
  for (const m of team) {
    fail(
      `reset ${m.key}`,
      (
        await t.service
          .from('members')
          .update({ name: m.name, active: m.active, is_admin: m.isAdmin })
          .eq('slug', m.key)
      ).error,
    )
  }
  for (const repo of Object.values(t.repos)) repo.forgetActor()
}

if (configured) {
  vi.setConfig({ testTimeout: 120_000, hookTimeout: 300_000 })

  runRepositoryContract('SupabaseRepository', async () => {
    setup ??= createTeam()
    const t = await setup
    return {
      as: (member) => t.repos[member],
      asStranger: () => t.repos.stranger,
      memberIds: t.memberIds,
      strangerId: crypto.randomUUID(),
      cleanup: () => resetTeam(t),
    }
  })

  afterAll(async () => {
    if (!setup) return
    const t = await setup
    await wipeData(t.service)
    fail('remove members', (await t.service.from('members').delete().neq('id', ZERO)).error)
    await removeUsers(t.service)
  })
} else {
  describe.skip('Repository contract: SupabaseRepository (set UA_TEST_SUPABASE_* to run)', () => {
    it('runs against a Supabase project', () => {})
  })
}
