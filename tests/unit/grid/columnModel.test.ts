import { describe, expect, it } from 'vitest'
import { buildSheetSchema } from '@/domain/templates'
import type { ColumnDef, Row, Sheet, Tag } from '@/domain/types'
import {
  columnAlign,
  compareSortValues,
  linkLabel,
  type SortContext,
  sortValue,
  visibleColumns,
} from '@/features/grid/columnModel'

let n = 0
const newId = () => `id-${++n}`

function makeSheet(template: Sheet['template'] = 'customers'): Sheet {
  const { columns, stages } = buildSheetSchema(template, newId)
  return {
    id: 's1',
    memberId: 'm1',
    slug: 'customers',
    name: 'Customers',
    template,
    position: 0,
    columns,
    stages,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
  }
}

function makeRow(patch: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    sheetId: 's1',
    memberId: 'm1',
    position: 0,
    name: 'Rohan Mehta',
    company: 'Hosur Precision Forge',
    title: 'Plant head',
    phone: '+919845012345',
    email: 'rohan@hpf.example',
    linkedin: '',
    links: [],
    warmth: null,
    stageIndex: null,
    stageDates: {},
    lost: null,
    tagIds: [],
    nextAction: null,
    introducedBy: null,
    connectsTo: [],
    notes: '',
    files: [],
    fields: {},
    lastTouchAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    createdBy: 'm1',
    updatedBy: 'm1',
    deletedAt: null,
    ...patch,
  }
}

const tag = (id: string, name: string): Tag => ({
  id,
  name,
  colour: 'indigo',
  createdAt: '2026-11-01T00:00:00.000Z',
})

function ctxFor(sheet: Sheet, tags: Tag[] = []): SortContext {
  return {
    sheet,
    tagMap: new Map(tags.map((t) => [t.id, t])),
    rowName: (id) => (id === 'r-known' ? 'Krithik Rao' : undefined),
  }
}

function col(sheet: Sheet, key: string): ColumnDef {
  const found = sheet.columns.find((c) => c.key === key)
  if (!found) throw new Error(`No column ${key}`)
  return found
}

describe('visibleColumns', () => {
  it('returns visible columns in position order, with Name first', () => {
    const sheet = makeSheet()
    const visible = visibleColumns(sheet)
    expect(visible.every((c) => !c.hidden)).toBe(true)
    expect(visible[0]?.key).toBe('name')
    const positions = visible.map((c) => c.position)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('drops the stage column when the sheet has no stages', () => {
    const sheet = makeSheet('connectors')
    expect(visibleColumns(sheet).some((c) => c.type === 'stage')).toBe(false)
  })
})

describe('columnAlign', () => {
  it('right-aligns numbers and currency only', () => {
    const sheet = makeSheet()
    expect(columnAlign(col(sheet, 'ticketEstimate'))).toBe('end')
    expect(columnAlign(col(sheet, 'name'))).toBe('start')
  })
})

describe('sortValue', () => {
  const sheet = makeSheet()
  const ctx = ctxFor(sheet, [tag('t1', 'foundry'), tag('t2', 'defence')])

  it('lowercases text and treats blanks as empty', () => {
    expect(sortValue(col(sheet, 'name'), makeRow(), ctx)).toBe('rohan mehta')
    expect(sortValue(col(sheet, 'title'), makeRow({ title: '  ' }), ctx)).toBeUndefined()
  })

  it('orders warmth warm, waiting, cold, then empty', () => {
    const def = col(sheet, 'warmth')
    expect(sortValue(def, makeRow({ warmth: 'warm' }), ctx)).toBe(0)
    expect(sortValue(def, makeRow({ warmth: 'waiting' }), ctx)).toBe(1)
    expect(sortValue(def, makeRow({ warmth: 'cold' }), ctx)).toBe(2)
    expect(sortValue(def, makeRow(), ctx)).toBeUndefined()
  })

  it('sorts stages by progress and lost rows below live ones', () => {
    const def = col(sheet, 'stage')
    expect(sortValue(def, makeRow({ stageIndex: 3 }), ctx)).toBe(3)
    expect(
      sortValue(def, makeRow({ stageIndex: 3, lost: { stageIndex: 3, date: '2026-10-15' } }), ctx),
    ).toBe(-1)
    expect(sortValue(def, makeRow(), ctx)).toBeUndefined()
  })

  it('sorts tags by their names', () => {
    expect(sortValue(col(sheet, 'tags'), makeRow({ tagIds: ['t1', 't2'] }), ctx)).toBe(
      'defence foundry',
    )
  })

  it('sorts next actions by date, then text', () => {
    const value = sortValue(
      col(sheet, 'nextAction'),
      makeRow({
        nextAction: { text: 'Send ROI note', date: { date: '2026-10-15', precision: 'mid-month' } },
      }),
      ctx,
    )
    expect(value).toBe('2026-10-15 Send ROI note')
    expect(
      sortValue(
        col(sheet, 'nextAction'),
        makeRow({ nextAction: { text: 'Call', date: null } }),
        ctx,
      ),
    ).toBe('call')
  })

  it('reads custom fields by type', () => {
    const row = makeRow({
      fields: {
        ticketEstimate: 2_500_000,
        archetype: 'Foundries and forging shops',
        plantLocation: 'Hosur',
      },
    })
    expect(sortValue(col(sheet, 'ticketEstimate'), row, ctx)).toBe(2_500_000)
    expect(sortValue(col(sheet, 'archetype'), row, ctx)).toBe(2)
    expect(sortValue(col(sheet, 'plantLocation'), row, ctx)).toBe('hosur')
    expect(sortValue(col(sheet, 'pain'), row, ctx)).toBeUndefined()
  })

  it('labels links from row names or free text', () => {
    expect(linkLabel({ kind: 'row', rowId: 'r-known' }, ctx.rowName)).toBe('Krithik Rao')
    expect(linkLabel({ kind: 'text', text: 'Bharat Forge' }, ctx.rowName)).toBe('Bharat Forge')
    expect(
      sortValue(
        col(sheet, 'introducedBy'),
        makeRow({ introducedBy: { kind: 'row', rowId: 'r-known' } }),
        ctx,
      ),
    ).toBe('krithik rao')
  })
})

describe('compareSortValues', () => {
  it('puts empty values last', () => {
    expect(compareSortValues(undefined, 'a')).toBeGreaterThan(0)
    expect(compareSortValues('a', undefined)).toBeLessThan(0)
    expect(compareSortValues(undefined, undefined)).toBe(0)
  })

  it('compares numbers numerically and text naturally', () => {
    expect(compareSortValues(2, 10)).toBeLessThan(0)
    expect(compareSortValues('row 2', 'row 10')).toBeLessThan(0)
    expect(compareSortValues('Apple', 'apple')).toBe(0)
  })
})
