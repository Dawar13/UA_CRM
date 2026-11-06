import { defineConfig, devices } from '@playwright/test'

/**
 * Live browser tests (Phase 1): the app in Supabase mode against a Supabase project with two
 * invented members, signing in with email and password. In CI that is the local stack started by
 * the `db` job; UA_TEST_SUPABASE_URL, UA_TEST_SUPABASE_PUBLISHABLE_KEY and
 * UA_TEST_SUPABASE_SECRET_KEY must be set. The setup refuses a project with real members.
 */
const PORT = 4174
const BASE_URL = `http://localhost:${PORT}`
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'tests/e2e-live',
  testMatch: ['**/*.spec.ts'],
  outputDir: 'test-results-live',
  globalSetup: './tests/e2e-live/setup.ts',
  globalTeardown: './tests/e2e-live/teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `pnpm exec vite build --outDir dist-live && pnpm exec vite preview --outDir dist-live --port ${PORT} --strictPort`,
    url: BASE_URL,
    env: {
      VITE_ENABLE_TEST_HOOKS: '1',
      VITE_DATA: 'supabase',
      VITE_SUPABASE_URL: process.env.UA_TEST_SUPABASE_URL ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.UA_TEST_SUPABASE_PUBLISHABLE_KEY ?? '',
    },
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
