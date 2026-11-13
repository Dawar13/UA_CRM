import { useQuery } from '@tanstack/react-query'
import { useActor } from '@/auth/AuthContext'
import { useRepository } from '@/data/RepositoryContext'
import type { EventLink, RowLocation } from '@/data/repository'
import { matchEventToRows } from '@/domain/calendar/events'
import { calendarEventKey } from '@/domain/calendar/meetings'
import { suggestRowForTitle } from '@/domain/calendar/suggest'
import type { CalendarEvent } from '@/domain/types'
import { useEventLinks } from '@/features/calendar/useCalendar'
import { useAfterIdle } from './useAfterIdle'

export interface EventMatches {
  /** Contacts on each event: guests by email (any member's tab), confirmed links, the CRM's own. */
  contacts: Map<string, RowLocation[]>
  /** "Possibly <name>?": one of your own rows the title names (your own calendar only). */
  suggestions: Map<string, RowLocation>
}

/** The Google id of an event (sample events have none: their own id stands in). */
export const eventKey = calendarEventKey

function linksOf(event: CalendarEvent, links: readonly EventLink[]): EventLink[] {
  return links.filter(
    (l) =>
      (l.googleEventId !== null && l.googleEventId === eventKey(event)) ||
      (l.recurringEventId !== null && l.recurringEventId === event.recurringEventId),
  )
}

/**
 * Contacts matched to each event, across every member and sheet, keyed by event id. Matching
 * reads every row, so it waits until the browser is idle after the grid has rendered. `ownerId`
 * is whose calendar it is (default: yours); another member's gets no suggestions, since
 * answering one changes their links.
 */
export function useEventContacts(events: readonly CalendarEvent[] | undefined, ownerId?: string) {
  const repository = useRepository()
  const actor = useActor()
  const idle = useAfterIdle()
  const owner = ownerId ?? actor?.id
  const suggest = owner !== undefined && owner === actor?.id
  const { data: links } = useEventLinks(owner)
  const ids = (events ?? []).map((e) => e.id).join(',')
  const linkIds = (links ?? []).map((l) => `${l.kind}:${l.rowId}:${l.googleEventId}`).join(',')
  return useQuery({
    queryKey: ['eventContacts', ids, linkIds, owner ?? '', suggest],
    enabled: idle && events !== undefined,
    queryFn: async (): Promise<EventMatches> => {
      const members = await repository.listMembers()
      const locations: RowLocation[] = []
      for (const member of members) {
        for (const sheet of await repository.listSheets(member.id)) {
          for (const row of await repository.listRows(sheet.id))
            locations.push({ row, sheet, member })
        }
      }
      const byRowId = new Map(locations.map((l) => [l.row.id, l]))
      const withEmail = locations.filter((l) => l.row.email).map((l) => l.row)
      const own = locations.filter((l) => l.member.id === actor?.id)
      const ownRows = own.map((l) => ({ id: l.row.id, name: l.row.name, company: l.row.company }))
      const contacts = new Map<string, RowLocation[]>()
      const suggestions = new Map<string, RowLocation>()
      for (const event of events ?? []) {
        const mine = linksOf(event, links ?? [])
        const dismissed = new Set(mine.filter((l) => l.kind === 'dismissed').map((l) => l.rowId))
        const rowIds = [
          ...matchEventToRows(event, withEmail).map((r) => r.id),
          ...mine.filter((l) => l.kind === 'confirmed').map((l) => l.rowId),
          ...(event.uaRowId ? [event.uaRowId] : []),
        ]
        const matched = [...new Set(rowIds)]
          .map((id) => byRowId.get(id))
          .filter((l): l is RowLocation => l !== undefined)
        if (matched.length > 0) {
          contacts.set(event.id, matched)
          continue
        }
        if (!suggest) continue
        const suggested = suggestRowForTitle(event.title, ownRows)
        const location = suggested ? byRowId.get(suggested) : undefined
        if (location && !dismissed.has(location.row.id)) suggestions.set(event.id, location)
      }
      return { contacts, suggestions }
    },
  })
}
