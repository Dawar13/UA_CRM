import { describe, expect, it } from 'vitest'
import { type ParsedContact, parseQuickAdd, type QuickAddContext } from '@/domain/quickadd/parse'
import { buildSheetSchema } from '@/domain/templates'
import type { Sheet, Tag } from '@/domain/types'

// Thu 5 Nov 2026, 10:00 IST.
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

const tag = (id: string, name: string): Tag => ({
  id,
  name,
  colour: 'amber',
  createdBy: 'm-dawar',
  createdAt: NOW.toISOString(),
})

const ctx: QuickAddContext = {
  now: NOW,
  sheet: sheetOf('customers'),
  tags: [
    tag('t-foundry', 'foundry'),
    tag('t-pilot', 'pilot candidate'),
    tag('t-dm', 'decision maker'),
  ],
  people: [
    { id: 'r-krithik', name: 'Krithik Iyer', where: 'Dawar · Connectors' },
    { id: 'r-arvind-1', name: 'Cdr Arvind Menon', where: 'Dawar · Connectors' },
    { id: 'r-arvind-2', name: 'Arvind Menon', where: 'Dhruv · Investors' },
    { id: 'r-sunita', name: 'Sunita Kulkarni', where: 'Dhruv · Customers' },
  ],
}

function contacts(text: string, c: QuickAddContext = ctx): ParsedContact[] {
  const result = parseQuickAdd(text, c)
  if (result.kind !== 'contacts') throw new Error('expected contacts')
  return result.contacts
}

function one(text: string, c: QuickAddContext = ctx): ParsedContact {
  const [first] = contacts(text, c)
  if (!first) throw new Error('no contact')
  return first
}

const conf = (c: ParsedContact, key: string) => c.preview.find((p) => p.key === key)?.confidence

// ---------- The first line ----------

describe('the first line: Name / Title @ Company, Location', () => {
  it.each([
    ['Rohan Mehta', { name: 'Rohan Mehta' }],
    ['Rohan Mehta / Plant Head', { name: 'Rohan Mehta', title: 'Plant Head' }],
    ['Rohan Mehta @ HPF', { name: 'Rohan Mehta', company: 'HPF' }],
    [
      'Rohan Mehta / Plant Head @ Hosur Precision Forge, Hosur',
      {
        name: 'Rohan Mehta',
        title: 'Plant Head',
        company: 'Hosur Precision Forge',
        fields: { plantLocation: 'Hosur' },
      },
    ],
    [
      'Rohan Mehta / Plant Head @ HPF, Hosur, Tamil Nadu',
      { company: 'HPF', fields: { plantLocation: 'Hosur, Tamil Nadu' } },
    ],
    ['Dr. Asha Rao / CTO @ Acme', { name: 'Dr. Asha Rao', title: 'CTO', company: 'Acme' }],
    ['  Rohan   Mehta  ', { name: 'Rohan Mehta' }],
    [
      'Navaneetha Krishnan / VP Operations @ Sundaram Fasteners',
      { name: 'Navaneetha Krishnan', title: 'VP Operations', company: 'Sundaram Fasteners' },
    ],
    ['Rohan Mehta / Plant Head / Ops', { name: 'Rohan Mehta', title: 'Plant Head / Ops' }],
    [
      'Rohan Mehta @ Tata Steel @ Jamshedpur',
      { name: 'Rohan Mehta', company: 'Tata Steel @ Jamshedpur' },
    ],
  ])('%s', (text, expected) => {
    expect(one(text).values).toMatchObject(expected)
  })

  it('reads "Name, Title at Company" as a likely title and company', () => {
    const c = one('Rohan Mehta, Plant Head at HPF')
    expect(c.values).toMatchObject({ name: 'Rohan Mehta', title: 'Plant Head', company: 'HPF' })
    expect(conf(c, 'title')).toBe('medium')
  })

  it('keeps what follows a | on the first line in Notes', () => {
    expect(one('Rohan Mehta | HPF').values).toMatchObject({ name: 'Rohan Mehta', notes: 'HPF' })
  })

  it('a location goes to Notes on a sheet without a location column', () => {
    expect(
      one('Kiran / Partner @ Sequoia, Bengaluru', { ...ctx, sheet: sheetOf('investors') }).values,
    ).toMatchObject({ company: 'Sequoia', notes: 'Location: Bengaluru' })
  })

  it('marks the name as sure', () => {
    expect(conf(one('Rohan Mehta / Plant Head'), 'name')).toBe('high')
  })
})

