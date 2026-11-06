import { describe, expect, it } from 'vitest'
import { findDuplicateMatches, jaroWinkler, pairKey, scoreDuplicate } from '@/domain/dedupe/score'

const row = (
  id: string,
  name: string,
  extra: Partial<{ phone: string; email: string; linkedin: string; company: string }> = {},
) => ({ id, name, phone: '', email: '', linkedin: '', company: '', ...extra })

describe('jaroWinkler', () => {
  it('is 1 for the same text and 0 for nothing in common', () => {
    expect(jaroWinkler('martha', 'martha')).toBe(1)
    expect(jaroWinkler('abc', 'xyz')).toBe(0)
    expect(jaroWinkler('', 'abc')).toBe(0)
  })

  it('matches the textbook values', () => {
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 3)
    expect(jaroWinkler('dwayne', 'duane')).toBeCloseTo(0.84, 2)
    expect(jaroWinkler('dixon', 'dicksonx')).toBeCloseTo(0.813, 3)
  })
})

describe('hard matches block a save', () => {
  it.each([
    [{ name: 'X', phone: '098450 12345' }, row('r1', 'Rohan', { phone: '+919845012345' }), 'phone'],
    [
      { name: 'X', email: ' Rohan@HPF.in ' },
      row('r1', 'Rohan', { email: 'rohan@hpf.in' }),
      'email',
    ],
    [
      { name: 'X', linkedin: 'https://www.linkedin.com/in/RohanMehta/' },
      row('r1', 'Rohan', { linkedin: 'linkedin.com/in/rohanmehta' }),
      'linkedin',
    ],
  ])('%#: same %s', (input, existing, reason) => {
    expect(scoreDuplicate(input, existing)).toEqual({ rowId: 'r1', level: 'hard', reason })
  })
})

describe('soft matches are a banner', () => {
  it.each([
    ['Rohan Mehta', 'Rohan Mehta'],
    ['Dr. Rohan Mehta', 'Rohan Mehta'],
    ['Cdr Arvind Menon', 'Arvind Menon'],
    ['Navaneetha Krishnan', 'Navaneethakrishnan'],
    ['Rohan  Mehta', 'rohan mehta'],
    ['Rohan Mehtaa', 'Rohan Mehta'],
    ['Shri Rajesh Agarwal', 'Rajesh Agarwal'],
  ])('%s and %s', (a, b) => {
    expect(scoreDuplicate({ name: a }, row('r1', b))).toMatchObject({
      level: 'soft',
      reason: 'name',
    })
  })

  it('the same first name at the same company', () => {
    expect(
      scoreDuplicate(
        { name: 'Rohan M', company: 'Hosur Precision Forge Pvt Ltd' },
        row('r1', 'Rohan Mehta', { company: 'Hosur Precision Forge' }),
      ),
    ).toMatchObject({ level: 'soft', reason: 'first-name-company' })
  })
})

describe('no alert', () => {
  it.each([
    // The same first name at a different company.
    [{ name: 'Rohan Kapoor', company: 'Tata Steel' }, row('r1', 'Rohan Mehta', { company: 'HPF' })],
    // One common word.
    [{ name: 'Rohan' }, row('r1', 'Rohan Mehta')],
    [{ name: 'Priya Nair' }, row('r1', 'Priya Sharma')],
    [{ name: 'Anil Reddy' }, row('r1', 'Sunil Reddy')],
    // Nothing given but a name.
    [{ name: 'Kavya Iyer' }, row('r1', 'Lakshmi Iyer')],
  ])('%#', (input, existing) => {
    expect(scoreDuplicate(input, existing)).toBeNull()
  })
})

describe('findDuplicateMatches', () => {
  const rows = [
    row('r1', 'Rohan Mehta', { phone: '+919845012345' }),
    row('r2', 'Rohan Mehta'),
    row('r3', 'Sunita Kulkarni'),
  ]

  it('lists hard matches first and skips the row itself', () => {
    expect(findDuplicateMatches({ name: 'Rohan Mehta', phone: '9845012345' }, rows)).toEqual([
      { rowId: 'r1', level: 'hard', reason: 'phone' },
      { rowId: 'r2', level: 'soft', reason: 'name' },
    ])
    expect(
      findDuplicateMatches({ name: 'Rohan Mehta' }, rows, { selfId: 'r2' }).map((m) => m.rowId),
    ).toEqual(['r1'])
  })

  it('forgets pairs remembered as different people', () => {
    expect(
      findDuplicateMatches({ name: 'Rohan Mehta' }, rows, {
        selfId: 'r2',
        notDuplicate: new Set([pairKey('r1', 'r2')]),
      }),
    ).toEqual([])
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'))
  })
})
