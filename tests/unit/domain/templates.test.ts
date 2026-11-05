import { describe, expect, it } from 'vitest'
import { columnDefSchema, coreFieldKeys, sheetSchema, templateKeys } from '@/domain/schemas'
import {
  buildSheetSchema,
  coreColumns,
  customerArchetypes,
  templates,
  turnoverBands,
} from '@/domain/templates'
import { makeIds, makeSheet } from './_fixtures'

const HIDDEN = [
  'Company',
  'Title',
  'LinkedIn',
  'Links',
  'Next date',
  'Introduced by',
  'Connects to',
  'Notes',
  'Files',
]

describe('customerArchetypes', () => {
  it('lists the 15 archetypes in CLAUDE.md order', () => {
    expect(customerArchetypes).toEqual([
      'Auto and EV component makers',
      'Precision job shops',
      'Foundries and forging shops',
      'Steel and metals processing',
      'Electronics manufacturing',
      'Consumer durables and appliances',
      'Plastics, rubber and packaging',
      'Specialty and batch chemicals',
      'Pharma',
      'Paints, coatings and adhesives',
      'FMCG and food and beverage',
      'Oil and gas, refining and petrochemicals',
      'Cement and building materials',
      'Hardware OEMs with supplier networks',
      'Industrial distributors, MRO and defence suppliers',
    ])
  })
})

describe('templates', () => {
  it('defines all six templates with their names and stages', () => {
    expect(Object.keys(templates).sort()).toEqual([...templateKeys].sort())
    for (const key of templateKeys) expect(templates[key].key).toBe(key)
    expect(
      Object.fromEntries(templateKeys.map((k) => [k, [templates[k].name, templates[k].stages]])),
    ).toEqual({
      customers: [
        'Customers',
        [
          'Identified',
          'Intro asked',
          'First call',
          'Plant visit',
          'Pilot scoped',
          'Pilot live',
          'Paid',
        ],
      ],
      investors: [
        'Investors',
        ['Researching', 'Intro asked', 'First meeting', 'Diligence', 'Term sheet', 'Committed'],
      ],
      advisors: ['Advisors and experts', ['Identified', 'Approached', 'Active']],
      connectors: ['Connectors', []],
      serviceProviders: ['Service providers', ['Shortlisted', 'Engaged', 'Done']],
      blank: ['Blank', []],
    })
  })

  it('defines the extra columns of each template', () => {
    const summary = (key: keyof typeof templates) =>
      templates[key].extraColumns.map((c) => [c.key, c.label, c.type, c.options ?? null])
    expect(summary('customers')).toEqual([
      ['plantLocation', 'Plant location', 'text', null],
      ['archetype', 'Archetype', 'dropdown', [...customerArchetypes]],
      ['turnoverBand', 'Turnover band', 'dropdown', [...turnoverBands]],
      ['roleInDeal', 'Role in deal', 'dropdown', ['Decision maker', 'Champion', 'User', 'Blocker']],
      ['pain', 'Pain', 'longText', null],
      [
        'wedgeAgent',
        'Wedge agent',
        'dropdown',
        ['Maintenance', 'Quality', 'Production', 'Procurement', 'Quote', 'Energy', 'Compliance'],
      ],
      ['ticketEstimate', 'Ticket estimate (₹ L/yr)', 'currency', null],
    ])
    expect(summary('investors')).toEqual([
      ['investorType', 'Investor type', 'dropdown', ['Angel', 'VC', 'CVC', 'Family office']],
      ['chequeSize', 'Cheque size', 'currency', null],
      ['stageFocus', 'Stage focus', 'text', null],
      ['thesisFit', 'Thesis fit', 'longText', null],
    ])
    expect(summary('advisors')).toEqual([
      ['expertise', 'Expertise', 'text', null],
      ['wantFromThem', 'What we want from them', 'longText', null],
      ['arrangement', 'Arrangement', 'dropdown', ['Informal', 'Advisory equity']],
    ])
    expect(summary('connectors')).toEqual([
      ['relationship', 'Relationship', 'dropdown', ['Friend', 'Alumni', 'Family', 'Professional']],
      ['introAskedFor', 'Intro asked for', 'text', null],
      ['introMade', 'Intro made', 'checkbox', null],
    ])
    expect(summary('serviceProviders')).toEqual([
      [
        'service',
        'Service',
        'dropdown',
        ['CA', 'Lawyer', 'Incorporation', 'Visa', 'Trademark', 'Other'],
      ],
      ['quote', 'Quote', 'currency', null],
      ['docsShared', 'Docs shared', 'checkbox', null],
      ['deadline', 'Deadline', 'date', null],
    ])
    expect(summary('blank')).toEqual([])
    for (const key of templateKeys) {
      for (const c of templates[key].extraColumns) expect(c.system).toBe(false)
    }
  })
})

