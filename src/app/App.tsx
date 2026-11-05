import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Providers } from './providers'
import { routes } from './routes'

const router = createBrowserRouter(routes)

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
