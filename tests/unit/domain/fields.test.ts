import { describe, expect, it } from 'vitest'
import { fieldSchemaFor, validateRowFields } from '@/domain/fields'
import { columnTypes } from '@/domain/schemas'
import type { ColumnDef, ColumnType } from '@/domain/types'
import { makeRow, makeSheet } from './_fixtures'

function column(type: ColumnType, options?: string[]): ColumnDef {
  return {
    id: `c-${type}`,
    key: type,
    label: `My ${type}`,
    type,
    system: false,
    width: 120,
    hidden: false,
    position: 0,
    ...(options ? { options } : {}),
  }
}

function accepts(type: ColumnType, value: unknown, options?: string[]): boolean {
  return fieldSchemaFor(column(type, options)).safeParse(value).success
}

const fileRef = { id: 'f1', name: 'quote.pdf', size: 1024, mimeType: 'application/pdf', url: 'x' }

describe('fieldSchemaFor', () => {
  it('always allows null and undefined', () => {
    for (const type of columnTypes) {
      expect(accepts(type, null), type).toBe(true)
      expect(accepts(type, undefined), type).toBe(true)
    }
  })

  it('validates string types', () => {
    for (const type of ['text', 'longText', 'url', 'phone', 'email'] as const) {
      expect(accepts(type, 'hello'), type).toBe(true)
      expect(accepts(type, ''), type).toBe(true)
      expect(accepts(type, 42), type).toBe(false)
    }
  })

  it('validates numbers and currency in rupees', () => {
    expect(accepts('number', 12.5)).toBe(true)
    expect(accepts('currency', 25_00_000)).toBe(true)
    expect(accepts('currency', '25 L')).toBe(false)
    expect(accepts('number', Number.NaN)).toBe(false)
    expect(accepts('number', Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('validates fuzzy dates', () => {
    expect(accepts('date', { date: '2026-10-15', precision: 'mid-month' })).toBe(true)
    expect(accepts('date', { date: '2026-10-15', precision: 'sometime' })).toBe(false)
    expect(accepts('date', '2026-10-15')).toBe(false)
  })

  it('validates dropdown and multi-select options', () => {
    const options = ['CA', 'Lawyer']
    expect(accepts('dropdown', 'CA', options)).toBe(true)
    expect(accepts('dropdown', 'Visa', options)).toBe(false)
    expect(accepts('dropdown', 'CA')).toBe(false)
    expect(accepts('multiSelect', ['CA', 'Lawyer'], options)).toBe(true)
    expect(accepts('multiSelect', [], options)).toBe(true)
    expect(accepts('multiSelect', ['CA', 'Visa'], options)).toBe(false)
    expect(accepts('multiSelect', 'CA', options)).toBe(false)
  })

  it('validates checkboxes, person links and files', () => {
    expect(accepts('checkbox', true)).toBe(true)
    expect(accepts('checkbox', 'yes')).toBe(false)
    expect(accepts('personLink', { kind: 'row', rowId: 'r1' })).toBe(true)
    expect(accepts('personLink', { kind: 'text', text: 'Tata Steel' })).toBe(true)
    expect(accepts('personLink', { kind: 'row' })).toBe(false)
    expect(accepts('files', [fileRef])).toBe(true)
    expect(accepts('files', [{ name: 'x' }])).toBe(false)
  })

  it('has schemas for system types too', () => {
    expect(accepts('warmth', 'warm')).toBe(true)
    expect(accepts('warmth', 'hot')).toBe(false)
    expect(accepts('stage', 3)).toBe(true)
    expect(accepts('stage', -1)).toBe(false)
    expect(accepts('tags', ['t1'])).toBe(true)
    expect(accepts('lastTouch', '2026-11-05T04:30:00.000Z')).toBe(true)
    expect(accepts('lastTouch', 'yesterday')).toBe(false)
    expect(accepts('nextAction', { text: 'Send ROI note', date: null })).toBe(true)
    expect(accepts('nextAction', 'Send ROI note')).toBe(false)
  })
})

describe('validateRowFields', () => {
  const customers = makeSheet('customers')

  it('accepts valid custom fields, including empty ones', () => {
    const row = makeRow({
      fields: {
        plantLocation: 'Hosur',
        archetype: 'Foundries and forging shops',
        turnoverBand: 'Medium · ₹100–500 Cr',
        roleInDeal: 'Decision maker',
        pain: 'Unplanned downtime on 4 heading lines',
        wedgeAgent: 'Maintenance',
        ticketEstimate: 25_00_000,
      },
    })
    expect(validateRowFields(row, customers)).toEqual({ ok: true, errors: [] })
    expect(validateRowFields(makeRow({ fields: { pain: null } }), customers).ok).toBe(true)
    expect(validateRowFields(makeRow(), customers).ok).toBe(true)
  })

  it('reports wrong types with sentence-case messages', () => {
    const row = makeRow({
      fields: { ticketEstimate: '25 L', archetype: 'Shipyards', plantLocation: 7 },
    })
    const result = validateRowFields(row, customers)
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      { key: 'plantLocation', message: 'Expected text' },
      { key: 'archetype', message: 'Not an option of Archetype' },
      { key: 'ticketEstimate', message: 'Expected an amount in rupees' },
    ])
  })

  it('reports unknown keys, including system column keys', () => {
    const result = validateRowFields(makeRow({ fields: { colour: 'blue', name: 'X' } }), customers)
    expect(result.errors).toEqual([
      { key: 'colour', message: 'Unknown field' },
      { key: 'name', message: 'Unknown field' },
    ])
  })

  it('checks each template against its own columns', () => {
    const providers = makeSheet('serviceProviders')
    const ok = makeRow({
      fields: {
        service: 'Lawyer',
        quote: 75_000,
        docsShared: true,
        deadline: { date: '2026-11-25', precision: 'late-month' },
      },
    })
    expect(validateRowFields(ok, providers).ok).toBe(true)
    const bad = makeRow({ fields: { docsShared: 'yes', deadline: 'late Nov' } })
    expect(validateRowFields(bad, providers).errors).toEqual([
      { key: 'docsShared', message: 'Expected yes or no' },
      { key: 'deadline', message: 'Expected a date' },
    ])
    expect(validateRowFields(ok, makeSheet('blank')).errors).toHaveLength(4)
  })
})
