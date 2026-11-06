import { describe, expect, it } from 'vitest'
import { parseMember, toMember } from '@/data/supabase/mappers'

const record = {
  id: '6f0b8a52-1111-4222-8333-944445555666',
  slug: 'dhruv',
  name: 'Dhruv',
  email: 'dhruv@example.test',
  position: 1,
  is_admin: true,
  active: true,
  created_at: '2026-11-06T14:53:00.000Z',
}

describe('members read from Supabase', () => {
  it('maps a stored member to the domain shape', () => {
    expect(toMember(record)).toEqual({
      id: record.id,
      slug: 'dhruv',
      name: 'Dhruv',
      email: 'dhruv@example.test',
      position: 1,
      isAdmin: true,
      active: true,
      createdAt: '2026-11-06T14:53:00.000Z',
    })
  })

  // 7 Nov 2026: a placeholder pasted unchanged into the SQL editor made the whole team list
  // fail to load, and every page showed "This page doesn't exist".
  it('keeps a member whose stored email is malformed, so the team list still loads', () => {
    const member = toMember({ ...record, email: "<Dhruv's login email>" })
    expect(member.name).toBe('Dhruv')
    expect(member.email).toBe("<Dhruv's login email>")
    expect(
      parseMember({
        id: record.id,
        slug: 'dhruv',
        name: 'Dhruv',
        email: 'not an email',
        position: 1,
        isAdmin: true,
        active: true,
        createdAt: '2026-11-06T14:53:00.000Z',
      }).email,
    ).toBe('not an email')
  })

  it('still rejects a row that is not a member at all', () => {
    expect(() => toMember({ ...record, slug: 'Not A Slug' })).toThrow()
  })
})
