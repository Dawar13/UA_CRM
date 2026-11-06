/**
 * The local IndexedDB database (Dexie 4). Only `LocalRepository` and the seed touch it; the UI
 * goes through the Repository and its hooks.
 *
 * Migrations: never edit a shipped version. Add `this.version(n + 1).stores({...})` with only
 * the tables whose indexes change, plus an `.upgrade(tx => ...)` when existing records need
 * reshaping. Dexie keeps every earlier version declaration to upgrade older databases.
 */
import { Dexie, type EntityTable } from 'dexie'
import type { CalendarEvent, HistoryEntry, Member, Row, Sheet, Tag } from '@/domain/types'

export const DB_NAME = 'ua-crm'

/** A pair of rows marked "different person" ("a|b", ids sorted). */
export interface NotDuplicateRecord {
  key: string
  ownerId: string
}

/** Small key/value records, such as `seedVersion`. */
export interface MetaRecord {
  key: string
  value: unknown
}

/** Version 1 indexes. The first entry of each schema is the primary key. */
export const schemaV1 = {
  members: 'id, slug, position',
  sheets: 'id, memberId, [memberId+position]',
  rows: 'id, sheetId, memberId, [sheetId+position], updatedAt',
  tags: 'id, name',
  history: 'id, rowId, at, [rowId+at]',
  calendarEvents: 'id, memberId, [memberId+start]',
  meta: 'key',
} as const

export class UaCrmDb extends Dexie {
  declare members: EntityTable<Member, 'id'>
  declare sheets: EntityTable<Sheet, 'id'>
  declare rows: EntityTable<Row, 'id'>
  declare tags: EntityTable<Tag, 'id'>
  declare history: EntityTable<HistoryEntry, 'id'>
  declare calendarEvents: EntityTable<CalendarEvent, 'id'>
  declare meta: EntityTable<MetaRecord, 'key'>
  declare notDuplicate: EntityTable<NotDuplicateRecord, 'key'>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores(schemaV1)
    // Phase 1 M1.6: pairs marked "different person".
    this.version(2).stores({ notDuplicate: 'key, ownerId' })
  }
}
