/**
 * Validation of custom (per-sheet) field values against their column type. Pure.
 * Core fields are typed properties of the row and validated by `rowSchema`; this module checks
 * `row.fields` only.
 */
import { z } from 'zod'
import {
  fileRefSchema,
  fuzzyDateSchema,
  idSchema,
  isoDateTimeSchema,
  linkRefSchema,
  nextActionSchema,
  warmthSchema,
} from './schemas'
import type { ColumnDef, ColumnType, Row, Sheet } from './types'

const TYPE_MESSAGES: Record<ColumnType, string> = {
  text: 'Expected text',
  longText: 'Expected text',
  url: 'Expected a link as text',
  phone: 'Expected a phone number as text',
  email: 'Expected an email as text',
  number: 'Expected a number',
  currency: 'Expected an amount in rupees',
  date: 'Expected a date',
  dropdown: 'Expected one of the options',
  multiSelect: 'Expected a list of options',
  checkbox: 'Expected yes or no',
  personLink: 'Expected a link to a person',
  files: 'Expected a list of files',
  warmth: 'Expected warm, waiting or cold',
  stage: 'Expected a stage position',
  tags: 'Expected a list of tags',
  lastTouch: 'Expected a date and time',
  nextAction: 'Expected a next action',
}

function optionSchema(column: ColumnDef): z.ZodType<string> {
  const options = column.options ?? []
  return z.string().refine((value) => options.includes(value), {
    message: `Not an option of ${column.label}`,
  })
}

function baseSchema(column: ColumnDef): z.ZodType {
  switch (column.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'phone':
    case 'email':
      return z.string()
    case 'number':
    case 'currency':
      return z.number()
    case 'date':
      return fuzzyDateSchema
    case 'dropdown':
      return optionSchema(column)
    case 'multiSelect':
      return z.array(optionSchema(column))
    case 'checkbox':
      return z.boolean()
    case 'personLink':
      return linkRefSchema
    case 'files':
      return z.array(fileRefSchema)
    // System types are not stored in `fields`, but a schema keeps this total.
    case 'warmth':
      return warmthSchema
    case 'stage':
      return z.number().int().nonnegative()
    case 'tags':
      return z.array(idSchema)
    case 'lastTouch':
      return isoDateTimeSchema
    case 'nextAction':
      return nextActionSchema
  }
}

/**
 * Schema for one custom field value by column type: text/longText/url/phone/email strings,
 * number/currency numbers (currency in rupees), date = FuzzyDate, dropdown = one of the
 * options, multiSelect = array of options, checkbox boolean, personLink = LinkRef,
 * files = FileRef[]. null and undefined are always allowed (empty).
 */
export function fieldSchemaFor(column: ColumnDef): z.ZodType {
  return baseSchema(column).nullish()
}

/**
 * Checks `row.fields` against the sheet's non-system columns. Unknown keys (including keys of
 * system columns) are errors. Messages are sentence case.
 */
export function validateRowFields(
  row: Row,
  sheet: Sheet,
): { ok: boolean; errors: { key: string; message: string }[] } {
  const custom = new Map(sheet.columns.filter((c) => !c.system).map((c) => [c.key, c]))
  const errors: { key: string; message: string }[] = []
  for (const key of Object.keys(row.fields)) {
    if (!custom.has(key)) errors.push({ key, message: 'Unknown field' })
  }
  for (const column of custom.values()) {
    const result = fieldSchemaFor(column).safeParse(row.fields[column.key])
    if (!result.success) {
      const refined = result.error.issues.find((issue) => issue.code === 'custom')
      errors.push({ key: column.key, message: refined?.message ?? TYPE_MESSAGES[column.type] })
    }
  }
  return { ok: errors.length === 0, errors }
}
