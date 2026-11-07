/**
 * Google Calendar in the app (Phase 2, D-050): the signed-in member's connection, the sync
 * triggers, and the calendar actions. A calendar is private, so everything here is the actor's
 * own; another member's tab says so instead of asking.
 */
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useActor } from '@/auth/AuthContext'
import { useRepository } from '@/data/RepositoryContext'
import {
  CalendarError,
  type CalendarSyncReason,
  type EventLink,
  type MutationContext,
  type NextActionEventInput,
} from '@/data/repository'
import type { Id } from '@/domain/types'

const ctxOf = (actorId: Id): MutationContext => ({ actorId, now: new Date() })

export const calendarKeys = {
  connection: (memberId: Id) => ['calendarConnection', memberId] as const,
  links: (memberId: Id) => ['eventLinks', memberId] as const,
}

/** Sync on open when the last one is older than this (D-050). */
export const OPEN_SYNC_AFTER_MS = 5 * 60_000
/** And every this often while the app is visible. */
export const INTERVAL_SYNC_MS = 15 * 60_000

/** What a refused calendar action means, in the app's words. */
export function calendarErrorMessage(error: unknown): string {
  const code = error instanceof CalendarError ? error.code : ''
  switch (code) {
    case 'not_connected':
      return 'Connect Google Calendar first.'
    case 'needs_reconnect':
      return 'Google access ended. Reconnect Google Calendar.'
    case 'fuzzy_date':
      return 'Pick an exact day to add it to the calendar.'
    case 'no_email':
      return 'This contact has no email to invite.'
    case 'no_next_action':
      return 'Add a next action first.'
    case 'bad_time':
      return 'Use a time like 4:00 pm.'
    case 'not_configured':
      return 'Google Calendar is not set up on the server yet.'
    case 'network':
      return 'Could not reach the server. Check the connection.'
    default:
      return 'Google Calendar did not respond. Try again.'
  }
}

/** Why connecting failed, from the callback's `reason`. */
export function connectErrorMessage(reason: string | null): string {
  switch (reason) {
    case 'denied':
      return 'Google Calendar was not connected: access was declined.'
    case 'scope_missing':
      return 'Google Calendar was not connected. Allow calendar access on Google’s screen.'
    case 'no_refresh_token':
      return 'Google did not grant lasting access. Connect again.'
    case 'state_expired':
    case 'state_used':
    case 'state_unknown':
      return 'That connection link expired. Connect again.'
    default:
      return 'Google did not finish connecting. Try again.'
  }
}

export function useCalendarConnection() {
  const repository = useRepository()
  const actor = useActor()
  return useQuery({
    queryKey: calendarKeys.connection(actor?.id ?? ''),
    queryFn: actor ? () => repository.getCalendarConnection(ctxOf(actor.id)) : skipToken,
  })
}

function refreshCalendar(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['calendarConnection'] }),
    queryClient.invalidateQueries({ queryKey: ['events'] }),
    queryClient.invalidateQueries({ queryKey: ['eventLinks'] }),
  ])
}

function useRefreshCalendar() {
  const queryClient = useQueryClient()
  return () => refreshCalendar(queryClient)
}

export function useSyncCalendar() {
  const repository = useRepository()
  const actor = useActor()
  const refresh = useRefreshCalendar()
  return useMutation({
    mutationFn: (reason: CalendarSyncReason) => {
      if (!actor) throw new CalendarError('unauthorized')
      return repository.syncCalendar(reason, ctxOf(actor.id))
    },
    onSettled: refresh,
  })
}

/** Sync when the app opens (if stale), every 15 minutes while visible, and when it comes back. */
export function useCalendarAutoSync(): void {
  const { data: connection } = useCalendarConnection()
  const sync = useSyncCalendar()
  const syncRef = useRef(sync.mutate)
  syncRef.current = sync.mutate
  const active = connection?.state === 'active'
  const lastSynced = connection?.lastSyncedAt ?? null
  const lastRef = useRef(lastSynced)
  lastRef.current = lastSynced

  useEffect(() => {
    if (!active) return
    const age = () => (lastRef.current ? Date.now() - Date.parse(lastRef.current) : Infinity)
    if (age() > OPEN_SYNC_AFTER_MS) syncRef.current('open')
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') syncRef.current('interval')
    }, INTERVAL_SYNC_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && age() > INTERVAL_SYNC_MS) {
        syncRef.current('interval')
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active])
}