describe('coreColumns', () => {
  it('lists the core columns in CLAUDE.md §2.3 order', () => {
    expect(coreColumns(true).map((c) => c.label)).toEqual([
      'Name',
      'Company',
      'Title',
      'Phone',
      'Email',
      'LinkedIn',
      'Links',
      'Warmth',
      'Stage',
      'Tags',
      'Last touch',
      'Next action',
      'Next date',
      'Introduced by',
      'Connects to',
      'Notes',
      'Files',
    ])
    expect(coreColumns(true).map((c) => c.key)).toEqual([...coreFieldKeys])
  })

  it('leaves out Stage when the sheet has no stages', () => {
    expect(coreColumns(false).map((c) => c.key)).not.toContain('stage')
    expect(coreColumns(false)).toHaveLength(16)
  })

  it('marks every core column as system and hides the detail columns', () => {
    const columns = coreColumns(true)
    expect(columns.every((c) => c.system)).toBe(true)
    expect(columns.filter((c) => c.hidden).map((c) => c.label)).toEqual(HIDDEN)
    expect(columns.find((c) => c.key === 'warmth')).toMatchObject({ type: 'warmth', width: 98 })
    expect(columns.find((c) => c.key === 'name')).toMatchObject({ type: 'text', width: 236 })
  })

  it('sizes the at-a-glance columns for the 52px rows of the redesign', () => {
    const width = (key: string) => coreColumns(true).find((c) => c.key === key)?.width
    expect(
      ['name', 'warmth', 'stage', 'tags', 'lastTouch', 'nextAction'].map((key) => width(key)),
    ).toEqual([236, 98, 214, 150, 84, 300])
  })
})

describe('buildSheetSchema', () => {
  it('orders columns like the CLAUDE.md §2.1 layout, then contact details, extras and hidden columns', () => {
    const { columns } = buildSheetSchema('customers', makeIds())
    expect(columns.map((c) => c.label)).toEqual([
      'Name',
      'Warmth',
      'Stage',
      'Tags',
      'Last touch',
      'Next action',
      'Phone',
      'Email',
      'Plant location',
      'Archetype',
      'Turnover band',
      'Role in deal',
      'Pain',
      'Wedge agent',
      'Ticket estimate (₹ L/yr)',
      ...HIDDEN,
    ])
    expect(columns.map((c) => c.position)).toEqual(columns.map((_, i) => i))
    expect(columns.filter((c) => c.hidden).map((c) => c.label)).toEqual(HIDDEN)
    expect(columns.slice(0, -HIDDEN.length).every((c) => !c.hidden)).toBe(true)
  })

  it('leaves out Stage for sheets without stages', () => {
    const { columns, stages } = buildSheetSchema('connectors', makeIds())
    expect(stages).toEqual([])
    expect(columns.slice(0, 7).map((c) => c.label)).toEqual([
      'Name',
      'Warmth',
      'Tags',
      'Last touch',
      'Next action',
      'Phone',
      'Email',
    ])
    expect(columns.map((c) => c.key)).not.toContain('stage')
  })

  it('makes ids for columns first, then stages', () => {
    const { columns, stages } = buildSheetSchema('advisors', makeIds('x'))
    expect(columns[0]?.id).toBe('x-1')
    expect(stages).toEqual([
      { id: `x-${columns.length + 1}`, name: 'Identified' },
      { id: `x-${columns.length + 2}`, name: 'Approached' },
      { id: `x-${columns.length + 3}`, name: 'Active' },
    ])
    const ids = [...columns.map((c) => c.id), ...stages.map((s) => s.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds valid sheets for every template', () => {
    for (const key of templateKeys) {
      const sheet = makeSheet(key)
      expect(sheetSchema.safeParse(sheet).success, key).toBe(true)
      for (const c of sheet.columns) expect(columnDefSchema.safeParse(c).success).toBe(true)
      expect(sheet.columns).toHaveLength(
        16 + (templates[key].stages.length > 0 ? 1 : 0) + templates[key].extraColumns.length,
      )
      expect(new Set(sheet.columns.map((c) => c.key)).size).toBe(sheet.columns.length)
    }
    const blank = buildSheetSchema('blank', makeIds())
    expect(blank.stages).toEqual([])
    expect(blank.columns).toHaveLength(16)
  })

  it('copies option lists so edits never leak into the templates', () => {
    const { columns } = buildSheetSchema('customers', makeIds())
    const archetype = columns.find((c) => c.key === 'archetype')
    archetype?.options?.push('Invented')
    expect(templates.customers.extraColumns[1]?.options).toHaveLength(15)
    expect(customerArchetypes).toHaveLength(15)
  })
})
