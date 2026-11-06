/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `supabase` to use the hosted database; anything else runs on local sample data. */
  readonly VITE_DATA?: string
  readonly VITE_SUPABASE_URL?: string
  /** The browser-safe publishable key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Older name for the same key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ENABLE_TEST_HOOKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
