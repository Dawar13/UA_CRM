/**
 * Provides the Repository to the hooks. Defaults to one shared LocalRepository and seeds it
 * once before rendering children.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { LocalRepository } from './local/LocalRepository'
import type { Repository } from './repository'

const RepositoryContext = createContext<Repository | null>(null)

let defaultRepository: LocalRepository | null = null

/** The app-wide LocalRepository on the `ua-crm` IndexedDB database. */
export function getDefaultRepository(): LocalRepository {
  defaultRepository ??= new LocalRepository()
  return defaultRepository
}

/** One seeding promise per repository, so StrictMode's double effects seed once. */
const seeding = new WeakMap<Repository, Promise<void>>()

function seedOnce(repository: Repository): Promise<void> {
  let promise = seeding.get(repository)
  if (!promise) {
    promise = repository.ensureSeeded()
    seeding.set(repository, promise)
    promise.catch(() => seeding.delete(repository))
  }
  return promise
}

export interface RepositoryProviderProps {
  /** Defaults to the shared LocalRepository. Tests pass one on a fresh database. */
  repository?: Repository
  /** Rendered while the sample data is being seeded. Defaults to nothing. */
  fallback?: ReactNode
  children: ReactNode
}

export function RepositoryProvider({
  repository,
  fallback = null,
  children,
}: RepositoryProviderProps) {
  const repo = useMemo(() => repository ?? getDefaultRepository(), [repository])
  const [state, setState] = useState<{ repo: Repository; error: unknown } | null>(null)

  useEffect(() => {
    let active = true
    seedOnce(repo).then(
      () => {
        if (active) setState({ repo, error: null })
      },
      (error: unknown) => {
        if (active) setState({ repo, error: error ?? new Error('Seeding failed.') })
      },
    )
    return () => {
      active = false
    }
  }, [repo])

  // Surface seeding failures to the nearest error boundary.
  if (state?.repo === repo && state.error) throw state.error
  if (state?.repo !== repo) return <>{fallback}</>
  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>
}

export function useRepository(): Repository {
  const repository = useContext(RepositoryContext)
  if (!repository) throw new Error('useRepository must be used inside a RepositoryProvider.')
  return repository
}
