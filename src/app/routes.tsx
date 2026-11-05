import type { RouteObject } from 'react-router'
import { testHooksEnabled } from '@/lib/env'

/** Temporary home until the app shell lands in M0.4. */
function Placeholder() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg text-text">
      <p className="text-secondary">UA · Internal CRM</p>
    </main>
  )
}

export const routes: RouteObject[] = [
  ...(testHooksEnabled
    ? [
        {
          path: '/design',
          lazy: async () => {
            const { DesignPage } = await import('@/features/design/DesignPage')
            return { Component: DesignPage }
          },
        } satisfies RouteObject,
      ]
    : []),
  { path: '*', Component: Placeholder },
]