export function useConnectCalendar() {
  const repository = useRepository()
  const actor = useActor()
  const location = useLocation()
  return useMutation({
    mutationFn: async () => {
      if (!actor) throw new CalendarError('unauthorized')
      const params = new URLSearchParams(location.search)
      params.delete('calendar')
      params.delete('reason')
      const query = params.toString()
      const returnPath = `${location.pathname}${query ? `?${query}` : ''}`
      return repository.connectCalendar(returnPath, ctxOf(actor.id))
    },
    // Off to Google's consent screen (redirect, not a popup); it comes back to the callback.
    onSuccess: (url) => window.location.assign(url),
    onError: (error) => toast.error(calendarErrorMessage(error)),
  })
}

export function useDisconnectCalendar() {
  const repository = useRepository()
  const actor = useActor()
  const refresh = useRefreshCalendar()
  return useMutation({
    mutationFn: () => {
      if (!actor) throw new CalendarError('unauthorized')
      return repository.disconnectCalendar(ctxOf(actor.id))
    },
    onSuccess: () => toast('Google Calendar disconnected'),
    onError: (error) => toast.error(calendarErrorMessage(error)),
    onSettled: refresh,
  })
}

/** After Google's consent screen: says how it went, then tidies the address. */
export function useCalendarReturn(): void {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const outcome = params.get('calendar')
    if (outcome !== 'connected' && outcome !== 'error') return
    if (outcome === 'connected') toast('Google Calendar connected')
    else toast.error(connectErrorMessage(params.get('reason')))
    params.delete('calendar')
    params.delete('reason')
    const query = params.toString()
    void refreshCalendar(queryClient)
    navigate(`${location.pathname}${query ? `?${query}` : ''}`, { replace: true })
  }, [location.pathname, location.search, navigate, queryClient])
}

export function useEventLinks() {
  const repository = useRepository()
  const actor = useActor()
  return useQuery({
    queryKey: calendarKeys.links(actor?.id ?? ''),
    queryFn: actor ? () => repository.listEventLinks(ctxOf(actor.id)) : skipToken,
  })
}

export function useLinkEvent() {
  const repository = useRepository()
  const actor = useActor()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (link: EventLink) => {
      if (!actor) throw new CalendarError('unauthorized')
      return repository.linkEvent(link, ctxOf(actor.id))
    },
    onError: (error) => toast.error(calendarErrorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['eventLinks'] }),
  })
}

function useInvalidateRow() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rows'] }),
      queryClient.invalidateQueries({ queryKey: ['row'] }),
      queryClient.invalidateQueries({ queryKey: ['memberRows'] }),
      queryClient.invalidateQueries({ queryKey: ['events'] }),
    ])
}

export function useSaveNextActionEvent() {
  const repository = useRepository()
  const actor = useActor()
  const refresh = useInvalidateRow()
  return useMutation({
    mutationFn: (v: { rowId: Id; input: NextActionEventInput }) => {
      if (!actor) throw new CalendarError('unauthorized')
      return repository.saveNextActionEvent(v.rowId, v.input, ctxOf(actor.id))
    },
    onError: (error) => toast.error(calendarErrorMessage(error)),
    onSettled: refresh,
  })
}

export function useRemoveNextActionEvent() {
  const repository = useRepository()
  const actor = useActor()
  const refresh = useInvalidateRow()
  return useMutation({
    mutationFn: (rowId: Id) => {
      if (!actor) throw new CalendarError('unauthorized')
      return repository.removeNextActionEvent(rowId, ctxOf(actor.id))
    },
    onError: (error) => toast.error(calendarErrorMessage(error)),
    onSettled: refresh,
  })
}
