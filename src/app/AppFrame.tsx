import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Outlet, useNavigate, useParams } from 'react-router'
import { useMembers } from '@/data/hooks'
import { useRepository } from '@/data/RepositoryContext'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { testHooksEnabled } from '@/lib/env'
import { ShellSkeleton } from './MainView'
import { NotFound } from './NotFound'
import { memberPath, pickMember, sheetPath } from './navigation'
import { ShortcutSheet } from './ShortcutSheet'
import { useGlobalShortcuts } from './useGlobalShortcuts'

declare global {
  interface Window {
    /** Test hooks, present only when test hooks are enabled (dev or VITE_ENABLE_TEST_HOOKS=1). */
    __uaTest?: {
      resetSampleData: () => Promise<void>
      /** Loads the 2,000-row sheet and returns its path. */
      loadPerfSheet: () => Promise<string>
    }
  }
}

function TestHooks() {
  const repository = useRepository()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  useEffect(() => {
    if (!testHooksEnabled) return
    window.__uaTest = {
      resetSampleData: async () => {
        await repository.resetSampleData()
        await queryClient.resetQueries()
      },
      loadPerfSheet: async () => {
        const sheet = await repository.loadPerfSheet()
        const owner = (await repository.listMembers()).find((m) => m.id === sheet.memberId)
        await queryClient.invalidateQueries()
        const path = owner ? sheetPath(owner.slug, sheet.slug) : '/'
        navigate(path)
        return path
      },
    }
    return () => {
      window.__uaTest = undefined
    }
  }, [repository, queryClient, navigate])
  return null
}

/** Wraps every app route: global shortcuts, the command palette and the shortcut sheet. */
export function AppFrame() {
  useGlobalShortcuts()
  const { memberSlug } = useParams()
  const { data: members } = useMembers()
  const currentMember = members?.find((m) => m.slug === memberSlug)
  return (
    <>
      <Outlet />
      <CommandPalette currentMember={currentMember} />
      <ShortcutSheet />
      <TestHooks />
    </>
  )
}

/** / → the last used member and sheet, or the first. */
export function RootRedirect() {
  const { data: members, isPending } = useMembers()
  if (isPending) return <ShellSkeleton />
  const member = members ? pickMember(members) : undefined
  return member ? <Navigate to={memberPath(member.slug)} replace /> : <NotFound />
}
