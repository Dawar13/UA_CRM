import { describe, expect, it } from 'vitest'
import { mergeIntoRow } from '@/domain/dedupe/merge'
import { newRow } from '@/domain/rows'
import { buildSheetSchema } from '@/domain/templates'
import type { Sheet } from '@/domain/types'

const NOW = new Date('2026-11-05T10:00:00+05:30')
let n = 0
const newId = () => `id-${++n}`
const { columns, stages } = buildSheetSchema('customers', newId)
const sheet: Sheet = {
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

const existing = newRow(
  sheet,
  {
    name: 'Rohan Mehta',
    title: 'Plant Head',
    tagIds: ['t1'],
    links: ['hpf.in'],
    fields: { plantLocation: 'Hosur' },
  },
  { id: 'r1', position: 0 },
  { now: NOW, actorId: 'm1', newId },
).row

describe('mergeIntoRow', () => {
  it('fills empty fields only and adds tags and links', () => {
    const { patch, conflicts } = mergeIntoRow(existing, {
      name: 'Rohan Mehta',
      company: 'HPF',
      phone: '+919845012345',
      tagIds: ['t1', 't2'],
      links: ['hpf.in', 'x.example'],
      fields: { pain: 'Downtime' },
      notes: 'Met at the expo',
    })
    expect(patch).toEqual({
      company: 'HPF',
      phone: '+919845012345',
      tagIds: ['t1', 't2'],
      links: ['hpf.in', 'x.example'],
      fields: { plantLocation: 'Hosur', pain: 'Downtime' },
      notes: 'Met at the expo',
    })
    expect(conflicts).toEqual([])
  })

  it('keeps the row’s own values and lists the conflicts side by side', () => {
    const { patch, conflicts } = mergeIntoRow(existing, {
      name: 'Rohan Mehta',
      title: 'Head of Plant',
      fields: { plantLocation: 'Pune' },
    })
    expect(patch).toEqual({})
    expect(conflicts).toEqual([
      { label: 'Title', kept: 'Plant Head', offered: 'Head of Plant' },
      { label: 'plantLocation', kept: 'Hosur', offered: 'Pune' },
    ])
  })
})
