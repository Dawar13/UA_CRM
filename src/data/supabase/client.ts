/** The one Supabase client of the app (Supabase mode only). The session persists in the browser. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from '@/lib/env'
import { STORAGE_PREFIX } from '@/lib/storage'

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  client ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: `${STORAGE_PREFIX}auth`,
    },
  })
  return client
}
