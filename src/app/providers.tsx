import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Toaster } from '@/components/ui/Toast'
import { RepositoryProvider } from '@/data/RepositoryContext'
import { ShellSkeleton } from './MainView'
import { ThemeProvider } from './theme'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Local data: always fresh until a mutation invalidates it.
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Children render once the local database is seeded (first launch only). */}
        <RepositoryProvider fallback={<ShellSkeleton />}>{children}</RepositoryProvider>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
