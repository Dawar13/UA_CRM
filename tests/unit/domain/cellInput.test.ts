import { describe, expect, it } from 'vitest'
import {
  cellEditText,
  cellPatch,
  cellText,
  editableDate,
  editorKind,
  matchOption,
  parseAmount,
  parseClipboardGrid,
  parseDateInput,
  parseNextAction,
  parseNumber,
  parsePastedCell,
  parseTextCell,
  toClipboardGrid,
} from '@/domain/cellInput'
import { newRow } from '@/domain/rows'
import { buildSheetSchema } from '@/domain/templates'
import type { ColumnDef, Row, Sheet } from '@/domain/types'

// Thu 5 Nov 2026, 10:00 IST.
const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const newId = () => `id-${++n}`

function customers(): Sheet {
  const { columns, stages } = buildSheetSchema('customers', newId)
  return {
    id: 's1',
    memberId: 'm1',
    slug: 'customers',
    name: 'Customers',
    template: 'customers',
    position: 0,
    columns,
    stages,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    deletedAt: null,
  }
}

function col(sheet: Sheet, key: string): ColumnDef {
  const found = sheet.columns.find((c) => c.key === key)
  if (!found) throw new Error(key)
  return found
}

function custom(type: ColumnDef['type'], options?: string[]): ColumnDef {
  return {
    id: 'c',
    key: 'field',
    label: 'Field',
    type,
    system: false,
    width: 120,
    hidden: false,
    position: 0,
    ...(options ? { options } : {}),
  }
}

function rohan(sheet: Sheet): Row {
  return newRow(
    sheet,
    {
      name: 'Rohan Mehta',
      phone: '+91 98450 12345',
      links: ['hpf.in', 'x.example'],
      nextAction: { text: 'Send ROI note', date: { date: '2026-11-15', precision: 'mid-month' } },
      fields: { ticketEstimate: 2_500_000 },
    },
    { id: 'r1', position: 0 },
    { now: NOW, actorId: 'm1', newId },
  ).row
}

const textCtx = {
  now: NOW,
  tagMap: new Map([
    ['t1', { id: 't1', name: 'foundry', colour: 'amber' as const, createdBy: null, createdAt: '' }],
  ]),
  rowName: (id: string) => (id === 'r9' ? 'Krithik Rao' : undefined),
  stageNames: ['Identified', 'Intro asked', 'First call'],
}

describe('numbers and amounts', () => {
  it('reads en-IN numbers', () => {
    expect(parseNumber('1,20,000')).toBe(120000)
    expect(parseNumber(' 3.5 ')).toBe(3.5)
    expect(parseNumber('-12')).toBe(-12)
    expect(parseNumber('12 apples')).toBeNull()
  })

  it('reads rupees in lakh and crore shorthands', () => {
    expect(parseAmount('25L')).toBe(2_500_000)
    expect(parseAmount('25 lakh')).toBe(2_500_000)
    expect(parseAmount('1.2cr')).toBe(12_000_000)
    expect(parseAmount('₹1.2 Cr')).toBe(12_000_000)
    expect(parseAmount('₹25,00,000')).toBe(2_500_000)
    expect(parseAmount('Rs. 45k')).toBe(45_000)
    expect(parseAmount('45000')).toBe(45_000)
    expect(parseAmount('lots')).toBeNull()
    expect(parseAmount('12 apples')).toBeNull()
  })
})

