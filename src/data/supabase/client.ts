/** The one Supabase client of the app (Supabase mode only). The session persists in the browser. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl, testHooksEnabled } from '@/lib/env'
import { STORAGE_PREFIX } from '@/lib/storage'

declare global {
  interface Window {
    /**
     * The signed-in client, with test hooks only: the live tests use it to force a write past
     * the UI and prove the database refuses it. Anyone can build the same client from the
     * publishable key, so this exposes nothing the database does not already guard.
     */
    __uaSupabase?: SupabaseClient
  }
}

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: `${STORAGE_PREFIX}auth`,
      },
    })
    if (testHooksEnabled && typeof window !== 'undefined') window.__uaSupabase = client
  }
  return client
}
