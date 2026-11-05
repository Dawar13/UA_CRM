/**
 * Zod 4 schemas for every domain entity. Types in `types.ts` are inferred from these, so the
 * schema is the single definition. Pure: no React, no I/O.
 */
import { z } from 'zod'
import { tagColourNames } from '../styles/tokens'

export const idSchema = z.string().min(1)

/** ISO calendar date, "2026-11-05". */
export const isoDateSchema = z.iso.date()
/** ISO instant in UTC, "2026-11-05T04:30:00.000Z". */
export const isoDateTimeSchema = z.iso.datetime({ offset: true })

export const fuzzyPrecisions = ['day', 'early-month', 'mid-month', 'late-month', 'month'] as const
export const fuzzyPrecisionSchema = z.enum(fuzzyPrecisions)

/**
 * A date that may be exact ("12 Nov") or fuzzy ("mid Oct", "Oct 2026").
 * `date` is the sort key: early = 5th, mid = 15th, late = 25th, month = 1st.
 */
export const fuzzyDateSchema = z.object({
  date: isoDateSchema,
  precision: fuzzyPrecisionSchema,
})

export const warmthValues = ['warm', 'waiting', 'cold'] as const
export const warmthSchema = z.enum(warmthValues)

export const columnTypes = [
  'text',
  'longText',
  'number',
  'currency',
  'date',
  'dropdown',
  'multiSelect',
  'personLink',
  'url',
  'phone',
  'email',
  'checkbox',
  'files',
  // System types
  'warmth',
  'stage',
  'tags',
  'lastTouch',
  'nextAction',
] as const
export const columnTypeSchema = z.enum(columnTypes)

/** Core row properties a system column can point at. */
export const coreFieldKeys = [
  'name',
  'company',
  'title',
  'phone',
  'email',
  'linkedin',
  'links',
  'warmth',
  'stage',
  'tags',
  'lastTouch',
  'nextAction',
  'nextDate',
  'introducedBy',
  'connectsTo',
  'notes',
  'files',
] as const
export const coreFieldKeySchema = z.enum(coreFieldKeys)

export const columnDefSchema = z.object({
  id: idSchema,
  /** For system columns, the core field. For custom columns, the key in `row.fields`. */
  key: z.string().min(1),
  label: z.string().min(1),
  type: columnTypeSchema,
  /** System columns can be hidden but not deleted. */
  system: z.boolean(),
  /** Options for dropdown and multi-select columns, in display order. */
  options: z.array(z.string()).optional(),
  width: z.number().int().positive(),
  hidden: z.boolean(),
  position: z.number().int().nonnegative(),
})

export const stageDefSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
})

export const templateKeys = [
  'customers',
  'investors',
  'advisors',
  'connectors',
  'serviceProviders',
  'blank',
] as const
export const templateKeySchema = z.enum(templateKeys)

export const memberSchema = z.object({
  id: idSchema,
  /** URL segment, "dawar". */
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  email: z.email(),
  position: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
})

export const sheetSchema = z.object({
  id: idSchema,
  memberId: idSchema,
  /** URL segment, unique per member, "customers". */
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  template: templateKeySchema,
  position: z.number().int().nonnegative(),
  columns: z.array(columnDefSchema),
  /** Ordered stages; the last is the win. Empty when the sheet has no stages. */
  stages: z.array(stageDefSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
})

/** A link to another row, or free text for something not yet in the CRM. */
export const linkRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('row'), rowId: idSchema }),
  z.object({ kind: z.literal('text'), text: z.string().min(1) }),
])

export const nextActionSchema = z.object({
  text: z.string(),
  date: fuzzyDateSchema.nullable(),
})

export const lostInfoSchema = z.object({
  /** The stage the relationship stopped at. */
  stageIndex: z.number().int().nonnegative(),
  /** IST calendar date it was marked lost. */
  date: isoDateSchema,
})

export const fileRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  size: z.number().int().nonnegative(),
  mimeType: z.string(),
  url: z.string(),
})

export const rowSchema = z.object({
  id: idSchema,
  sheetId: idSchema,
  /** Owner of the sheet, denormalised so search can label "Member · Sheet" cheaply. */
  memberId: idSchema,
  position: z.number().int().nonnegative(),

  name: z.string().min(1),
  company: z.string(),
  title: z.string(),
  /** E.164 when it parses ("+919845012345"), otherwise as typed. Empty string when unset. */
  phone: z.string(),
  email: z.string(),
  linkedin: z.string(),
  links: z.array(z.string()),

  warmth: warmthSchema.nullable(),
  /** Index into `sheet.stages`; null when the sheet has no stages or none is reached yet. */
  stageIndex: z.number().int().nonnegative().nullable(),
  /**
   * IST calendar date each stage was reached, keyed by stage id. A key with `null` means the
   * stage was skipped (done, no date). A missing key means not reached.
   */
  stageDates: z.record(z.string(), isoDateSchema.nullable()),
  lost: lostInfoSchema.nullable(),

  tagIds: z.array(idSchema),
  nextAction: nextActionSchema.nullable(),
  introducedBy: linkRefSchema.nullable(),
  connectsTo: z.array(linkRefSchema),
  notes: z.string(),
  files: z.array(fileRefSchema),

  /** Custom per-sheet fields, keyed by `ColumnDef.key`. Validated against the column type. */
  fields: z.record(z.string(), z.unknown()),

  /** Most recent history instant. Derived and maintained by the repository, never typed. */
  lastTouchAt: isoDateTimeSchema.nullable(),

  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  createdBy: idSchema,
  updatedBy: idSchema,
  deletedAt: isoDateTimeSchema.nullable(),
})

export const tagSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  colour: z.enum(tagColourNames as [string, ...string[]]),
  createdAt: isoDateTimeSchema,
})

export const historyKinds = [
  'note',
  'call',
  'meeting',
  'whatsapp',
  'email',
  'stage',
  'warmth',
  'created',
  'imported',
] as const
export const historyKindSchema = z.enum(historyKinds)

export const historySources = ['manual', 'calendar', 'system'] as const
export const historySourceSchema = z.enum(historySources)

export const historyEntrySchema = z.object({
  id: idSchema,
  rowId: idSchema,
  kind: historyKindSchema,
  source: historySourceSchema,
  /** Sort instant (UTC). */
  at: isoDateTimeSchema,
  /** For entries dated vaguely (imports): what to display instead of `at`. */
  fuzzyDate: fuzzyDateSchema.nullable(),
  text: z.string(),
  /** The member who made the change or logged the touch. */
  memberId: idSchema,
  meta: z
    .object({
      fromStageIndex: z.number().int().nullable().optional(),
      toStageIndex: z.number().int().nullable().optional(),
      fromWarmth: warmthSchema.nullable().optional(),
      toWarmth: warmthSchema.nullable().optional(),
      lost: z.boolean().optional(),
      reopened: z.boolean().optional(),
      /** True when this entry records an undo. */
      undo: z.boolean().optional(),
      calendarEventId: idSchema.optional(),
    })
    .optional(),
})

export const calendarAttendeeSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
})

export const calendarEventSchema = z.object({
  id: idSchema,
  memberId: idSchema,
  title: z.string(),
  /** UTC instants. */
  start: isoDateTimeSchema,
  end: isoDateTimeSchema,
  attendees: z.array(calendarAttendeeSchema),
  location: z.string().optional(),
  source: z.enum(['sample', 'google']),
  externalId: z.string().optional(),
})