describe('a missing name', () => {
  it.each(['+91 98450 12345', 'why: big plant', 'rohan@hpf.in'])('%s', (text) => {
    expect(one(text).warnings[0]).toBe('A row needs a name: put it on the first line')
  })

  it('an empty paste is no contact at all', () => {
    expect(contacts('   \n\n  ')).toEqual([])
  })
})

// ---------- Found anywhere ----------

describe('phones (default region IN, stored as E.164)', () => {
  it.each([
    ['+91 98450 12345', '+919845012345'],
    ['098450 12345', '+919845012345'],
    ['9845012345', '+919845012345'],
    ['+91-98450-12345', '+919845012345'],
    ['98450-12345', '+919845012345'],
    ['(080) 2345 6789', '+918023456789'],
    ['+91 80 2345 6789', '+918023456789'],
    ['phone: 98450 12345', '+919845012345'],
    ['M: +91 98450 12345', '+919845012345'],
    ['Mob: 98450 12345', '+919845012345'],
    ['wa.me/919845012345', '+919845012345'],
  ])('%s', (line, phone) => {
    expect(one(`Rohan Mehta\n${line}`).values.phone).toBe(phone)
  })

  it('keeps a second phone in Notes', () => {
    const c = one('Rohan Mehta\n98450 12345  98450 67890')
    expect(c.values.phone).toBe('+919845012345')
    expect(c.values.notes).toBe('Also: +91 98450 67890')
  })

  it('flags a phone that does not read', () => {
    const c = one('Rohan Mehta\nphone: 12345')
    expect(c.values.phone).toBe('12345')
    expect(conf(c, 'phone')).toBe('low')
    expect(c.warnings).toContain('12345 does not read as a phone number')
  })
})

describe('emails', () => {
  it.each([
    ['rohan@hpf.in', 'rohan@hpf.in'],
    ['Rohan.Mehta@HPF.co.in', 'Rohan.Mehta@HPF.co.in'],
    ['mailto:rohan@hpf.in', 'rohan@hpf.in'],
    ['email: rohan@hpf.in', 'rohan@hpf.in'],
    ['E: rohan@hpf.in', 'rohan@hpf.in'],
  ])('%s', (line, email) => {
    expect(one(`Rohan Mehta\n${line}`).values.email).toBe(email)
  })

  it('flags an email that does not look right', () => {
    const c = one('Rohan Mehta\nemail: rohan@hpf')
    expect(conf(c, 'email')).toBe('low')
  })

  it('keeps a second email in Notes', () => {
    expect(one('Rohan Mehta\nrohan@hpf.in r.mehta@gmail.com').values.notes).toBe(
      'Also: r.mehta@gmail.com',
    )
  })
})

describe('links', () => {
  it.each([
    ['linkedin.com/in/rohanmehta', { linkedin: 'linkedin.com/in/rohanmehta' }],
    [
      'https://www.linkedin.com/in/rohan-mehta/',
      { linkedin: 'https://www.linkedin.com/in/rohan-mehta/' },
    ],
    ['hpf.in', { links: ['hpf.in'] }],
    ['https://hpf.in/about', { links: ['https://hpf.in/about'] }],
    ['www.hpf.co.in', { links: ['www.hpf.co.in'] }],
    ['web: hpf.in', { links: ['hpf.in'] }],
  ])('%s', (line, expected) => {
    expect(one(`Rohan Mehta\n${line}`).values).toMatchObject(expected)
  })

  it('amounts and versions are not links', () => {
    const c = one('Rohan Mehta\nticket: 1.2cr')
    expect(c.values.links).toBeUndefined()
    expect(c.values.fields).toMatchObject({ ticketEstimate: 12_000_000 })
  })
})

