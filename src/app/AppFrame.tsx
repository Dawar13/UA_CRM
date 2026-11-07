import { useQueryClient } from '@tanstack/react-query'
import { useContext, useEffect } from 'react'
import { Navigate, Outlet, useNavigate, useParams } from 'react-router'
import { AuthContext, useActor } from '@/auth/AuthContext'
import { useMembers } from '@/data/hooks'
import { useRepository } from '@/data/RepositoryContext'
import { useCalendarAutoSync, useCalendarReturn } from '@/features/calendar/useCalendar'
import { CommandPalette } from '@/features/command-palette/CommandPalette'
import { DuplicateReviewDialog } from '@/features/quick-add/DuplicateReview'
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
      /** Local mode: act as another member (by id or slug). */
      signInAs: (member: string) => Promise<void>
    }
  }
}

function TestHooks() {
  const auth = useContext(AuthContext)
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
      signInAs: async (key: string) => {
        const members = await repository.listMembers()
        const target = members.find((m) => m.id === key || m.slug === key)
        if (!target) throw new Error(`No member ${key}`)
        auth?.signInAs?.(target.id)
      },
    }
    return () => {
      window.__uaTest = undefined
    }
  }, [repository, queryClient, navigate, auth])
  return null
}

/** Google Calendar in the background: the return from Google's consent screen, and syncing. */
function CalendarEffects() {
  useCalendarReturn()
  useCalendarAutoSync()
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
      <DuplicateReviewDialog />
      <CalendarEffects />
      <TestHooks />
    </>
  )
}

/** / → the signed-in member's tab (their last used sheet, or the first). */
export function RootRedirect() {
  const { data: members, isPending } = useMembers()
  const actor = useActor()
  if (isPending) return <ShellSkeleton />
  const member =
    members?.find((m) => m.id === actor?.id) ?? (members ? pickMember(members) : undefined)
  return member ? <Navigate to={memberPath(member.slug)} replace /> : <NotFound />
}
