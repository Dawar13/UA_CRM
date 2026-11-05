import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { ErrorBoundary } from './ErrorBoundary'
import { Providers } from './providers'
import { routes } from './routes'

const router = createBrowserRouter(routes)

export function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  )
}
