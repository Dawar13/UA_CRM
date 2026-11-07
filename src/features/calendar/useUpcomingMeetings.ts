import { useMemo } from 'react'
import { useActor } from '@/auth/AuthContext'
import { useCalendarEvents } from '@/data/hooks'
import { addDaysIso, istInstant, todayIst } from '@/domain/dates'
import type { CalendarEvent, Id, Row } from '@/domain/types'
import { eventKey } from '@/features/calendar-panel/useEventContacts'
import { useNow } from '@/lib/useNow'
import { useCalendarConnection, useEventLinks } from './useCalendar'

/** How far ahead a row's meeting is marked in the grid (the side panel's week). */
export const UPCOMING_DAYS = 7

/**
 * Each of the member's own rows with a meeting in the next week: its earliest one, by guest email
 * or a confirmed link. Empty in another member's tab (a calendar is private) or when not connected.
 */
export function useUpcomingMeetings(
  memberId: Id,
  rows: readonly Row[],
): ReadonlyMap<Id, CalendarEvent> {
  const actor = useActor()
  const now = useNow()
  const today = todayIst(now)
  const { data: connection } = useCalendarConnection()
  const own = actor?.id === memberId && connection?.state === 'active'
  const range = useMemo(
    () => ({
      from: istInstant(today).toISOString(),
      to: istInstant(addDaysIso(today, UPCOMING_DAYS)).toISOString(),
    }),
    [today],
  )
  const { data: events } = useCalendarEvents(own ? memberId : undefined, range)
  const { data: links } = useEventLinks()

  return useMemo(() => {
    const result = new Map<Id, CalendarEvent>()
    if (!own || !events || events.length === 0) return result
    const upcoming = events
      .filter((e) => !e.uaRowId && Date.parse(e.end) > now.getTime())
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    const byEmail = new Map<string, CalendarEvent>()
    const byKey = new Map<string, CalendarEvent>()
    for (const event of upcoming) {
      if (!byKey.has(eventKey(event))) byKey.set(eventKey(event), event)
      for (const a of event.attendees) {
        const email = a.email.trim().toLowerCase()
        if (email && !a.self && !byEmail.has(email)) byEmail.set(email, event)
      }
    }
    for (const row of rows) {
      const email = row.email.trim().toLowerCase()
      const byGuest = email ? byEmail.get(email) : undefined
      if (byGuest) result.set(row.id, byGuest)
    }
    for (const link of links ?? []) {
      if (link.kind !== 'confirmed' || !link.googleEventId) continue
      const event = byKey.get(link.googleEventId)
      const current = result.get(link.rowId)
      if (event && (!current || Date.parse(event.start) < Date.parse(current.start))) {
        result.set(link.rowId, event)
      }
    }
    return result
  }, [own, events, links, rows, now])
}
