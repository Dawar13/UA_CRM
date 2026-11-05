import { useEffect, useState } from 'react'

/**
 * True once the browser has been idle after mount, so secondary panel work (matching contacts,
 * the last 30 days) never competes with the grid's first paint and first edits for IndexedDB.
 */
export function useAfterIdle(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setReady(true), { timeout: 1500 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = window.setTimeout(() => setReady(true), 300)
    return () => window.clearTimeout(timer)
  }, [])
  return ready
}
