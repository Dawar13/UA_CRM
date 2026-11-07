import { describe, expect, it } from 'vitest'
import {
  clampRowHeight,
  cleanRowPatch,
  newRow,
  patchRow,
  RowValidationError,
  rowIssues,
} from '@/domain/rows'
import { buildSheetSchema } from '@/domain/templates'
import type { DomainContext, Row, Sheet } from '@/domain/types'

const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const ctx: DomainContext = { now: NOW, actorId: 'm-dawar', newId: () => `h-${++n}` }

function makeSheet(template: Sheet['template'] = 'customers'): Sheet {
  const { columns, stages } = buildSheetSchema(template, () => `id-${++n}`)
  return {
    id: 's1',
    memberId: 'm-dawar',
    slug: template,
    name: 'Customers',
    template,
    position: 0,
    columns,
    stages,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    deletedAt: null,
  }
}

function created(sheet: Sheet, values: Parameters<typeof newRow>[1]): Row {
  return newRow(sheet, values, { id: 'r1', position: 3 }, ctx).row
}

describe('cleanRowPatch', () => {
  it('trims text, stores parsed phones as E.164 and keeps unparsed ones as typed', () => {
    expect(
      cleanRowPatch({
        name: '  Rohan  ',
        company: ' HPF ',
        title: ' Head ',
        email: ' r@hpf.in ',
        linkedin: ' in/rohan ',
        phone: '098450 12345',
      }),
    ).toEqual({
      name: 'Rohan',
      company: 'HPF',
      title: 'Head',
      email: 'r@hpf.in',
      linkedin: 'in/rohan',
      phone: '+919845012345',
    })
    expect(cleanRowPatch({ phone: ' ext 12 ' }).phone).toBe('ext 12')
  })

  it('drops empty and repeated links, tags and connections', () => {
    expect(
      cleanRowPatch({
        links: [' a.example ', '', 'a.example', 'b.example'],
        tagIds: ['t1', 't1', 't2'],
        connectsTo: [
          { kind: 'text', text: ' Tata Steel ' },
          { kind: 'text', text: 'Tata Steel' },
          { kind: 'text', text: '  ' },
          { kind: 'row', rowId: 'r2' },
          { kind: 'row', rowId: 'r2' },
        ],
      }),
    ).toEqual({
      links: ['a.example', 'b.example'],
      tagIds: ['t1', 't2'],
      connectsTo: [
        { kind: 'text', text: 'Tata Steel' },
        { kind: 'row', rowId: 'r2' },
      ],
    })
  })

  it('turns an empty next action or introducer into none', () => {
    expect(cleanRowPatch({ nextAction: { text: '  ', date: null } }).nextAction).toBeNull()
    expect(
      cleanRowPatch({
        nextAction: { text: ' Send ROI ', date: { date: '2026-11-06', precision: 'day' } },
      }).nextAction,
    ).toEqual({ text: 'Send ROI', date: { date: '2026-11-06', precision: 'day' } })
    expect(cleanRowPatch({ introducedBy: { kind: 'text', text: ' ' } }).introducedBy).toBeNull()
    expect(
      cleanRowPatch({ introducedBy: { kind: 'text', text: ' Krithik ' } }).introducedBy,
    ).toEqual({ kind: 'text', text: 'Krithik' })
    expect(cleanRowPatch({ introducedBy: { kind: 'row', rowId: 'r9' } }).introducedBy).toEqual({
      kind: 'row',
      rowId: 'r9',
    })
  })
})

