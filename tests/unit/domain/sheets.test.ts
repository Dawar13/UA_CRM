import { describe, expect, it } from 'vitest'
import { cleanMemberEmail, cleanMemberName, MemberRuleError } from '@/domain/members'
import {
  addColumn,
  columnKeyFor,
  deleteColumn,
  liveColumns,
  newSheet,
  renameSheet,
  renameStages,
  reorderByIds,
  reorderColumns,
  restoreColumn,
  SheetRuleError,
  slugify,
  uniqueSlug,
  updateColumn,
  valuesThatNoLongerFit,
} from '@/domain/sheets'
import { cleanTagName, TagRuleError } from '@/domain/tags'
import type { Sheet } from '@/domain/types'

const NOW = new Date('2026-11-05T10:00:00+05:30')
const LATER = new Date('2026-11-05T11:00:00+05:30')
let n = 0
const ids = () => ({ sheetId: `s-${++n}`, newId: () => `c-${++n}` })

function customers(): Sheet {
  return newSheet('m-dawar', { name: 'Customers', template: 'customers' }, [], ids(), NOW)
}

function column(sheet: Sheet, key: string) {
  const found = sheet.columns.find((c) => c.key === key)
  if (!found) throw new Error(`No column ${key}`)
  return found
}

describe('slugs', () => {
  it('slugify makes a URL segment and never an empty one', () => {
    expect(slugify('Service providers')).toBe('service-providers')
    expect(slugify('  R&D / Labs ')).toBe('r-and-d-labs')
    expect(slugify('Café')).toBe('cafe')
    expect(slugify('—')).toBe('sheet')
  })

  it('uniqueSlug adds the first free number', () => {
    expect(uniqueSlug('customers', [])).toBe('customers')
    expect(uniqueSlug('customers', ['customers', 'customers-2'])).toBe('customers-3')
  })
})

describe('newSheet and renameSheet', () => {
  it('builds the template, places the sheet last and keeps the slug unique', () => {
    const existing = [
      { slug: 'customers', position: 0 },
      { slug: 'investors', position: 4 },
    ]
    const sheet = newSheet(
      'm-dawar',
      { name: '  Customers ', template: 'customers' },
      existing,
      ids(),
      NOW,
    )
    expect(sheet).toMatchObject({
      memberId: 'm-dawar',
      name: 'Customers',
      slug: 'customers-2',
      position: 5,
      deletedAt: null,
      createdAt: NOW.toISOString(),
    })
    expect(sheet.stages).toHaveLength(7)
    expect(() => newSheet('m', { name: ' ', template: 'blank' }, [], ids(), NOW)).toThrow(
      'A sheet needs a name',
    )
  })

  it('renaming follows the name with the slug, ignoring the sheet itself', () => {
    const sheet = customers()
    const others = [
      { id: sheet.id, slug: sheet.slug },
      { id: 'x', slug: 'plants' },
    ]
    expect(renameSheet(sheet, 'Customers', others, LATER).slug).toBe('customers')
    expect(renameSheet(sheet, 'Plants', others, LATER)).toMatchObject({
      name: 'Plants',
      slug: 'plants-2',
      updatedAt: LATER.toISOString(),
    })
  })
})

describe('reorderByIds', () => {
  it('numbers the listed items first and keeps the rest in their order after', () => {
    const items = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
      { id: 'd', position: 3 },
    ]
    expect(reorderByIds(items, ['c', 'a']).map((i) => [i.id, i.position])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
      ['d', 3],
    ])
  })
})

