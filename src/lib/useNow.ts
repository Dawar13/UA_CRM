import { useSyncExternalStore } from 'react'

/**
 * The current time for display ("Today", "overdue", relative phrases). One shared timer for the
 * whole app: subscribers re-render once a minute and when the tab becomes visible again.
 * Playwright freezes time with page.clock, and tests with fake timers, both of which this
 * respects because it reads `Date.now()`.
 */
const TICK_MS = 60_000

let snapshot: Date = new Date()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

/** Stable within a minute so React sees the same snapshot between renders. */
function getSnapshot(): Date {
  const now = Date.now()
  if (Math.floor(now / TICK_MS) !== Math.floor(snapshot.getTime() / TICK_MS)) {
    snapshot = new Date(now)
  }
  return snapshot
}

function notify(): void {
  for (const listener of listeners) listener()
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === undefined) {
    timer = setInterval(notify, TICK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}

export function useNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