describe('newRow', () => {
  it('fills defaults, takes the owner from the sheet and logs "Added to"', () => {
    const sheet = makeSheet()
    const change = newRow(sheet, { name: 'Rohan Mehta' }, { id: 'r1', position: 3 }, ctx)
    expect(change.row).toMatchObject({
      id: 'r1',
      sheetId: 's1',
      memberId: 'm-dawar',
      position: 3,
      name: 'Rohan Mehta',
      warmth: null,
      stageIndex: null,
      stageDates: {},
      tagIds: [],
      lastTouchAt: NOW.toISOString(),
      createdBy: 'm-dawar',
      deletedAt: null,
    })
    expect(change.history).toMatchObject({
      rowId: 'r1',
      kind: 'created',
      source: 'system',
      text: 'Added to Customers',
      memberId: 'm-dawar',
    })
  })

  it('stamps a starting stage today and counts earlier stages as done without a date', () => {
    const sheet = makeSheet()
    const row = created(sheet, { name: 'R', stageIndex: 1, warmth: 'waiting' })
    expect(row.warmth).toBe('waiting')
    expect(row.stageDates).toEqual({
      [sheet.stages[0]?.id ?? '']: null,
      [sheet.stages[1]?.id ?? '']: '2026-11-05',
    })
  })

  it('refuses rows that cannot be saved', () => {
    expect(() => created(makeSheet(), { name: '  ' })).toThrow(RowValidationError)
    expect(() => created(makeSheet(), { name: 'R', stageIndex: 7 })).toThrow(
      'That stage is not on this sheet',
    )
    expect(() => created(makeSheet('connectors'), { name: 'R', stageIndex: 0 })).toThrow(
      'This sheet has no stages',
    )
  })
})

describe('rowIssues', () => {
  it('lists every problem with a key and sentence-case words', () => {
    const sheet = makeSheet()
    const row: Row = {
      ...created(sheet, { name: 'R' }),
      name: '',
      stageIndex: 1.5,
      introducedBy: { kind: 'row', rowId: 'r1' },
      connectsTo: [{ kind: 'row', rowId: 'r1' }],
      fields: { ticketEstimate: 'lots', nope: 1 },
    }
    expect(rowIssues(row, sheet).map((i) => i.key)).toEqual([
      'name',
      'stage',
      'introducedBy',
      'connectsTo',
      'nope',
      'ticketEstimate',
    ])
    const error = new RowValidationError(rowIssues(row, sheet))
    expect(error.message.startsWith('A row needs a name. That stage is not on this sheet')).toBe(
      true,
    )
  })
})

describe('patchRow', () => {
  it('applies editable keys only, stamps the editor and validates', () => {
    const sheet = makeSheet()
    const row = created(sheet, { name: 'R', warmth: 'warm' })
    const later = { ...ctx, now: new Date('2026-11-05T11:00:00+05:30'), actorId: 'm-dhruv' }
    const next = patchRow(
      row,
      sheet,
      {
        title: ' Plant Head ',
        ...({ warmth: 'cold', memberId: 'm-x', lastTouchAt: null } as object),
      },
      later,
    )
    expect(next).toMatchObject({
      title: 'Plant Head',
      warmth: 'warm',
      memberId: 'm-dawar',
      lastTouchAt: row.lastTouchAt,
      updatedBy: 'm-dhruv',
      updatedAt: later.now.toISOString(),
    })
    expect(() => patchRow(row, sheet, { name: '' }, ctx)).toThrow('A row needs a name')
    expect(() => patchRow(row, sheet, { fields: { plantLocation: 4 } }, ctx)).toThrow(
      RowValidationError,
    )
  })
})

describe('cell formatting (D-049)', () => {
  it('keeps a dragged row height in range and stores the default as null', () => {
    expect(clampRowHeight(72)).toBe(72)
    expect(clampRowHeight(72.6)).toBe(73)
    expect(clampRowHeight(10)).toBeNull()
    expect(clampRowHeight(36)).toBeNull()
    expect(clampRowHeight(999)).toBe(240)
    expect(clampRowHeight(null)).toBeNull()
    expect(clampRowHeight(Number.NaN)).toBeNull()
  })

  it('patches fill colours and height like any cell edit', () => {
    const sheet = makeSheet()
    const row = created(sheet, { name: 'R' })
    const next = patchRow(row, sheet, { cellColours: { company: 'teal' }, height: 96 }, ctx)
    expect(next.cellColours).toEqual({ company: 'teal' })
    expect(next.height).toBe(96)
    const back = patchRow(next, sheet, { cellColours: {}, height: null }, ctx)
    expect(back.cellColours).toEqual({})
    expect(back.height).toBeNull()
  })

  it('drops cells without a colour', () => {
    expect(
      cleanRowPatch({ cellColours: { a: 'teal', b: undefined as unknown as 'teal' } }).cellColours,
    ).toEqual({ a: 'teal' })
  })
})