// ---------- Keys ----------

describe('key: value', () => {
  it.each([
    ['why: 4 heading lines', { notes: '4 heading lines' }],
    ['rel: met at the EF dinner', { notes: 'met at the EF dinner' }],
    ['note: call after Diwali', { notes: 'call after Diwali' }],
    ['n: short note', { notes: 'short note' }],
    ['loc: Pune', { fields: { plantLocation: 'Pune' } }],
    ['plant location: Hosur', { fields: { plantLocation: 'Hosur' } }],
    ['title: Plant Head', { title: 'Plant Head' }],
    ['co: HPF', { company: 'HPF' }],
    ['company: Hosur Precision Forge', { company: 'Hosur Precision Forge' }],
    ['Stage: First Call', { stageIndex: 2 }],
    ['stage: first call', { stageIndex: 2 }],
    ['pain: downtime on line 3', { fields: { pain: 'downtime on line 3' } }],
    ['archetype: foundries', { fields: { archetype: 'Foundries and forging shops' } }],
    ['arch: pharma', { fields: { archetype: 'Pharma' } }],
    ['ticket: 25L', { fields: { ticketEstimate: 2_500_000 } }],
    ['role: champ', { fields: { roleInDeal: 'Champion' } }],
    ['turnover: medium', { fields: { turnoverBand: 'Medium · ₹100–500 Cr' } }],
    ['wedge: quality', { fields: { wedgeAgent: 'Quality' } }],
    ['warmth: waiting', { warmth: 'waiting' }],
  ])('%s', (line, expected) => {
    expect(one(`Rohan Mehta\n${line}`).values).toMatchObject(expected)
  })

  it('a stage named by its start is a likely match', () => {
    const c = one('Rohan Mehta\ns: plant')
    expect(c.values.stageIndex).toBe(3)
    expect(conf(c, 'stage')).toBe('medium')
  })

  it.each([
    ['stage: pilot', '“pilot” is not a stage here: kept in Notes'],
    ['stage: signed', '“signed” is not a stage here: kept in Notes'],
  ])('%s is flagged and kept', (line, warning) => {
    const c = one(`Rohan Mehta\n${line}`)
    expect(c.values.stageIndex).toBeUndefined()
    expect(c.warnings).toContain(warning)
    expect(c.values.notes).toContain('Stage:')
  })

  it('a stage on a sheet without stages is kept in Notes', () => {
    const c = one('Krithik\nstage: first call', { ...ctx, sheet: sheetOf('connectors') })
    expect(c.values.notes).toBe('Stage: first call')
  })

  it('a value ends at the next key and at a #tag', () => {
    const c = one('Rohan Mehta\nvia: Krithik stage: first call #warm')
    expect(c.values.introducedBy).toEqual({ kind: 'row', rowId: 'r-krithik' })
    expect(c.values.stageIndex).toBe(2)
    expect(c.values.warmth).toBe('warm')
  })

  it('an ambiguous key is flagged and kept in Notes', () => {
    const c = one('Rohan Mehta\np: something')
    expect(c.warnings[0]).toMatch(/^“p” could be /)
    expect(c.values.notes).toBe('p: something')
  })

  it('an unknown key goes to Notes', () => {
    const c = one('Rohan Mehta\nbudget: 25L')
    expect(c.values.notes).toBe('budget: 25L')
    expect(c.warnings).toContain('“budget” is not a column here: kept in Notes')
  })

  it('an unknown key holding a phone fills the phone', () => {
    const c = one('Rohan Mehta\noffice: 080 2345 6789')
    expect(c.values.phone).toBe('+918023456789')
    expect(c.values.notes).toBeUndefined()
  })

  it('a dropdown value that is not an option is flagged', () => {
    const c = one('Rohan Mehta\nrole: boss')
    expect(c.values.fields).toBeUndefined()
    expect(c.warnings[0]).toMatch(/^Role in deal: /)
  })

  it('a key on a sheet column of another template', () => {
    const c = one('Kiran\ncheque: 50L', { ...ctx, sheet: sheetOf('investors') })
    expect(c.values.fields).toMatchObject({ chequeSize: 5_000_000 })
  })
})

