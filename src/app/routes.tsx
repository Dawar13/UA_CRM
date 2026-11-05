import type { RouteObject } from 'react-router'
import { testHooksEnabled } from '@/lib/env'
import { AppFrame, RootRedirect } from './AppFrame'
import { RouteError } from './ErrorBoundary'
import { MainView, MemberRedirect } from './MainView'
import { NotFound } from './NotFound'

export const routes: RouteObject[] = [
  {
    Component: AppFrame,
    errorElement: <RouteError />,
    children: [
      { index: true, Component: RootRedirect },
      { path: 'm/:memberSlug', Component: MemberRedirect },
      { path: 'm/:memberSlug/:sheetSlug', Component: MainView },
      ...(testHooksEnabled
        ? [
            {
              path: 'design',
              // Shown while the lazy chunk loads on a direct visit; without it React Router warns
              // "No HydrateFallback element provided" on the first render.
              HydrateFallback: () => null,
              lazy: async () => {
                const { DesignPage } = await import('@/features/design/DesignPage')
                return { Component: DesignPage }
              },
            } satisfies RouteObject,
          ]
        : []),
      { path: '*', Component: NotFound },
    ],
  },
]