describe('columns', () => {
  it('columnKeyFor makes a camelCase key that no column ever used', () => {
    const sheet = customers()
    expect(columnKeyFor('Board seat?', sheet)).toBe('boardSeat')
    expect(columnKeyFor('Plant location', sheet)).toBe('plantLocation2')
    expect(columnKeyFor('2026 target', sheet)).toBe('field2026Target')
    expect(columnKeyFor('!!!', sheet)).toBe('field')
  })

  it('addColumn appends a custom column with tidy options', () => {
    const sheet = addColumn(
      customers(),
      { label: 'Plant size', type: 'dropdown', options: [' Small ', 'small', '', 'Large'] },
      'c-new',
      LATER,
    )
    expect(column(sheet, 'plantSize')).toMatchObject({
      id: 'c-new',
      system: false,
      hidden: false,
      width: 160,
      options: ['Small', 'Large'],
      position: sheet.columns.length - 1,
    })
    expect(
      column(
        addColumn(customers(), { label: 'Notes 2', type: 'text', width: 90 }, 'c', NOW),
        'notes2',
      ),
    ).not.toHaveProperty('options')
    expect(() => addColumn(customers(), { label: 'W', type: 'warmth' }, 'c', NOW)).toThrow(
      SheetRuleError,
    )
    expect(() => addColumn(customers(), { label: ' ', type: 'text' }, 'c', NOW)).toThrow(
      'A column needs a name',
    )
  })

  it('updateColumn renames, resizes, hides and retypes custom columns', () => {
    const sheet = customers()
    const pain = column(sheet, 'pain')
    let next = updateColumn(
      sheet,
      pain.id,
      { label: 'Pain point', width: 300, hidden: true },
      LATER,
    )
    expect(column(next, 'pain')).toMatchObject({ label: 'Pain point', width: 300, hidden: true })
    next = updateColumn(next, pain.id, { type: 'dropdown' }, LATER)
    expect(column(next, 'pain')).toMatchObject({ type: 'dropdown', options: [] })
    next = updateColumn(next, pain.id, { options: ['High', 'Low'] }, LATER)
    expect(column(next, 'pain').options).toEqual(['High', 'Low'])
    next = updateColumn(next, pain.id, { type: 'text' }, LATER)
    expect(column(next, 'pain')).not.toHaveProperty('options')
    // Wrapping is a column setting too (D-049).
    next = updateColumn(next, pain.id, { wrap: true }, LATER)
    expect(column(next, 'pain').wrap).toBe(true)
    next = updateColumn(next, pain.id, { wrap: false }, LATER)
    expect(column(next, 'pain').wrap).toBe(false)
  })

  it('updateColumn keeps the rules for system columns, sizes and options', () => {
    const sheet = customers()
    const name = column(sheet, 'name')
    const company = column(sheet, 'company')
    const pain = column(sheet, 'pain')
    expect(
      updateColumn(sheet, company.id, { label: 'Plant', hidden: true }, LATER).columns,
    ).toContainEqual(expect.objectContaining({ key: 'company', label: 'Plant', hidden: true }))
    expect(() => updateColumn(sheet, name.id, { hidden: true }, LATER)).toThrow(
      'The Name column is always shown',
    )
    expect(() => updateColumn(sheet, company.id, { type: 'number' }, LATER)).toThrow(
      "A system column's type cannot change",
    )
    expect(() => updateColumn(sheet, pain.id, { type: 'stage' }, LATER)).toThrow(SheetRuleError)
    expect(() => updateColumn(sheet, pain.id, { width: 20 }, LATER)).toThrow(
      'A column is at least 48 pixels wide',
    )
    expect(() => updateColumn(sheet, pain.id, { options: ['A'] }, LATER)).toThrow(
      'Only dropdown and multi-select columns have options',
    )
    expect(() => updateColumn(sheet, 'missing', { hidden: true }, LATER)).toThrow(
      'That column is not on this sheet',
    )
    expect(updateColumn(sheet, pain.id, { type: 'longText' }, LATER).columns).toContainEqual(pain)
  })

  it('valuesThatNoLongerFit counts values a changed column would refuse', () => {
    const sheet = customers()
    const pain = column(sheet, 'pain')
    const asNumber = updateColumn(sheet, pain.id, { type: 'number' }, LATER)
    const rows = [{ fields: { pain: 'Downtime' } }, { fields: { pain: null } }, { fields: {} }]
    expect(valuesThatNoLongerFit(asNumber, pain.id, rows)).toBe(1)
    expect(valuesThatNoLongerFit(sheet, column(sheet, 'name').id, rows)).toBe(0)
    expect(valuesThatNoLongerFit(sheet, 'missing', rows)).toBe(0)
  })

  it('deleteColumn trashes custom columns only, and restoreColumn brings them back last', () => {
    const sheet = customers()
    const pain = column(sheet, 'pain')
    const deleted = deleteColumn(sheet, pain.id, LATER)
    expect(column(deleted, 'pain').deletedAt).toBe(LATER.toISOString())
    expect(liveColumns(deleted).some((c) => c.key === 'pain')).toBe(false)
    expect(() => deleteColumn(sheet, column(sheet, 'company').id, LATER)).toThrow(
      'System columns can be hidden but not deleted',
    )
    expect(() => deleteColumn(deleted, pain.id, LATER)).toThrow('That column is not on this sheet')
    const restored = restoreColumn(deleted, pain.id, LATER)
    expect(column(restored, 'pain')).toMatchObject({
      deletedAt: null,
      position: sheet.columns.length,
    })
    expect(() => restoreColumn(sheet, pain.id, LATER)).toThrow('That column is not in Trash')
  })

  it('reorderColumns orders live columns and keeps deleted ones after them', () => {
    const original = customers()
    const sheet = deleteColumn(original, column(original, 'pain').id, LATER)
    const trashed = column(sheet, 'pain')
    const live = liveColumns(sheet)
    const reversed = live.map((c) => c.id).reverse()
    const next = reorderColumns(sheet, reversed, LATER)
    expect(liveColumns(next).map((c) => c.id)).toEqual(reversed)
    expect(column(next, 'pain')).toMatchObject({ id: trashed.id, position: live.length })
  })
})

describe('renameStages', () => {
  it('renames in place and refuses any other change', () => {
    const sheet = customers()
    const renamed = renameStages(
      sheet,
      sheet.stages.map((s, i) => (i === 0 ? { ...s, name: ' Spotted ' } : s)),
      LATER,
    )
    expect(renamed.stages[0]?.name).toBe('Spotted')
    expect(() => renameStages(sheet, sheet.stages.slice(1), LATER)).toThrow(
      'Stages can only be renamed here',
    )
    expect(() =>
      renameStages(
        sheet,
        sheet.stages.map((s, i) => (i === 0 ? { ...s, name: '' } : s)),
        LATER,
      ),
    ).toThrow('A stage needs a name')
  })
})

describe('member and tag names', () => {
  it('cleans member names and emails', () => {
    expect(cleanMemberName('  Asha   Raman ')).toBe('Asha Raman')
    expect(() => cleanMemberName(' ')).toThrow(MemberRuleError)
    expect(cleanMemberEmail(' Asha@Example.TEST ')).toBe('asha@example.test')
    expect(() => cleanMemberEmail('asha')).toThrow("That email address doesn't look right")
  })

  it('cleans tag names', () => {
    expect(cleanTagName('  #pilot   candidate ')).toBe('pilot candidate')
    expect(() => cleanTagName('##')).toThrow(TagRuleError)
  })
})
