/** TanStack Query hooks over the Repository reads. */
import { keepPreviousData, skipToken, type UseQueryResult, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { CalendarEvent, HistoryEntry, Id, Member, Row, Sheet, Tag } from '@/domain/types'
import { useRepository } from '../RepositoryContext'
import type { DateRange, RowLocation, SearchResult } from '../repository'
import { queryKeys } from './keys'

// Query data cannot be undefined in TanStack Query, so "missing" is cached as null and mapped
// back to undefined for callers.
const nullToUndefined = <T>(value: T | null): T | undefined => value ?? undefined

export function useMembers(): UseQueryResult<Member[]> {
  const repo = useRepository()
  return useQuery({ queryKey: queryKeys.members(), queryFn: () => repo.listMembers() })
}

export function useSheets(memberId: Id | undefined): UseQueryResult<Sheet[]> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.sheets(memberId ?? ''),
    queryFn: memberId ? () => repo.listSheets(memberId) : skipToken,
  })
}

export function useRowCounts(memberId: Id | undefined): UseQueryResult<Record<Id, number>> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.rowCounts(memberId ?? ''),
    queryFn: memberId ? () => repo.countRows(memberId) : skipToken,
  })
}

export function useRows(sheetId: Id | undefined): UseQueryResult<Row[]> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.rows(sheetId ?? ''),
    queryFn: sheetId ? () => repo.listRows(sheetId) : skipToken,
  })
}

export function useRow(rowId: Id | undefined): UseQueryResult<Row | undefined> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.row(rowId ?? ''),
    queryFn: rowId ? async () => (await repo.getRow(rowId)) ?? null : skipToken,
    select: nullToUndefined<Row>,
  })
}

export function useRowLocation(rowId: Id | undefined): UseQueryResult<RowLocation | undefined> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.rowLocation(rowId ?? ''),
    queryFn: rowId ? async () => (await repo.getRowLocation(rowId)) ?? null : skipToken,
    select: nullToUndefined<RowLocation>,
  })
}

export function useTags(): UseQueryResult<Tag[]> {
  const repo = useRepository()
  return useQuery({ queryKey: queryKeys.tags(), queryFn: () => repo.listTags() })
}

/** Tags by id, for chips. Empty until the tags load. */
export function useTagMap(): Map<Id, Tag> {
  const { data } = useTags()
  return useMemo(() => new Map((data ?? []).map((tag) => [tag.id, tag])), [data])
}

/** Rows elsewhere that name this row as the same person. */
export function useSamePersonOf(rowId: Id | undefined): UseQueryResult<Id[]> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.samePersonOf(rowId ?? ''),
    queryFn: rowId ? () => repo.listSamePersonOf(rowId) : skipToken,
  })
}

/** Newest first. */
export function useHistory(rowId: Id | undefined): UseQueryResult<HistoryEntry[]> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.history(rowId ?? ''),
    queryFn: rowId ? () => repo.listHistory(rowId) : skipToken,
  })
}

/**
 * Search across every member and sheet. Disabled for a blank query (data stays undefined and
 * `isLoading` false); while typing, the previous results stay on screen until the new ones land.
 */
export function useSearch(query: string): UseQueryResult<SearchResult[]> {
  const repo = useRepository()
  const trimmed = query.trim()
  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: trimmed ? () => repo.search(trimmed) : skipToken,
    placeholderData: trimmed ? keepPreviousData : undefined,
  })
}

export function useMemberRows(memberId: Id | undefined): UseQueryResult<Row[]> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.memberRows(memberId ?? ''),
    queryFn: memberId ? () => repo.listMemberRows(memberId) : skipToken,
  })
}

export function useMemberHistory(
  memberId: Id | undefined,
  range: DateRange,
): UseQueryResult<HistoryEntry[]> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.memberHistory(memberId ?? '', range.from, range.to),
    queryFn: memberId ? () => repo.listMemberHistory(memberId, range) : skipToken,
  })
}

export function useCalendarEvents(
  memberId: Id | undefined,
  range: DateRange,
): UseQueryResult<CalendarEvent[]> {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.events(memberId ?? '', range.from, range.to),
    queryFn: memberId ? () => repo.listCalendarEvents(memberId, range) : skipToken,
  })
}
