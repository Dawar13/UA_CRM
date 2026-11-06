/**
 * Database records to domain objects. Whole rows and sheets come back from the API functions
 * already in the domain's shape and are only validated here; members, tags and history entries
 * read straight from their tables are mapped from snake_case.
 */
import { z } from 'zod'
import {
  historyEntrySchema,
  memberSchema,
  rowSchema,
  sheetSchema,
  tagSchema,
} from '@/domain/schemas'
import type { HistoryEntry, Member, Row, Sheet, Tag } from '@/domain/types'
import type { RowLocation, SearchField, SearchResult, TrashItem } from '../repository'

/** Any timestamp Postgres writes, as Date.toISOString() writes it. */
export function iso(value: string): string
export function iso(value: string | null): string | null
export function iso(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

export interface MemberRecord {
  id: string
  slug: string
  name: string
  email: string
  position: number
  is_admin: boolean
  active: boolean
  created_at: string
}

export function toMember(r: MemberRecord): Member {
  return memberSchema.parse({
    id: r.id,
    slug: r.slug,
    name: r.name,
    email: r.email,
    position: r.position,
    isAdmin: r.is_admin,
    active: r.active,
    createdAt: iso(r.created_at),
  })
}

export interface TagRecord {
  id: string
  name: string
  colour: string
  created_by: string | null
  created_at: string
}

export function toTag(r: TagRecord): Tag {
  return tagSchema.parse({
    id: r.id,
    name: r.name,
    colour: r.colour,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  })
}

export interface HistoryRecord {
  id: string
  row_id: string
  kind: string
  source: string
  at: string
  fuzzy_date: string | null
  fuzzy_precision: string | null
  text: string
  member_id: string
  meta: Record<string, unknown> | null
}

export function toHistory(r: HistoryRecord): HistoryEntry {
  return historyEntrySchema.parse({
    id: r.id,
    rowId: r.row_id,
    kind: r.kind,
    source: r.source,
    at: iso(r.at),
    fuzzyDate: r.fuzzy_date === null ? null : { date: r.fuzzy_date, precision: r.fuzzy_precision },
    text: r.text,
    memberId: r.member_id,
    ...(r.meta ? { meta: r.meta } : {}),
  })
}

export const parseSheet = (value: unknown): Sheet => sheetSchema.parse(value)
export const parseSheets = (value: unknown): Sheet[] => z.array(sheetSchema).parse(value)
export const parseRow = (value: unknown): Row => rowSchema.parse(value)
export const parseRows = (value: unknown): Row[] => z.array(rowSchema).parse(value)
export const parseHistory = (value: unknown): HistoryEntry => historyEntrySchema.parse(value)
export const parseHistoryList = (value: unknown): HistoryEntry[] =>
  z.array(historyEntrySchema).parse(value)
export const parseMember = (value: unknown): Member => memberSchema.parse(value)

const locationSchema = z.object({ row: rowSchema, sheet: sheetSchema, member: memberSchema })
export const parseLocation = (value: unknown): RowLocation => locationSchema.parse(value)

const searchFields = [
  'name',
  'company',
  'title',
  'email',
  'phone',
  'tags',
  'notes',
  'connectsTo',
] as const satisfies readonly SearchField[]

const searchResultSchema = locationSchema.extend({
  score: z.number(),
  matchedField: z.enum(searchFields),
  matchedText: z.string(),
})
export const parseSearchResults = (value: unknown): SearchResult[] =>
  z.array(searchResultSchema).parse(value)

const trashItemSchema = z.object({
  kind: z.enum(['row', 'sheet', 'column']),
  id: z.string(),
  sheetId: z.string(),
  label: z.string(),
  deletedAt: z.string(),
})
export const parseTrash = (value: unknown): TrashItem[] => z.array(trashItemSchema).parse(value)
