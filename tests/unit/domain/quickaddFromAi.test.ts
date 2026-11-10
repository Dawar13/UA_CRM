import { describe, expect, it } from 'vitest'
import {
  type AiContact,
  aiContactsToQuickAdd,
  aiContactToQuickAdd,
  cleanValue,
} from '@/domain/quickadd/fromAi'
import { type ParsedContact, parseQuickAdd } from '@/domain/quickadd/parse'
import { buildSheetSchema } from '@/domain/templates'
import type { Sheet } from '@/domain/types'

// Contacts read by AI (D-055) become quick-add text, which the usual parser reads back.

const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const newId = () => `id-${++n}`

function sheetOf(template: Sheet['template']): Sheet {
  const { columns, stages } = buildSheetSchema(template, newId)
  return {
    id: `s-${template}`,
    memberId: 'm-dawar',
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

const customers = sheetOf('customers')

function contact(over: Partial<AiContact>): AiContact {
  return {
    name: '',
    title: '',
    company: '',
    location: '',
    phones: [],
    emails: [],
    linkedin: '',
    links: [],
    warmth: '',
    stage: '',
    tags: [],
    introducedBy: '',
    nextAction: '',
    nextDate: '',
    notes: '',
    fields: [],
    ...over,
  }
}

function parsed(text: string, sheet = customers): ParsedContact[] {
  const result = parseQuickAdd(text, {
    now: NOW,
    sheet,
    tags: [],
    people: [{ id: 'r-krithik', name: 'Krithik Iyer', where: 'Dawar · Connectors' }],
  })
  if (result.kind !== 'contacts') throw new Error('Expected contacts')
  return result.contacts
}

describe('AI contacts as quick-add text', () => {
  it('writes every field so the parser reads it back', () => {
    const text = aiContactToQuickAdd(
      contact({
        name: 'Rohan Mehta',
        title: 'Plant Head',
        company: 'Hosur Precision Forge',
        location: 'Hosur',
        phones: ['+91 98450 12345'],
        emails: ['rohan@hpf.in'],
        linkedin: 'linkedin.com/in/rohanmehta',
        warmth: 'warm',
        stage: 'first call',
        tags: ['Foundry', 'decision maker'],
        introducedBy: 'Krithik Iyer',
        nextAction: 'send ROI note',
        nextDate: '14 Nov',
        notes: 'Four heading lines; unplanned downtime is his KPI',
        fields: [
          { label: 'Ticket estimate (₹ L/yr)', value: '12 L' },
          { label: 'Wedge agent', value: 'Maintenance' },
          { label: 'Not a column', value: 'dropped' },
        ],
      }),
      customers,
    )
    expect(text).toBe(
      [
        'Rohan Mehta / Plant Head @ Hosur Precision Forge, Hosur',
        '+91 98450 12345  rohan@hpf.in  linkedin.com/in/rohanmehta',
        'via: Krithik Iyer  #warm  #foundry  #decision-maker  stage: first call',
        'Ticket: 12 L',
        'Wedge agent: Maintenance',
        'next: 14 Nov send ROI note',
        'note: Four heading lines; unplanned downtime is his KPI',
      ].join('\n'),
    )

    const [c] = parsed(text)
    expect(c?.values).toMatchObject({
      name: 'Rohan Mehta',
      title: 'Plant Head',
      company: 'Hosur Precision Forge',
      phone: '+919845012345',
      email: 'rohan@hpf.in',
      warmth: 'warm',
      stageIndex: 2,
      introducedBy: { kind: 'row', rowId: 'r-krithik' },
      notes: 'Four heading lines; unplanned downtime is his KPI',
    })
    expect(c?.values.fields).toMatchObject({
      plantLocation: 'Hosur',
      ticketEstimate: 1_200_000,
      wedgeAgent: 'Maintenance',
    })
    expect(c?.values.nextAction).toMatchObject({ text: 'send ROI note' })
    expect(c?.newTags).toEqual(['foundry', 'decision-maker'])
  })

  it('keeps values from being read as keys, tags or a new contact', () => {
    expect(cleanValue('Budget: 25L, see #3\n\nnext: call')).toBe(
      'Budget - 25L, see no. 3; next - call',
    )
    const text = aiContactToQuickAdd(
      contact({ name: 'Asha Rao', notes: 'Stage: unclear #maybe\nvia: someone' }),
      customers,
    )
    const [c] = parsed(text)
    expect(c?.values.stageIndex).toBeUndefined()
    expect(c?.values.introducedBy).toBeUndefined()
    expect(c?.newTags).toEqual([])
    expect(c?.values.notes).toBe('Stage - unclear no. maybe; via - someone')
  })

  it('keeps the first line’s separators out of its parts', () => {
    const text = aiContactToQuickAdd(
      contact({ name: 'Meera Desai', title: 'Head / Ops', company: 'Damanganga, Pvt Ltd' }),
      customers,
    )
    expect(text).toBe('Meera Desai / Head & Ops @ Damanganga Pvt Ltd')
    const [c] = parsed(text)
    expect(c?.values).toMatchObject({ title: 'Head & Ops', company: 'Damanganga Pvt Ltd' })
  })

  it('a location without a company goes in by key, and no stage on a sheet without stages', () => {
    const connectors = sheetOf('connectors')
    expect(
      aiContactToQuickAdd(
        contact({ name: 'Krithik', location: 'Pune', stage: 'Active' }),
        connectors,
      ),
    ).toBe('Krithik\nloc: Pune')
  })

  it('a column no key reaches keeps its value in Notes', () => {
    const column = (key: string, label: string, position: number) => ({
      id: `c-${key}`,
      key,
      label,
      type: 'text' as const,
      system: false,
      width: 120,
      hidden: false,
      position,
    })
    const sheet = {
      ...customers,
      columns: [
        ...customers.columns,
        column('docsShared', 'Docs (shared)', 90),
        column('docsDue', 'Docs (due)', 91),
      ],
    }
    const text = aiContactToQuickAdd(
      contact({
        name: 'Asha Rao',
        notes: 'Met at CII',
        fields: [{ label: 'Docs (due)', value: 'PAN' }],
      }),
      sheet,
    )
    expect(text).toBe('Asha Rao\nnote: Docs (due) - PAN; Met at CII')
  })

  it('several contacts are separated by a blank line; nameless ones are left out', () => {
    const text = aiContactsToQuickAdd(
      [contact({ name: 'Rohan Mehta' }), contact({ name: ' ' }), contact({ name: 'Asha Rao' })],
      customers,
    )
    expect(text).toBe('Rohan Mehta\n\nAsha Rao')
    expect(parsed(text).map((c) => c.values.name)).toEqual(['Rohan Mehta', 'Asha Rao'])
  })
})
