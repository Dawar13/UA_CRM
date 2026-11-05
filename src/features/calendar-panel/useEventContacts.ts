import { useQuery } from '@tanstack/react-query'
import { useRepository } from '@/data/RepositoryContext'
import type { RowLocation } from '@/data/repository'
import { matchEventToRows } from '@/domain/calendar'
import type { CalendarEvent } from '@/domain/types'
import { useAfterIdle } from './useAfterIdle'

/**
 * Contacts matched to each event by attendee email (Phase 0: exact email only), across every
 * member and sheet. Keyed by event id. Matching reads every row, so it waits until the browser is
 * idle after the grid has rendered.
 */
export function useEventContacts(events: readonly CalendarEvent[] | undefined) {
  const repository = useRepository()
  const idle = useAfterIdle()
  const ids = (events ?? []).map((e) => e.id).join(',')
  return useQuery({
    queryKey: ['eventContacts', ids],
    enabled: idle && events !== undefined,
    queryFn: async (): Promise<Map<string, RowLocation[]>> => {
      const members = await repository.listMembers()
      const locations: RowLocation[] = []
      for (const member of members) {
        for (const sheet of await repository.listSheets(member.id)) {
          for (const row of await repository.listRows(sheet.id)) {
            if (row.email) locations.push({ row, sheet, member })
          }
        }
      }
      const byRowId = new Map(locations.map((l) => [l.row.id, l]))
      const rows = locations.map((l) => l.row)
      const result = new Map<string, RowLocation[]>()
      for (const event of events ?? []) {
        const matched = matchEventToRows(event, rows)
          .map((r) => byRowId.get(r.id))
          .filter((l): l is RowLocation => l !== undefined)
        if (matched.length > 0) result.set(event.id, matched)
      }
      return result
    },
  })
}
