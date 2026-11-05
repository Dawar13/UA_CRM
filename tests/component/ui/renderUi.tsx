/**
 * Render helpers for component tests of src/components: the tooltip provider (no delay) and the
 * theme provider, plus a frozen clock at Thu 5 Nov 2026, 10:00 IST.
 */
import { type RenderOptions, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'
import { vi } from 'vitest'
import { ThemeProvider } from '@/app/theme'

export const FROZEN_NOW = new Date('2026-11-05T10:00:00+05:30')

// Pointer and keyboard journeys through portalled menus and dialogs take about a second each,
// but can pass 5 s when every test file runs in parallel on a busy machine.
vi.setConfig({ testTimeout: 15_000 })

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
        {children}
      </Tooltip.Provider>
    </ThemeProvider>
  )
}

export function renderUi(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const user = userEvent.setup()
  return { user, ...render(ui, { wrapper: Wrapper, ...options }) }
}

/** Freezes Date only (timers keep running so user-event and Radix work normally). */
export function freezeClock(now: Date = FROZEN_NOW): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
}

export function restoreClock(): void {
  vi.useRealTimers()
}
