import type { SupabaseClient } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { LocalAuthProvider } from '@/auth/LocalAuthProvider'
import { SignInScreen } from '@/auth/SignInScreen'
import { SupabaseAuthProvider } from '@/auth/SupabaseAuthProvider'
import { Toaster } from '@/components/ui/Toast'
import { RepositoryProvider } from '@/data/RepositoryContext'
import { getSupabaseClient } from '@/data/supabase/client'
import { subscribeToChanges } from '@/data/supabase/realtime'
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository'
import { dataMode } from '@/lib/env'
import { ShellSkeleton } from './MainView'
import { ThemeProvider } from './theme'

export function createQueryClient(): QueryClient {
  const remote = dataMode === 'supabase'
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Local data is fresh until a mutation invalidates it. Remote data is kept fresh by
        // Realtime, with a refresh on focus and reconnect in case a change was missed.
        staleTime: remote ? 30_000 : Number.POSITIVE_INFINITY,
        retry: remote ? 1 : false,
        refetchOnWindowFocus: remote,
        refetchOnReconnect: remote,
      },
      mutations: { retry: false },
    },
  })
}

/** Sample data in the browser, acting as a member picked locally. */
function LocalData({ children }: { children: ReactNode }) {
  return (
    // Children render once the local database is seeded (first launch only).
    <RepositoryProvider fallback={<ShellSkeleton />}>
      <LocalAuthProvider>{children}</LocalAuthProvider>
    </RepositoryProvider>
  )
}

/** The signed-in member's view of Supabase, live. One repository per member. */
function SupabaseSession({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const queryClient = useQueryClient()
  const [repository] = useState(() => new SupabaseRepository(client))
  useEffect(() => {
    const live = subscribeToChanges(client, queryClient)
    repository.onPrivateChange = live.notify
    return () => {
      repository.onPrivateChange = null
      live.stop()
    }
  }, [client, queryClient, repository])
  // A save takes a round trip or two. Closing or reloading the tab in that moment would drop it
  // silently, so the browser asks first (CLAUDE.md §3.1, never lose typed text).
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (queryClient.isMutating() > 0) event.preventDefault()
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [queryClient])
  return (
    <RepositoryProvider repository={repository} fallback={<ShellSkeleton />}>
      {children}
    </RepositoryProvider>
  )
}

function SupabaseGate({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const { status, member } = useAuth()
  if (status === 'loading') return <ShellSkeleton />
  if (status === 'signed-out' || !member) return <SignInScreen />
  return (
    <SupabaseSession key={member.id} client={client}>
      {children}
    </SupabaseSession>
  )
}

function SupabaseData({ children }: { children: ReactNode }) {
  const [client] = useState(getSupabaseClient)
  return (
    <SupabaseAuthProvider client={client}>
      <SupabaseGate client={client}>{children}</SupabaseGate>
    </SupabaseAuthProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {dataMode === 'supabase' ? (
          <SupabaseData>{children}</SupabaseData>
        ) : (
          <LocalData>{children}</LocalData>
        )}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
