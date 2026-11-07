/**
 * Production wiring for the calendar endpoints: real Google, Supabase and the clock. Each endpoint
 * file is one line: `export default route(handleX)`. A missing setting answers 503 and names it
 * in the log only; any other failure answers 500 with no detail.
 */
import { ConfigError, readEnv } from './env.js'
import type { HandlerDeps } from './handlers.js'
import { bearer, json } from './http.js'
import { consoleLogger } from './log.js'
import { memberForToken, SupabaseStore, serverClient, supabaseRowGateway } from './supabaseStore.js'

let cached: HandlerDeps | null = null

export function productionDeps(source: Record<string, string | undefined> = process.env) {
  const env = readEnv(source)
  const deps: HandlerDeps = {
    env,
    store: new SupabaseStore(serverClient(env.supabaseUrl, env.supabaseSecretKey)),
    google: { env, fetch: (input, init) => fetch(input, init) },
    now: () => new Date(),
    log: consoleLogger,
    async authenticate(request) {
      const token = bearer(request)
      if (!token) return null
      const member = await memberForToken(env.supabaseUrl, env.supabasePublishableKey, token)
      return member ? { member, token } : null
    },
    rowsFor: (caller) =>
      supabaseRowGateway(
        serverClient(env.supabaseUrl, env.supabasePublishableKey, caller.token),
        caller.member.id,
      ),
  }
  return deps
}

type Handler = (deps: HandlerDeps, request: Request) => Promise<Response>

/** A Vercel function (Web-standard handler) around one calendar handler. */
export function route(handler: Handler) {
  return {
    async fetch(request: Request): Promise<Response> {
      let deps: HandlerDeps
      try {
        cached ??= productionDeps()
        deps = cached
      } catch (error) {
        if (error instanceof ConfigError) {
          consoleLogger('calendar.config.missing', { names: error.missing.join(',') })
          return json({ error: 'not_configured' }, 503)
        }
        throw error
      }
      try {
        return await handler(deps, request)
      } catch (error) {
        deps.log('calendar.error', {
          path: new URL(request.url).pathname,
          name: error instanceof Error ? error.name : 'unknown',
        })
        return json({ error: 'server_error' }, 500)
      }
    },
  }
}