describe('next actions and dates (IST, forward)', () => {
  it.each([
    [
      'next: fri 4pm send ROI note',
      { date: { date: '2026-11-06', precision: 'day' }, text: 'send ROI note' },
    ],
    [
      'next: mid Nov plant visit',
      { date: { date: '2026-11-15', precision: 'mid-month' }, text: 'plant visit' },
    ],
    [
      'next: early Dec board pack',
      { date: { date: '2026-12-05', precision: 'early-month' }, text: 'board pack' },
    ],
    ['next: 12 Nov demo', { date: { date: '2026-11-12', precision: 'day' }, text: 'demo' }],
    [
      'next: tomorrow call back',
      { date: { date: '2026-11-06', precision: 'day' }, text: 'call back' },
    ],
    [
      'NEXT: Dec 2026 renewal',
      { date: { date: '2026-12-01', precision: 'month' }, text: 'renewal' },
    ],
    ['next: call him', { date: null, text: 'call him' }],
  ])('%s', (line, expected) => {
    expect(one(`Rohan Mehta\n${line}`).values.nextAction).toEqual(expected)
  })

  it('a next action without a date is a likely one', () => {
    expect(conf(one('Rohan Mehta\nnext: call him'), 'nextAction')).toBe('medium')
  })

  it('next date fills only the date', () => {
    expect(one('Rohan Mehta\nnext date: late Nov').values.nextAction).toEqual({
      text: '',
      date: { date: '2026-11-25', precision: 'late-month' },
    })
  })
})

describe('introduced by and connects to match people in every tab', () => {
  it('via: a first name that is unique', () => {
    const c = one('Rohan Mehta\nvia: Krithik')
    expect(c.values.introducedBy).toEqual({ kind: 'row', rowId: 'r-krithik' })
    expect(c.preview.find((p) => p.key === 'introducedBy')?.display).toBe(
      'Krithik Iyer · Dawar · Connectors',
    )
    expect(conf(c, 'introducedBy')).toBe('medium')
  })

  it('intro: the full name is a sure match', () => {
    expect(conf(one('Rohan Mehta\nintro: Krithik Iyer'), 'introducedBy')).toBe('high')
  })

  it('a match in another member’s tab', () => {
    const c = one('Rohan Mehta\nvia: Sunita Kulkarni')
    expect(c.values.introducedBy).toEqual({ kind: 'row', rowId: 'r-sunita' })
    expect(c.preview.find((p) => p.key === 'introducedBy')?.display).toContain('Dhruv · Customers')
  })

  it('several matches stay as text', () => {
    const c = one('Rohan Mehta\nvia: Arvind')
    expect(c.values.introducedBy).toEqual({ kind: 'text', text: 'Arvind' })
    expect(conf(c, 'introducedBy')).toBe('low')
  })

  it('someone not in the CRM yet stays as text', () => {
    expect(one('Rohan Mehta\nvia: Priya Shah').values.introducedBy).toEqual({
      kind: 'text',
      text: 'Priya Shah',
    })
  })

  it('connects to: several, matched or kept as text', () => {
    expect(one('Rohan Mehta\nconnects: Krithik, Tata Steel').values.connectsTo).toEqual([
      { kind: 'row', rowId: 'r-krithik' },
      { kind: 'text', text: 'Tata Steel' },
    ])
  })
})

