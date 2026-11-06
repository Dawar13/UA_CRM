/** TanStack Query keys for every repository read. */
import type { Id } from '@/domain/types'

export const queryKeys = {
  members: () => ['members'] as const,
  sheets: (memberId: Id) => ['sheets', memberId] as const,
  rowCounts: (memberId: Id) => ['rowCounts', memberId] as const,
  rows: (sheetId: Id) => ['rows', sheetId] as const,
  row: (rowId: Id) => ['row', rowId] as const,
  rowLocation: (rowId: Id) => ['rowLocation', rowId] as const,
  tags: () => ['tags'] as const,
  history: (rowId: Id) => ['history', rowId] as const,
  trash: (memberId: Id) => ['trash', memberId] as const,
  samePersonOf: (rowId: Id) => ['samePersonOf', rowId] as const,
  search: (query: string) => ['search', query] as const,
  events: (memberId: Id, from: string, to: string) => ['events', memberId, from, to] as const,
  memberRows: (memberId: Id) => ['memberRows', memberId] as const,
  memberHistory: (memberId: Id, from: string, to: string) =>
    ['memberHistory', memberId, from, to] as const,
}

/** Shared by every row mutation, so concurrent ones invalidate only when the last settles. */
export const rowMutationKey = ['rowMutation'] as const
