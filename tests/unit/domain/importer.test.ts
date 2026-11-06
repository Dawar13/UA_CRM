import { describe, expect, it } from 'vitest'
import { founderRowValues, mapFounderType, readFoundersWorkbook } from '@/domain/importer/founders'
import { autoMap, lineToRow, parseCsv } from '@/domain/importer/table'
import { buildSheetSchema } from '@/domain/templates'
import type { Sheet } from '@/domain/types'

// Thu 5 Nov 2026, 10:00 IST.
const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const newId = () => `id-${++n}`

function sheetOf(template: Sheet['template']): Sheet {
  const { columns, stages } = buildSheetSchema(template, newId)
  return {
    id: `s-${template}`,
    memberId: 'm1',
    slug: template,
    name: template,
    template,
    position: 0,
    columns,
    stages,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    deletedAt: null,
  }
}

// An invented workbook with the old sheet's structure (real files never enter the repository).
const oneTab = [
  ['Dawar'],
  ['Name', 'Company', 'Type', 'Spl mentions', 'Date'],
  ['Kiran Rao', 'Peak Capital', 'VC', 'Knows the Tata family office', 'Mid oct'],
  ['Asha Menon', '', 'Advisor', '', '12 Oct'],
  [''],
  ['Dhruv'],
  ['Name', 'Company', 'Type', 'Spl mentions', 'Date'],
  ['Vivek Shah', 'Shah Angels', 'Angel', '', 'Oct 2026'],
  ['Common'],
  ['Name', 'Company', 'Type', 'Spl mentions', 'Date'],
  ['Meera Iyer', 'Lakshmi Textiles', 'Industry', 'Runs 3 plants', 'early nov'],
  ['Ravi Kumar', '', 'Friend', '', 'whenever'],
]

describe("the founders' old spreadsheet", () => {
  it('reads blocks from one tab, each with its own header', () => {
    const rows = readFoundersWorkbook([{ name: 'Contacts', rows: oneTab }])
    expect(rows.map((r) => [r.block, r.name, r.type])).toEqual([
      ['Dawar', 'Kiran Rao', 'VC'],
      ['Dawar', 'Asha Menon', 'Advisor'],
      ['Dhruv', 'Vivek Shah', 'Angel'],
      ['Common', 'Meera Iyer', 'Industry'],
      ['Common', 'Ravi Kumar', 'Friend'],
    ])
    expect(rows[0]).toMatchObject({
      company: 'Peak Capital',
      mentions: 'Knows the Tata family office',
      dateText: 'Mid oct',
    })
  })

  it('reads blocks from separate tabs too', () => {
    const rows = readFoundersWorkbook([
      {
        name: 'Dawar',
        rows: [
          ['Name', 'Company', 'Type', 'Spl mentions', 'Date'],
          ['A One', 'X', 'VC', '', ''],
        ],
      },
      {
        name: 'Common',
        rows: [
          ['Name', 'Type'],
          ['B Two', 'Friend'],
        ],
      },
    ])
    expect(rows.map((r) => [r.block, r.name])).toEqual([
      ['Dawar', 'A One'],
      ['Common', 'B Two'],
    ])
  })

  it.each([
    ['VC', 'investors', { investorType: 'VC' }],
    ['Angel', 'investors', { investorType: 'Angel' }],
    ['advisor', 'advisors', {}],
    ['Friend', 'connectors', { relationship: 'Friend' }],
    ['Industry', null, {}],
    ['', null, {}],
  ])('Type %s goes to %s', (type, template, fields) => {
    expect(mapFounderType(type)).toEqual({ template, fields })
  })

  it('Spl mentions become Connects to, and Date an imported touch keeping fuzzy dates', () => {
    const [kiran] = readFoundersWorkbook([{ name: 'Contacts', rows: oneTab }])
    if (!kiran) throw new Error('no row')
    const { values, history } = founderRowValues(kiran, 'investors', NOW)
    expect(values).toEqual({
      name: 'Kiran Rao',
      company: 'Peak Capital',
      connectsTo: [{ kind: 'text', text: 'Knows the Tata family office' }],
      fields: { investorType: 'VC' },
    })
    expect(history).toEqual([
      {
        kind: 'imported',
        at: '2026-10-15T06:30:00.000Z',
        fuzzyDate: { date: '2026-10-15', precision: 'mid-month' },
        text: 'Imported from the old spreadsheet (Dawar). Type: VC',
      },
    ])
  })

  it('a date that does not read is kept in Notes', () => {
    const rows = readFoundersWorkbook([{ name: 'Contacts', rows: oneTab }])
    const ravi = rows.find((r) => r.name === 'Ravi Kumar')
    if (!ravi) throw new Error('no row')
    expect(founderRowValues(ravi, 'connectors', NOW).values.notes).toBe(
      'Date in the old sheet: whenever',
    )
  })
})

describe('any table', () => {
  it('parses CSV with quotes, commas and new lines, and semicolon files', () => {
    expect(parseCsv('Name,Notes\n"Mehta, Rohan","Said ""yes""\nthen left"\n\n')).toEqual([
      ['Name', 'Notes'],
      ['Mehta, Rohan', 'Said "yes"\nthen left'],
    ])
    expect(parseCsv('﻿Name;Phone\nA;1')).toEqual([
      ['Name', 'Phone'],
      ['A', '1'],
    ])
  })

  it('maps columns by label, by common synonyms and by what was remembered', () => {
    const sheet = sheetOf('customers')
    const archetype = sheet.columns.find((c) => c.key === 'archetype')?.id ?? ''
    const ids = autoMap(
      ['Full name', 'Organisation', 'Mobile', 'Archetype', 'Weird', 'Seg'],
      sheet,
      {
        seg: archetype,
      },
    )
    const key = (id: string | null) => sheet.columns.find((c) => c.id === id)?.key ?? null
    // Archetype is taken by the remembered "Seg"? No: label matches win in order, then memory.
    expect(ids.map(key)).toEqual(['name', 'company', 'phone', 'archetype', null, null])
  })

  it('reads each cell as its column’s type and lists what does not fit', () => {
    const sheet = sheetOf('customers')
    const mapping = autoMap(
      ['Name', 'Phone', 'Ticket estimate', 'Archetype', 'Warmth', 'Tags'],
      sheet,
    )
    const line = lineToRow(
      ['Rohan Mehta', '098450 12345', '25L', 'Steel works', 'warm', 'foundry, defence'],
      mapping,
      sheet,
      2,
      NOW,
    )
    expect(line.values).toMatchObject({
      name: 'Rohan Mehta',
      phone: '+919845012345',
      fields: { ticketEstimate: 2_500_000 },
      warmth: 'warm',
    })
    expect(line.tagNames).toEqual(['foundry', 'defence'])
    expect(line.problems).toEqual(['Line 2, Archetype: Steel works is not one of the options'])
    expect(lineToRow(['', ''], mapping, sheet, 3, NOW).problems).toEqual([
      'Line 3: no name, so it is skipped',
    ])
  })
})
