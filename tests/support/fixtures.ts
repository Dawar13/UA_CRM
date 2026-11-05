/**
 * Shared Playwright fixtures and helpers. Import `test` and `expect` from here, never from
 * '@playwright/test' directly, so every browser test gets the same environment:
 *
 * - **Frozen clock.** `Date` is fixed to Thu 5 Nov 2026, 10:00 IST (`FROZEN_NOW`) before the first
 *   navigation. Timers, animation frames and `performance.now()` keep running normally.
 * - **Fresh context.** Playwright gives every test a new browser context, so IndexedDB and
 *   localStorage start empty and the app reapplies the seed on first load.
 * - **Console guard.** Console errors, console warnings and uncaught page errors are collected into
 *   the `consoleIssues` fixture. A test that otherwise passes fails if any were collected (the
 *   Definition of Done allows none). A test that provokes one on purpose opts out with
 *   `test.use({ failOnConsoleIssues: false })` and asserts on `consoleIssues` itself.
 *
 * Helpers:
 * - `gotoApp(page, path)` navigates relative to `baseURL`. Pass `{ waitForReady: true }` to also wait
 *   for `waitForAppReady`.
 * - `waitForAppReady(page)` waits for `data-app-ready="true"` on `<html>` or `<body>`. The app shell
 *   sets it once the first data load has finished, so tests do not race the seed.
 * - `setTheme(page, mode)` stores a theme choice under `ua-crm:theme` before the app's inline theme
 *   script runs. Call it before the first navigation. It applies once per tab, so a reload keeps
 *   whatever the app stored afterwards (theme persistence stays testable).
 */
import { test as base, type ConsoleMessage, expect, type Page } from '@playwright/test'

/** The reference instant for every browser test: Thu 5 Nov 2026, 10:00 IST. */
export const FROZEN_NOW = new Date('2026-11-05T10:00:00+05:30')

/** localStorage key read by index.html and the ThemeProvider. */
export const THEME_STORAGE_KEY = 'ua-crm:theme'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface ConsoleIssue {
  kind: 'error' | 'warning' | 'pageerror'
  text: string
  /** `url:line:column` of the console call, when the browser reports one. */
  location?: string
}

interface UaFixtures {
  /** Console errors, warnings and uncaught page errors seen during the test, in order. */
  consoleIssues: ConsoleIssue[]
  /** Fail an otherwise passing test when `consoleIssues` is not empty. On by default. */
  failOnConsoleIssues: boolean
}

function describeConsoleMessage(message: ConsoleMessage): ConsoleIssue | null {
  const type = message.type()
  if (type !== 'error' && type !== 'warning') return null
  const { url, lineNumber, columnNumber } = message.location()
  return {
    kind: type,
    text: message.text(),
    location: url ? `${url}:${lineNumber}:${columnNumber}` : undefined,
  }
}

export const test = base.extend<UaFixtures>({
  failOnConsoleIssues: [true, { option: true }],

  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FROZEN_NOW)
    await use(page)
  },

  consoleIssues: [
    async ({ page, failOnConsoleIssues }, use, testInfo) => {
      const issues: ConsoleIssue[] = []
      page.on('console', (message) => {
        const issue = describeConsoleMessage(message)
        if (issue) issues.push(issue)
      })
      page.on('pageerror', (error) => {
        issues.push({ kind: 'pageerror', text: error.stack ?? error.message })
      })

      await use(issues)

      const passed = testInfo.status === testInfo.expectedStatus
      if (failOnConsoleIssues && passed && issues.length > 0) {
        const lines = issues.map(
          (issue) =>
            `  [${issue.kind}] ${issue.text}${issue.location ? ` (${issue.location})` : ''}`,
        )
        throw new Error(
          `The browser reported ${issues.length} console issue(s):\n${lines.join('\n')}`,
        )
      }
    },
    // Auto, so listeners are attached before the first navigation in every test.
    { auto: true },
  ],
})

export { expect }

/** Waits until the app shell marks itself ready (`data-app-ready="true"` on html or body). */
export async function waitForAppReady(
  page: Page,
  options: { timeout?: number } = {},
): Promise<void> {
  await page
    .locator(':is(html, body)[data-app-ready="true"]')
    .first()
    .waitFor({ state: 'attached', timeout: options.timeout })
}

/** Opens a path in the app (relative to `baseURL`). */
export async function gotoApp(
  page: Page,
  path = '/',
  options: { waitForReady?: boolean } = {},
): Promise<void> {
  await page.goto(path)
  if (options.waitForReady) await waitForAppReady(page)
}

/**
 * Stores the theme choice before the app boots. Call before the first navigation. The value is
 * written once per tab (tracked in sessionStorage), so later reloads see what the app saved.
 */
export async function setTheme(page: Page, mode: ThemeMode): Promise<void> {
  await page.addInitScript(
    ({ key, value, flag }) => {
      try {
        if (window.sessionStorage.getItem(flag) === null) {
          window.localStorage.setItem(key, value)
          window.sessionStorage.setItem(flag, '1')
        }
      } catch {
        // Storage is unavailable on about:blank; the next real navigation runs this again.
      }
    },
    { key: THEME_STORAGE_KEY, value: mode, flag: 'ua-crm:test-theme-applied' },
  )
}
