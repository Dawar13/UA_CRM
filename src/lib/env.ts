/**
 * Test hooks (the /design route, the 2,000-row perf sheet loader, window.__uaTest) are on in
 * development builds, or when built with VITE_ENABLE_TEST_HOOKS=1 (Playwright does this).
 */
export const testHooksEnabled: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_HOOKS === '1'

/** The Developer section of the overflow menu is for development builds only. */
export const isDevBuild: boolean = import.meta.env.DEV

/**
 * Where the data lives. `supabase` (production, and local development against the project)
 * needs the URL and the publishable key; anything else runs on local sample data in the browser
 * (tests, previews, development without a backend). Only VITE_DATA switches it, so a `.env`
 * with keys never sends tests to the real database.
 */
export type DataMode = 'local' | 'supabase'

export const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? ''
export const supabasePublishableKey: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const dataMode: DataMode =
  import.meta.env.VITE_DATA === 'supabase' && supabaseUrl !== '' && supabasePublishableKey !== ''
    ? 'supabase'
    : 'local'