describe('dates and next actions', () => {
  it('reads fuzzy and natural dates, forward from today in IST', () => {
    expect(parseDateInput('mid Nov', NOW)).toEqual({ date: '2026-11-15', precision: 'mid-month' })
    expect(parseDateInput('12 Nov', NOW)).toEqual({ date: '2026-11-12', precision: 'day' })
    expect(parseDateInput('fri', NOW)).toEqual({ date: '2026-11-06', precision: 'day' })
    expect(parseDateInput('tomorrow', NOW)).toEqual({ date: '2026-11-06', precision: 'day' })
    expect(parseDateInput('whenever', NOW)).toBeNull()
  })

  it('takes a date from the start of a next action and keeps the rest as the action', () => {
    expect(parseNextAction('fri 4pm send ROI note', NOW)).toEqual({
      date: { date: '2026-11-06', precision: 'day' },
      text: 'send ROI note',
    })
    expect(parseNextAction('mid Nov plant visit', NOW)).toEqual({
      date: { date: '2026-11-15', precision: 'mid-month' },
      text: 'plant visit',
    })
    expect(parseNextAction('call Rohan', NOW)).toEqual({ date: null, text: 'call Rohan' })
    expect(parseNextAction('  ', NOW)).toBeNull()
  })

  it('writes dates in a form that reads back the same', () => {
    for (const date of [
      { date: '2026-11-12', precision: 'day' as const },
      { date: '2026-11-15', precision: 'mid-month' as const },
      { date: '2026-10-05', precision: 'early-month' as const },
      { date: '2026-12-25', precision: 'late-month' as const },
      { date: '2027-01-01', precision: 'month' as const },
    ]) {
      expect(parseDateInput(editableDate(date), NOW)).toEqual(date)
    }
  })
})

describe('matchOption', () => {
  const options = ['Decision maker', 'Champion', 'User', 'Blocker']
  it('matches any case, then a unique start, then a unique part', () => {
    expect(matchOption(options, 'champion')).toBe('Champion')
    expect(matchOption(options, 'dec')).toBe('Decision maker')
    expect(matchOption(options, 'maker')).toBe('Decision maker')
    expect(matchOption(['First call', 'First meeting'], 'first')).toBeNull()
    expect(matchOption(options, '')).toBeNull()
  })
})

describe('text cells', () => {
  const sheet = customers()

  it('opens the right editor per column', () => {
    expect(editorKind(col(sheet, 'name'))).toBe('text')
    expect(editorKind(col(sheet, 'notes'))).toBe('longText')
    expect(editorKind(col(sheet, 'warmth'))).toBe('choice')
    expect(editorKind(col(sheet, 'tags'))).toBe('tags')
    expect(editorKind(col(sheet, 'connectsTo'))).toBe('people')
    expect(editorKind(col(sheet, 'lastTouch'))).toBe('readOnly')
    expect(editorKind(col(sheet, 'archetype'))).toBe('choice')
    expect(editorKind(custom('multiSelect'))).toBe('multiChoice')
    expect(editorKind(custom('checkbox'))).toBe('checkbox')
  })

  it('checks names, phones, emails, amounts and dates', () => {
    expect(parseTextCell(col(sheet, 'name'), '  ', NOW)).toEqual({
      ok: false,
      message: 'A row needs a name',
    })
    expect(parseTextCell(col(sheet, 'phone'), '098450 12345', NOW)).toEqual({
      ok: true,
      value: '+919845012345',
      preview: '+91 98450 12345',
    })
    expect(parseTextCell(col(sheet, 'phone'), 'ext 12', NOW)).toMatchObject({ value: 'ext 12' })
    expect(parseTextCell(col(sheet, 'email'), 'rohan@hpf', NOW).ok).toBe(false)
    expect(parseTextCell(col(sheet, 'ticketEstimate'), '25L', NOW)).toMatchObject({
      value: 2_500_000,
      preview: '₹25 L',
    })
    expect(parseTextCell(col(sheet, 'ticketEstimate'), 'lots', NOW).ok).toBe(false)
    expect(parseTextCell(col(sheet, 'nextDate'), 'mid Nov', NOW)).toMatchObject({
      value: { date: '2026-11-15', precision: 'mid-month' },
    })
    expect(parseTextCell(col(sheet, 'links'), 'a.example, b.example', NOW)).toMatchObject({
      value: ['a.example', 'b.example'],
    })
    expect(parseTextCell(col(sheet, 'company'), '', NOW)).toMatchObject({ value: '' })
    expect(parseTextCell(custom('number'), '', NOW)).toMatchObject({ value: null })
  })

  it('turns a value into a row change', () => {
    const row = rohan(sheet)
    expect(cellPatch(col(sheet, 'title'), row, 'Plant Head')).toEqual({ title: 'Plant Head' })
    expect(cellPatch(col(sheet, 'nextDate'), row, null)).toEqual({
      nextAction: { text: 'Send ROI note', date: null },
    })
    expect(cellPatch(col(sheet, 'ticketEstimate'), row, null)).toEqual({ fields: {} })
    expect(cellPatch(col(sheet, 'pain'), row, 'Downtime')).toEqual({
      fields: { ticketEstimate: 2_500_000, pain: 'Downtime' },
    })
  })

  it('offers each value for editing in a form that reads back', () => {
    const row = rohan(sheet)
    expect(cellEditText(col(sheet, 'phone'), row, textCtx)).toBe('+91 98450 12345')
    expect(cellEditText(col(sheet, 'links'), row, textCtx)).toBe('hpf.in, x.example')
    expect(cellEditText(col(sheet, 'nextAction'), row, textCtx)).toBe('Mid Nov 2026 Send ROI note')
    expect(cellEditText(col(sheet, 'ticketEstimate'), row, textCtx)).toBe('₹25 L')
    expect(
      parseTextCell(
        col(sheet, 'nextAction'),
        cellEditText(col(sheet, 'nextAction'), row, textCtx),
        NOW,
      ),
    ).toMatchObject({ value: row.nextAction })
  })

  it('copies cells as they read on screen', () => {
    const row = { ...rohan(sheet), tagIds: ['t1'], warmth: 'warm' as const, stageIndex: 2 }
    expect(cellText(col(sheet, 'warmth'), row, textCtx)).toBe('Warm')
    expect(cellText(col(sheet, 'stage'), row, textCtx)).toBe('First call')
    expect(cellText(col(sheet, 'tags'), row, textCtx)).toBe('foundry')
    expect(cellText(col(sheet, 'nextAction'), row, textCtx)).toBe('Mid Nov · Send ROI note')
    expect(cellText(col(sheet, 'ticketEstimate'), row, textCtx)).toBe('₹25 L')
    expect(
      cellText(
        col(sheet, 'connectsTo'),
        { ...row, connectsTo: [{ kind: 'row', rowId: 'r9' }] },
        textCtx,
      ),
    ).toBe('Krithik Rao')
  })
})

