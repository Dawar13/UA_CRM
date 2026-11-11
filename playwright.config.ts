import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

/**
 * Browser tests: e2e, a11y, visual and perf live under tests/<layer>/**\/*.spec.ts.
 *
 * Every test runs against a production build with the test hooks on (`VITE_ENABLE_TEST_HOOKS=1`,
 * which enables /design and the 2,000-row perf sheet), in a fresh browser context, in IST with the
 * en-IN locale. tests/support/fixtures.ts freezes the clock to 5 Nov 2026, 10:00 IST.
 *
 * Visual baselines are only generated in the official Playwright Linux Docker image
 * (`pnpm test:visual:update` or the "Visual baselines" workflow), so snapshot paths carry no
 * platform suffix.
 */
export default defineConfig({
  testDir: 'tests',
  testMatch: ['{e2e,a11y,visual,perf}/**/*.spec.ts'],
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  use: {
    baseURL: BASE_URL,
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@phone/,
    },
    {
      name: 'narrow',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
      grepInvert: /@phone/,
    },
    {
      // The phone layout (D-056): tests tagged @phone, on a touch phone.
      name: 'phone',
      use: { ...devices['Pixel 7'] },
      grep: /@phone/,
    },
    {
      // The main flow only: tests tagged @smoke.
      name: 'webkit-smoke',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
      grep: /@smoke/,
      // WebKit's IndexedDB is slow, especially in its Windows build, and every test seeds a fresh
      // database on first load. Fewer parallel WebKit workers and a longer timeout keep the
      // smoke run reliable without changing what it checks.
      workers: 2,
      timeout: 60_000,
      expect: { timeout: 10_000 },
    },
  ],

  webServer: {
    command: `pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: BASE_URL,
    env: { VITE_ENABLE_TEST_HOOKS: '1' },
    reuseExistingServer: !isCI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
