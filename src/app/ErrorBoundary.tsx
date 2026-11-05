import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useRouteError } from 'react-router'

function ErrorScreen({ onReload }: { onReload: () => void }) {
  return (
    <main role="alert" className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-lg text-text">Something went wrong</h1>
        <p className="text-base text-secondary">
          Your data is stored safely on this device. Reloading usually fixes this.
        </p>
        <button
          type="button"
          onClick={onReload}
          className="mt-2 inline-flex h-8 items-center rounded-control bg-primary px-3 text-base font-medium text-primary-fg hover:bg-primary-hover"
        >
          Reload
        </button>
      </div>
    </main>
  )
}

const reload = () => window.location.reload()

/** Top-level error boundary with a calm message and a reload button. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error', error, info.componentStack)
  }

  override render() {
    return this.state.error ? <ErrorScreen onReload={reload} /> : this.props.children
  }
}

/** Router-level error element. */
export function RouteError() {
  const error = useRouteError()
  console.error('Route error', error)
  return <ErrorScreen onReload={reload} />
}