// ---------- Tags ----------

describe('tags and warmth', () => {
  it.each([
    ['#warm', 'warm'],
    ['#waiting', 'waiting'],
    ['#cold', 'cold'],
    ['#Warm', 'warm'],
  ])('%s sets warmth', (line, warmth) => {
    const c = one(`Rohan Mehta\n${line}`)
    expect(c.values.warmth).toBe(warmth)
    expect(c.values.tagIds).toBeUndefined()
  })

  it.each([
    ['#foundry', ['t-foundry'], []],
    ['#Foundry', ['t-foundry'], []],
    ['#pilot_candidate', ['t-pilot'], []],
    ['#pilot-candidate', ['t-pilot'], []],
    ['#defence', [], ['defence']],
    ['#defence #defence', [], ['defence']],
    ['#warm #foundry #newone', ['t-foundry'], ['newone']],
    ['tags: foundry, defence', ['t-foundry'], ['defence']],
  ])('%s', (line, ids, created) => {
    const c = one(`Rohan Mehta\n${line}`)
    expect(c.values.tagIds ?? []).toEqual(ids)
    expect(c.newTags).toEqual(created)
  })

  it('a new tag is a likely field, shown as new', () => {
    const c = one('Rohan Mehta\n#defence')
    expect(c.preview.find((p) => p.key === 'tags')).toMatchObject({
      display: 'defence (new)',
      confidence: 'medium',
    })
  })

  it('tags on the first line', () => {
    expect(one('Rohan Mehta #foundry #warm').values).toMatchObject({
      name: 'Rohan Mehta',
      tagIds: ['t-foundry'],
      warmth: 'warm',
    })
  })
})

// ---------- Nothing dropped ----------

describe('nothing is dropped', () => {
  it('free text on later lines goes to Notes', () => {
    expect(one('Rohan Mehta\nmet at the Pune expo').values.notes).toBe('met at the Pune expo')
  })

  it('several free lines stay as lines', () => {
    expect(one('Rohan Mehta\nline one\nline two').values.notes).toBe('line one\nline two')
  })

  it('a LinkedIn profile: headline as title and company, the rest in Notes', () => {
    const c = one(
      'Rohan Mehta\nPlant Head at Hosur Precision Forge\nHosur, Tamil Nadu, India\n500+ connections',
    )
    expect(c.values).toMatchObject({
      name: 'Rohan Mehta',
      title: 'Plant Head',
      company: 'Hosur Precision Forge',
    })
    expect(c.values.notes).toBe('Hosur, Tamil Nadu, India\n500+ connections')
  })

  it('an email signature', () => {
    const c = one(
      'Rohan Mehta\nPlant Head | Hosur Precision Forge\nM: +91 98450 12345 | rohan@hpf.in\nwww.hpf.in',
    )
    expect(c.values).toMatchObject({
      name: 'Rohan Mehta',
      title: 'Plant Head',
      company: 'Hosur Precision Forge',
      phone: '+919845012345',
      email: 'rohan@hpf.in',
      links: ['www.hpf.in'],
    })
    expect(c.values.notes).toBeUndefined()
  })

  it('mixed order still lands every field', () => {
    const c = one(
      'Rohan Mehta\n#warm stage: first call rohan@hpf.in\nnext: fri ROI note 98450 12345',
    )
    expect(c.values).toMatchObject({
      warmth: 'warm',
      stageIndex: 2,
      email: 'rohan@hpf.in',
    })
    // A value runs to the end of its line: the phone after next: stays in the action.
    expect(c.values.nextAction?.date).toEqual({ date: '2026-11-06', precision: 'day' })
  })
})

// ---------- Several contacts ----------

