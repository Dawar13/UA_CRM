/**
 * A settings check for the calendar server: which settings it sees (names only), the kind of
 * secret key it holds, which Supabase project it talks to, and whether that database accepts the
 * key. Never a secret or a personal detail. Open it in a browser: /api/calendar/health
 */
import { ConfigError, readEnv } from '../_lib/env.js'
import { json, methodNotAllowed } from '../_lib/http.js'
import { StoreError, SupabaseStore, serverClient } from '../_lib/supabaseStore.js'

const NAMES = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'CALENDAR_TOKEN_KEY',
  'CRON_SECRET',
  'APP_BASE_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'CALENDAR_SUPABASE_SECRET_KEY',
] as const

/** What kind of key a value is, from its shape alone. */
export function keyKind(value: string): string {
  if (value === '') return 'missing'
  if (value.startsWith('sb_secret_')) return 'secret key'
  if (value.startsWith('sb_publishable_')) return 'publishable key (wrong: use a secret key)'
  const parts = value.split('.')
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString()) as {
        role?: string
        ref?: string
      }
      return `legacy ${claims.role ?? 'unknown'} key for project ${claims.ref ?? 'unknown'}`
    } catch {
      return 'unreadable'
    }
  }
  return 'not a Supabase key'
}

function projectOf(url: string): string {
  return (
    /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ??
    (url ? 'not a supabase.co address' : 'missing')
  )
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    const present = Object.fromEntries(
      NAMES.map((name) => [name, Boolean(process.env[name]?.trim())]),
    )
    let env: ReturnType<typeof readEnv>
    try {
      env = readEnv()
    } catch (error) {
      return json({
        ok: false,
        settings: present,
        missing: error instanceof ConfigError ? error.missing : ['unreadable'],
      })
    }
    let database = 'ok'
    try {
      await new SupabaseStore(serverClient(env.supabaseUrl, env.supabaseSecretKey)).listConnections(
        'active',
      )
    } catch (error) {
      database =
        error instanceof StoreError && error.keyRefused
          ? 'refused: CALENDAR_SUPABASE_SECRET_KEY is not a secret key of this project'
          : error instanceof StoreError
            ? error.message
            : 'unreachable'
    }
    return json({
      ok: database === 'ok',
      settings: present,
      supabaseProject: projectOf(env.supabaseUrl),
      secretKey: keyKind(env.supabaseSecretKey),
      database,
      appBaseUrl: env.appBaseUrl,
    })
  },
}
