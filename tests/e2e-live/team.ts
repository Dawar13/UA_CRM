/** The invented team for live browser tests, and a service client to set it up. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const LIVE_PASSWORD = 'Live-test-password-1'
export const live = {
  dawar: { email: 'live-dawar@example.test', name: 'Dawar', slug: 'dawar' },
  dhruv: { email: 'live-dhruv@example.test', name: 'Dhruv', slug: 'dhruv' },
  stranger: { email: 'live-stranger@example.test' },
} as const

/** Dhruv's sheet and row, made by the setup, which Dawar can see and must not change. */
export const DHRUV_SHEET = '7e57a000-0000-4000-8000-0000000000aa'
export const DHRUV_ROW = '7e57a000-0000-4000-8000-000000000001'

const ZERO = '00000000-0000-0000-0000-000000000000'

export function serviceClient(): SupabaseClient {
  const url = process.env.UA_TEST_SUPABASE_URL ?? ''
  const key = process.env.UA_TEST_SUPABASE_SECRET_KEY ?? ''
  if (!url || !key) throw new Error('Set UA_TEST_SUPABASE_URL and UA_TEST_SUPABASE_SECRET_KEY.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`)
}

/** Clears the test project: only ever one holding nothing but invented members. */
export async function clearProject(service: SupabaseClient): Promise<void> {
  const { data, error } = await service.from('members').select('email')
  fail('read members', error)
  if ((data ?? []).some((m) => !String(m.email).endsWith('@example.test'))) {
    throw new Error('The live tests need a project with no real members.')
  }
  fail('clear rows', (await service.from('rows').delete().neq('id', ZERO)).error)
  fail('clear sheets', (await service.from('sheets').delete().neq('id', ZERO)).error)
  fail('clear tags', (await service.from('tags').delete().neq('id', ZERO)).error)
  fail('clear members', (await service.from('members').delete().neq('id', ZERO)).error)
  const users = await service.auth.admin.listUsers({ perPage: 1000 })
  fail('list users', users.error)
  for (const user of users.data?.users ?? []) {
    if (user.email?.endsWith('@example.test')) {
      fail('remove user', (await service.auth.admin.deleteUser(user.id)).error)
    }
  }
}
