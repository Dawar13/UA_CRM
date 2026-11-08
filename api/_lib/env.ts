/**
 * Server settings, from Vercel environment variables (never VITE_-prefixed, never in the
 * repository). A missing setting is reported by name only.
 */

export interface ServerEnv {
  googleClientId: string
  googleClientSecret: string
  googleAuthUrl: string
  googleTokenUrl: string
  googleRevokeUrl: string
  googleApiBase: string
  /** The calendar scope (D-050): `calendar.events.owned` unless C0 showed it misses invitations. */
  calendarScope: string
  /** The app's public origin, for the OAuth callback, deep links and Google's push address. */
  appBaseUrl: string
  supabaseUrl: string
  supabasePublishableKey: string
  supabaseSecretKey: string
  /** AES-256-GCM keys by version; `tokenKeyVersion` encrypts, every listed version decrypts. */
  tokenKeys: ReadonlyMap<number, Buffer>
  tokenKeyVersion: number
  cronSecret: string
}

export class ConfigError extends Error {
  readonly missing: readonly string[]
  constructor(missing: readonly string[]) {
    super(`Missing server settings: ${missing.join(', ')}`)
    this.name = 'ConfigError'
    this.missing = missing
  }
}

export const GOOGLE_DEFAULTS = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  apiBase: 'https://www.googleapis.com/calendar/v3',
  scope: 'https://www.googleapis.com/auth/calendar.events.owned',
} as const

function key(base64: string, name: string): Buffer {
  const bytes = Buffer.from(base64.trim(), 'base64')
  if (bytes.length !== 32) throw new ConfigError([`${name} (must be 32 bytes, base64)`])
  return bytes
}

/**
 * Reads the settings. `CALENDAR_TOKEN_KEYS_PREVIOUS` ("1:<base64>,2:<base64>") keeps older keys
 * readable during a rotation (docs/RUNBOOK.md).
 *
 * Supabase: the server must use the project the app signs in to, so it takes the app's own
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` first (both public), and the secret key
 * from `CALENDAR_SUPABASE_SECRET_KEY` first. A Vercel Supabase integration may also define
 * `SUPABASE_URL` and its keys for another project; those are only the fallback.
 */
export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const get = (name: string) => source[name]?.trim() ?? ''
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'CALENDAR_TOKEN_KEY',
    'APP_BASE_URL',
  ]
  const missing = required.filter((name) => get(name) === '')
  const supabaseUrl = get('VITE_SUPABASE_URL') || get('SUPABASE_URL')
  const publishableKey = get('VITE_SUPABASE_PUBLISHABLE_KEY') || get('SUPABASE_PUBLISHABLE_KEY')
  const secretKey =
    get('CALENDAR_SUPABASE_SECRET_KEY') ||
    get('SUPABASE_SECRET_KEY') ||
    get('SUPABASE_SERVICE_ROLE_KEY')
  if (supabaseUrl === '') missing.push('VITE_SUPABASE_URL')
  if (publishableKey === '') missing.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (secretKey === '') missing.push('CALENDAR_SUPABASE_SECRET_KEY')
  if (missing.length > 0) throw new ConfigError(missing)

  const version = Number(get('CALENDAR_TOKEN_KEY_VERSION') || '1')
  if (!Number.isInteger(version) || version < 1) {
    throw new ConfigError(['CALENDAR_TOKEN_KEY_VERSION (a whole number from 1)'])
  }
  const tokenKeys = new Map<number, Buffer>()
  for (const part of get('CALENDAR_TOKEN_KEYS_PREVIOUS').split(',').filter(Boolean)) {
    const [v, value] = part.split(':')
    const n = Number(v)
    if (!Number.isInteger(n) || !value) {
      throw new ConfigError(['CALENDAR_TOKEN_KEYS_PREVIOUS (version:base64, comma separated)'])
    }
    tokenKeys.set(n, key(value, 'CALENDAR_TOKEN_KEYS_PREVIOUS'))
  }
  tokenKeys.set(version, key(get('CALENDAR_TOKEN_KEY'), 'CALENDAR_TOKEN_KEY'))

  return {
    googleClientId: get('GOOGLE_CLIENT_ID'),
    googleClientSecret: get('GOOGLE_CLIENT_SECRET'),
    googleAuthUrl: get('GOOGLE_AUTH_URL') || GOOGLE_DEFAULTS.authUrl,
    googleTokenUrl: get('GOOGLE_TOKEN_URL') || GOOGLE_DEFAULTS.tokenUrl,
    googleRevokeUrl: get('GOOGLE_REVOKE_URL') || GOOGLE_DEFAULTS.revokeUrl,
    googleApiBase: get('GOOGLE_API_BASE') || GOOGLE_DEFAULTS.apiBase,
    calendarScope: get('GOOGLE_CALENDAR_SCOPE') || GOOGLE_DEFAULTS.scope,
    appBaseUrl: get('APP_BASE_URL').replace(/\/+$/, ''),
    supabaseUrl,
    supabasePublishableKey: publishableKey,
    supabaseSecretKey: secretKey,
    tokenKeys,
    tokenKeyVersion: version,
    cronSecret: get('CRON_SECRET'),
  }
}

/** The OAuth callback address Google sends members back to (registered in Google Cloud). */
export function callbackUrl(env: Pick<ServerEnv, 'appBaseUrl'>): string {
  return `${env.appBaseUrl}/api/calendar/callback`
}

/** Push notifications need a public HTTPS address; localhost falls back to polling. */
export function canReceivePush(env: Pick<ServerEnv, 'appBaseUrl'>): boolean {
  return env.appBaseUrl.startsWith('https://') && !/localhost|127\.0\.0\.1/.test(env.appBaseUrl)
}
