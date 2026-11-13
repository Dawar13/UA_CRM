/**
 * Google Calendar in the app (Phase 2, D-050): the signed-in member's connection, the sync
 * triggers, and the calendar actions. Calendars are shared, view only (D-054): any member's
 * connection and links can be read; every change is the actor's own.
 */
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useActor } from '@/auth/AuthContext'
import { UNDO_TOAST_DURATION } from '@/data/hooks/mutations'
import { useRepository } from '@/data/RepositoryContext'
import {
  CalendarError,
  type CalendarSyncReason,
  type EventLink,
  type MutationContext,
  type NextActionEventInput,
} from '@/data/repository'
import type { MeetingMark, MeetingOutcome } from '@/domain/calendar/meetings'
import type { Id } from '@/domain/types'
import { type UndoEntry, useUndoStack } from '@/lib/undoStack'

const ctxOf = (actorId: Id): MutationContext => ({ actorId, now: new Date() })

export const calendarKeys = {
  connection: (memberId: Id) => ['calendarConnection', memberId] as const,
  links: (memberId: Id) => ['eventLinks', memberId] as const,
  marks: (memberId: Id) => ['meetingMarks', memberId] as const,
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
    case 'unauthorized':
      return 'The calendar server could not confirm your sign-in. Sign out and in again, then retry.'
    case 'server_error':
      return 'The calendar server hit an error. Try again in a minute.'
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

/** The signed-in member's calendar connection, or another member's (view only, D-054). */
export function useCalendarConnection(memberId?: Id) {
  const repository = useRepository()
  const actor = useActor()
  const owner = memberId ?? actor?.id ?? ''
  return useQuery({
    queryKey: calendarKeys.connection(owner),
    queryFn: actor ? () => repository.getCalendarConnection(ctxOf(actor.id), owner) : skipToken,
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

export function useEventLinks(memberId?: Id) {
  const repository = useRepository()
  const actor = useActor()
  const owner = memberId ?? actor?.id ?? ''
  return useQuery({
    queryKey: calendarKeys.links(owner),
    queryFn: actor ? () => repository.listEventLinks(ctxOf(actor.id), owner) : skipToken,
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

// ---------- Did a meeting happen? (D-059) ----------

/** One meeting's answer; `null` takes it back (unanswered counts as held). */
export interface MeetingChange {
  eventKey: string
  outcome: MeetingOutcome | null
}

const toOutcomes = (marks: MeetingMark[]): ReadonlyMap<string, MeetingOutcome> =>
  new Map(marks.map((m) => [m.eventKey, m.outcome]))

/** Meetings marked held or missed, by event key: yours, or another member's (view only). */
export function useMeetingMarks(memberId?: Id) {
  const repository = useRepository()
  const actor = useActor()
  const owner = memberId ?? actor?.id ?? ''
  return useQuery({
    queryKey: calendarKeys.marks(owner),
    queryFn: actor ? () => repository.listMeetingMarks(ctxOf(actor.id), owner) : skipToken,
    select: toOutcomes,
  })
}

function withChanges(
  marks: readonly MeetingMark[],
  changes: readonly MeetingChange[],
): MeetingMark[] {
  const next = new Map(marks.map((m) => [m.eventKey, m.outcome]))
  for (const { eventKey, outcome } of changes) {
    if (outcome === null) next.delete(eventKey)
    else next.set(eventKey, outcome)
  }
  return [...next].map(([eventKey, outcome]) => ({ eventKey, outcome }))
}

/**
 * Marks your own meetings held or missed: on screen at once, then saved, with Undo on the toast
 * and in the undo stack. A missed meeting's history entry and last touch follow from the server.
 */
export function useMarkMeetings() {
  const repository = useRepository()
  const actor = useActor()
  const queryClient = useQueryClient()
  const key = calendarKeys.marks(actor?.id ?? '')
  const save = (changes: readonly MeetingChange[]) => {
    if (!actor) throw new CalendarError('unauthorized')
    return repository.markMeetings(changes, ctxOf(actor.id))
  }
  const refresh = () =>
    Promise.all(
      ['meetingMarks', 'history', 'memberHistory', 'rows', 'row', 'memberRows'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    )
  return useMutation({
    /** `label` names the change for undo ("Mark Call with Rohan missed"); `done` is the toast. */
    mutationFn: (v: { changes: MeetingChange[]; label: string; done: string }) => save(v.changes),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<MeetingMark[]>(key) ?? []
      queryClient.setQueryData<MeetingMark[]>(key, withChanges(before, v.changes))
      return { before }
    },
    onError: (_error, _v, snapshot) => {
      queryClient.setQueryData(key, snapshot?.before)
      toast.error('The meeting could not be marked. Try again.')
    },
    onSuccess: (_d, v, snapshot) => {
      const previous = new Map((snapshot?.before ?? []).map((m) => [m.eventKey, m.outcome]))
      const undo = v.changes.map((c) => ({
        eventKey: c.eventKey,
        outcome: previous.get(c.eventKey) ?? null,
      }))
      const entry: UndoEntry = {
        label: v.label,
        undo: async () => {
          await save(undo)
          await refresh()
        },
        redo: async () => {
          await save(v.changes)
          await refresh()
        },
      }
      useUndoStack.getState().push(entry)
      toast(v.done, {
        id: 'mark-meeting',
        duration: UNDO_TOAST_DURATION,
        action: { label: 'Undo', onClick: () => void useUndoStack.getState().undoEntry(entry) },
      })
    },
    onSettled: refresh,
  })
}
