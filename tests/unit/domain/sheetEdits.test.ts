import { describe, expect, it } from 'vitest'
import { newRow } from '@/domain/rows'
import { convertColumn, editStages, rowsAtStages } from '@/domain/sheetEdits'
import { addColumn, newSheet, SheetRuleError } from '@/domain/sheets'
import { markLost, moveToStage } from '@/domain/stages'
import type { Row, Sheet } from '@/domain/types'

const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const newId = () => `id-${++n}`
const dctx = { now: NOW, actorId: 'm1', newId }

function customers(): Sheet {
  return newSheet(
    'm1',
    { name: 'Customers', template: 'customers' },
    [],
    { sheetId: 's1', newId },
    NOW,
  )
}

function rowAt(sheet: Sheet, name: string, stageIndex: number | null): Row {
  return newRow(sheet, { name, stageIndex }, { id: `r-${name}`, position: 0 }, dctx).row
}

describe('editStages', () => {
  it('reordering keeps every row at its stage', () => {
    const sheet = customers()
    const rohan = rowAt(sheet, 'rohan', 2)
    const reversed = [...sheet.stages].reverse()
    const { sheet: next, rows } = editStages(sheet, reversed, {}, [rohan], { now: NOW, newId })
    expect(next.stages[0]?.name).toBe('Paid')
    expect(rows).toHaveLength(1)
    expect(next.stages[rows[0]?.stageIndex ?? -1]?.name).toBe('First call')
  })

  it('renames and adds stages without touching rows', () => {
    const sheet = customers()
    const rohan = rowAt(sheet, 'rohan', 2)
    const stages = [
      ...sheet.stages.slice(0, -1).map((s, i) => (i === 0 ? { ...s, name: ' Spotted ' } : s)),
      { id: 'new-stage', name: 'Pilot extended' },
      sheet.stages.at(-1) ?? { id: 'x', name: 'Paid' },
    ]
    const result = editStages(sheet, stages, {}, [rohan], { now: NOW, newId })
    expect(result.sheet.stages.map((s) => s.name)).toEqual([
      'Spotted',
      'Intro asked',
      'First call',
      'Plant visit',
      'Pilot scoped',
      'Pilot live',
      'Pilot extended',
      'Paid',
    ])
    expect(result.rows).toEqual([])
  })

  it('moves rows off a removed stage to the stage chosen, keeping its date', () => {
    const sheet = customers()
    const firstCall = sheet.stages[2]
    const plantVisit = sheet.stages[3]
    if (!firstCall || !plantVisit) throw new Error('stages')
    const rohan = rowAt(sheet, 'rohan', 2)
    const sunita = moveToStage(rowAt(sheet, 'sunita', 0), sheet, 3, dctx).row
    expect(rowsAtStages(sheet, [rohan, sunita]).get(firstCall.id)).toBe(1)

    const without = sheet.stages.filter((s) => s.id !== firstCall.id)
    expect(() => editStages(sheet, without, {}, [rohan, sunita], { now: NOW, newId })).toThrow(
      'Choose where the rows at First call go',
    )
    const { rows } = editStages(
      sheet,
      without,
      { [firstCall.id]: plantVisit.id },
      [rohan, sunita],
      { now: NOW, newId },
    )
    const moved = rows.find((r) => r.id === rohan.id)
    expect(moved?.stageIndex).toBe(2)
    expect(moved?.stageDates[plantVisit.id]).toBe('2026-11-05')
    expect(moved?.stageDates).not.toHaveProperty(firstCall.id)
    // Sunita was at Plant visit, which shifts down one place but stays the same stage.
    expect(rows.find((r) => r.id === sunita.id)?.stageIndex).toBe(2)
  })

  it('a lost row follows its stage, or loses its stage with "no stage"', () => {
    const sheet = customers()
    const firstCall = sheet.stages[2]
    if (!firstCall) throw new Error('stages')
    const lost = markLost(rowAt(sheet, 'priya', 2), sheet, dctx).row
    const { rows } = editStages(
      sheet,
      sheet.stages.filter((s) => s.id !== firstCall.id),
      { [firstCall.id]: null },
      [lost],
      { now: NOW, newId },
    )
    expect(rows[0]).toMatchObject({ stageIndex: null, lost: null })
  })

  it('refuses empty names, and gives a blank sheet its Stage column', () => {
    const sheet = customers()
    expect(() => editStages(sheet, [{ id: 'a', name: ' ' }], {}, [], { now: NOW, newId })).toThrow(
      SheetRuleError,
    )
    const blank = newSheet(
      'm1',
      { name: 'Blank', template: 'blank' },
      [],
      { sheetId: 's2', newId },
      NOW,
    )
    expect(blank.columns.some((c) => c.key === 'stage')).toBe(false)
    const staged = editStages(
      blank,
      [
        { id: 'a', name: 'Asked' },
        { id: 'b', name: 'Done' },
      ],
      {},
      [],
      {
        now: NOW,
        newId,
      },
    )
    expect(staged.sheet.columns.find((c) => c.key === 'stage')).toMatchObject({
      system: true,
      hidden: false,
    })
  })
})

describe('convertColumn', () => {
  it('reads each value as the new type and lists what does not convert', () => {
    let sheet = customers()
    sheet = addColumn(sheet, { label: 'Budget', type: 'text' }, 'c-budget', NOW)
    const rows = [
      { ...rowAt(sheet, 'a', null), fields: { budget: '25L' } },
      { ...rowAt(sheet, 'b', null), fields: { budget: 'about 3 crore' } },
      { ...rowAt(sheet, 'c', null), fields: {} },
    ]
    const result = convertColumn(sheet, 'c-budget', 'currency', rows, {
      now: NOW,
      tagMap: new Map(),
    })
    expect(result.sheet.columns.find((c) => c.id === 'c-budget')?.type).toBe('currency')
    expect(result.values).toEqual([
      { rowId: 'r-a', rowName: 'a', before: '25L', after: 2_500_000 },
      { rowId: 'r-b', rowName: 'b', before: 'about 3 crore', after: undefined },
    ])
    expect(result.rows.map((r) => r.fields.budget)).toEqual([2_500_000, undefined])
  })

  it('a dropdown takes its options from the values there are', () => {
    let sheet = customers()
    sheet = addColumn(sheet, { label: 'Region', type: 'text' }, 'c-region', NOW)
    const rows = [
      { ...rowAt(sheet, 'a', null), fields: { region: 'South' } },
      { ...rowAt(sheet, 'b', null), fields: { region: 'West' } },
      { ...rowAt(sheet, 'c', null), fields: { region: 'South' } },
    ]
    const result = convertColumn(sheet, 'c-region', 'dropdown', rows, {
      now: NOW,
      tagMap: new Map(),
    })
    expect(result.sheet.columns.find((c) => c.id === 'c-region')?.options).toEqual([
      'South',
      'West',
    ])
    expect(result.values.every((v) => v.after !== undefined)).toBe(true)
  })

  it('refuses system columns', () => {
    const sheet = customers()
    const company = sheet.columns.find((c) => c.key === 'company')
    expect(() =>
      convertColumn(sheet, company?.id ?? '', 'number', [], { now: NOW, tagMap: new Map() }),
    ).toThrow("A system column's type cannot change")
  })
})