describe('several contacts in one paste', () => {
  it('a blank line separates them', () => {
    const list = contacts('Rohan Mehta @ HPF\n#warm\n\nSunita Kulkarni @ Deccan Castings\n#cold')
    expect(list.map((c) => [c.values.name, c.values.company, c.values.warmth])).toEqual([
      ['Rohan Mehta', 'HPF', 'warm'],
      ['Sunita Kulkarni', 'Deccan Castings', 'cold'],
    ])
  })

  it('three, with spaces on the blank lines', () => {
    expect(contacts('A One\n  \nB Two\n\t\nC Three').map((c) => c.values.name)).toEqual([
      'A One',
      'B Two',
      'C Three',
    ])
  })

  it('each keeps its own fields', () => {
    const [a, b] = contacts('A One\nphone: 98450 12345\n\nB Two\nemail: b@two.in')
    expect(a?.values.phone).toBe('+919845012345')
    expect(a?.values.email).toBeUndefined()
    expect(b?.values.email).toBe('b@two.in')
  })
})

// ---------- The example from CLAUDE.md ----------

describe('the full example', () => {
  it('reads every field', () => {
    const c = one(
      [
        'Rohan Mehta / Plant Head @ Hosur Precision Forge, Hosur',
        'why: 4 heading lines, unplanned downtime is his KPI',
        '+91 98450 12345  rohan@hpf.in  linkedin.com/in/rohanmehta',
        'via: Krithik  #warm #foundry  stage: first call',
        'next: fri 4pm send ROI note',
      ].join('\n'),
    )
    expect(c.values).toEqual({
      name: 'Rohan Mehta',
      title: 'Plant Head',
      company: 'Hosur Precision Forge',
      phone: '+919845012345',
      email: 'rohan@hpf.in',
      linkedin: 'linkedin.com/in/rohanmehta',
      introducedBy: { kind: 'row', rowId: 'r-krithik' },
      warmth: 'warm',
      tagIds: ['t-foundry'],
      stageIndex: 2,
      nextAction: { date: { date: '2026-11-06', precision: 'day' }, text: 'send ROI note' },
      fields: { plantLocation: 'Hosur' },
      notes: '4 heading lines, unplanned downtime is his KPI',
    })
    expect(c.warnings).toEqual([])
    expect(c.preview[0]).toMatchObject({ key: 'name', display: 'Rohan Mehta' })
  })
})

// ---------- Logging a touch ----------

describe('> logs a touch on the selected row', () => {
  function touch(text: string) {
    const result = parseQuickAdd(text, ctx)
    if (result.kind !== 'touch') throw new Error('expected a touch')
    return result.touch
  }

  it('a call, and the dated part is the next action', () => {
    expect(touch('> called, wants pilot on line 3, quote by 15 nov')).toEqual({
      kind: 'call',
      text: 'Called, wants pilot on line 3, quote by 15 nov',
      nextAction: { date: { date: '2026-11-15', precision: 'day' }, text: 'Quote' },
      preview: expect.any(Array),
    })
  })

  it.each([
    ['> met at the plant', 'meeting'],
    ['> visited Hosur', 'meeting'],
    ['> whatsapp sent the deck', 'whatsapp'],
    ['> emailed the ROI note', 'email'],
    ['> sent the deck', 'note'],
  ])('%s', (text, kind) => {
    expect(touch(text).kind).toBe(kind)
  })

  it('next: names the next action outright', () => {
    expect(touch('> met at plant, next: fri send proposal')).toMatchObject({
      text: 'Met at plant',
      nextAction: { date: { date: '2026-11-06', precision: 'day' }, text: 'send proposal' },
    })
  })

  it('a fuzzy date', () => {
    expect(touch('> whatsapp, follow up mid nov').nextAction).toEqual({
      date: { date: '2026-11-15', precision: 'mid-month' },
      text: 'Follow up',
    })
  })

  it('no date, no next action', () => {
    expect(touch('> sent the deck').nextAction).toBeNull()
  })
})
