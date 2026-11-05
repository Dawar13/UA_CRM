/**
 * Test hooks (the /design route, the 2,000-row perf sheet loader, window.__uaTest) are on in
 * development builds, or when built with VITE_ENABLE_TEST_HOOKS=1 (Playwright does this).
 */
export const testHooksEnabled: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_HOOKS === '1'

/** The Developer section of the overflow menu is for development builds only. */
export const isDevBuild: boolean = import.meta.env.DEV