describe('pasting', () => {
  const sheet = customers()
  const stages = sheet.stages.map((s) => s.name)

  it('reads pasted cells per column', () => {
    expect(parsePastedCell(col(sheet, 'warmth'), 'waiting', NOW, stages)).toEqual({
      ok: true,
      kind: 'warmth',
      value: 'waiting',
    })
    expect(parsePastedCell(col(sheet, 'stage'), 'first call', NOW, stages)).toEqual({
      ok: true,
      kind: 'stage',
      value: 2,
    })
    expect(parsePastedCell(col(sheet, 'tags'), '#foundry, defence', NOW, stages)).toEqual({
      ok: true,
      kind: 'tags',
      names: ['foundry', 'defence'],
    })
    expect(parsePastedCell(col(sheet, 'roleInDeal'), 'champ', NOW, stages)).toEqual({
      ok: true,
      kind: 'patch',
      value: 'Champion',
    })
    expect(parsePastedCell(col(sheet, 'roleInDeal'), 'Boss', NOW, stages).ok).toBe(false)
    expect(parsePastedCell(col(sheet, 'introducedBy'), 'Krithik', NOW, stages)).toEqual({
      ok: true,
      kind: 'patch',
      value: { kind: 'text', text: 'Krithik' },
    })
    expect(parsePastedCell(custom('checkbox'), 'yes', NOW, stages)).toMatchObject({ value: true })
    expect(parsePastedCell(col(sheet, 'lastTouch'), 'x', NOW, stages).ok).toBe(false)
  })

  it('splits spreadsheet clipboard text, quotes included, and writes it back', () => {
    const text = 'Rohan\t"Plant\tHead"\r\n"Says ""hi""\nthere"\tx\n'
    const grid = parseClipboardGrid(text)
    expect(grid).toEqual([
      ['Rohan', 'Plant\tHead'],
      ['Says "hi"\nthere', 'x'],
    ])
    expect(parseClipboardGrid(toClipboardGrid(grid))).toEqual(grid)
    expect(parseClipboardGrid('one')).toEqual([['one']])
  })
})
