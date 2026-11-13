import { describe, expect, it } from 'vitest'
import {
  type Action,
  type Actor,
  assertCan,
  can,
  check,
  denialMessage,
  PermissionDenied,
} from '@/domain/permissions'

const dawar: Actor = { id: 'm-dawar', isAdmin: true, active: true }
const dhruv: Actor = { id: 'm-dhruv', isAdmin: true, active: true }
const asha: Actor = { id: 'm-asha', isAdmin: false, active: true }
const gone: Actor = { id: 'm-gone', isAdmin: true, active: false }

const dawarsRow = { memberId: 'm-dawar' }
const dhruvsRow = { memberId: 'm-dhruv' }

/** Every action that changes a tab and takes the tab's sheet or row as its target. */
const ownerActions = [
  'editRow',
  'addRow',
  'deleteRow',
  'addHistory',
  'editHistory',
  'manageSheet',
  'manageColumns',
  'manageStages',
  'manageFiles',
  'viewTrash',
  // Marking a meeting held or missed (D-059): the target is the calendar's member.
  'markMeeting',
] as const satisfies readonly Action[]

const readActions = ['view', 'contact', 'copyCell', 'export'] as const satisfies readonly Action[]

describe('can: reading', () => {
  it.each(readActions)('%s works in your own tab and in every other tab', (action) => {
    expect(can(dawar, action, dawarsRow)).toBe(true)
    expect(can(dawar, action, dhruvsRow)).toBe(true)
    expect(can(asha, action, dhruvsRow)).toBe(true)
  })

  it('search needs no target', () => {
    expect(can(asha, 'search')).toBe(true)
  })

  it('a signed-out or deactivated member reads nothing', () => {
    expect(check(null, 'view', dawarsRow)).toEqual({ allowed: false, reason: 'signed-out' })
    expect(check(undefined, 'search')).toEqual({ allowed: false, reason: 'signed-out' })
    expect(check(gone, 'view', { memberId: gone.id })).toEqual({
      allowed: false,
      reason: 'inactive',
    })
  })
})

describe('can: changing a tab', () => {
  it.each(ownerActions)('%s is allowed in your own tab only', (action) => {
    expect(can(dawar, action, dawarsRow)).toBe(true)
    expect(check(dawar, action, dhruvsRow)).toEqual({ allowed: false, reason: 'not-owner' })
    expect(can(dhruv, action, dhruvsRow)).toBe(true)
    expect(can(dhruv, action, dawarsRow)).toBe(false)
  })

  it.each(ownerActions)('admins get no extra rights over data (%s)', (action) => {
    expect(can(dhruv, action, { memberId: asha.id })).toBe(false)
  })

  it.each(ownerActions)('a deactivated member cannot %s, even in their own tab', (action) => {
    expect(check(gone, action, { memberId: gone.id })).toEqual({
      allowed: false,
      reason: 'inactive',
    })
  })
})

describe('can: across tabs', () => {
  it("links are stored on your side: the source row must be yours, the target can be anyone's", () => {
    expect(can(dawar, 'linkRows', { source: dawarsRow, target: dhruvsRow })).toBe(true)
    expect(can(dawar, 'linkRows', { source: dawarsRow, target: dawarsRow })).toBe(true)
    expect(can(dawar, 'linkRows', { source: dhruvsRow, target: dawarsRow })).toBe(false)
  })

  it("copy to my sheet takes another member's row into one of your sheets", () => {
    expect(can(dawar, 'copyToMySheet', { source: dhruvsRow, destination: dawarsRow })).toBe(true)
    expect(check(dawar, 'copyToMySheet', { source: dawarsRow, destination: dawarsRow })).toEqual({
      allowed: false,
      reason: 'already-yours',
    })
    expect(check(dawar, 'copyToMySheet', { source: dhruvsRow, destination: dhruvsRow })).toEqual({
      allowed: false,
      reason: 'not-owner',
    })
  })

  it('merging needs both rows to be yours', () => {
    expect(can(dawar, 'mergeRows', { rows: [dawarsRow, dawarsRow] })).toBe(true)
    expect(can(dawar, 'mergeRows', { rows: [dawarsRow, dhruvsRow] })).toBe(false)
    expect(can(dawar, 'mergeRows', { rows: [] })).toBe(false)
  })

  it('"different person" is remembered by whoever owns one of the pair', () => {
    expect(can(dawar, 'markNotDuplicate', { rows: [dawarsRow, dhruvsRow] })).toBe(true)
    expect(can(asha, 'markNotDuplicate', { rows: [dawarsRow, dhruvsRow] })).toBe(false)
  })
})

describe('can: tags', () => {
  it('any member creates a tag', () => {
    expect(can(asha, 'createTag')).toBe(true)
    expect(can(gone, 'createTag')).toBe(false)
  })

  it.each(['editTag', 'deleteTag'] as const)(
    '%s: only the creator, while nobody else uses it',
    (action) => {
      const unused = { createdBy: dawar.id, usedBy: [] }
      const onlyMine = { createdBy: dawar.id, usedBy: [{ memberId: dawar.id, name: 'Dawar' }] }
      expect(can(dawar, action, unused)).toBe(true)
      expect(can(dawar, action, onlyMine)).toBe(true)
      expect(check(dhruv, action, unused)).toEqual({ allowed: false, reason: 'not-tag-creator' })
      expect(check(dhruv, action, { createdBy: null, usedBy: [] })).toEqual({
        allowed: false,
        reason: 'not-tag-creator',
      })
    },
  )

  it('a tag another member uses is refused, naming every such member once', () => {
    const permission = check(dawar, 'editTag', {
      createdBy: dawar.id,
      usedBy: [
        { memberId: dawar.id, name: 'Dawar' },
        { memberId: dhruv.id, name: 'Dhruv' },
        { memberId: asha.id, name: 'Asha' },
        { memberId: dhruv.id, name: 'Dhruv' },
      ],
    })
    expect(permission).toEqual({ allowed: false, reason: 'tag-in-use', names: ['Asha', 'Dhruv'] })
  })
})

describe('can: the team', () => {
  it('only admins add members', () => {
    expect(can(dawar, 'addMember')).toBe(true)
    expect(check(asha, 'addMember')).toEqual({ allowed: false, reason: 'not-admin' })
  })

  it.each(['setMemberActive', 'setMemberAdmin'] as const)(
    '%s: admins change others, nobody changes themselves',
    (action) => {
      expect(can(dawar, action, { memberId: asha.id })).toBe(true)
      expect(check(dawar, action, { memberId: dawar.id })).toEqual({
        allowed: false,
        reason: 'self',
      })
      expect(check(asha, action, { memberId: asha.id })).toEqual({ allowed: false, reason: 'self' })
      expect(check(asha, action, { memberId: dawar.id })).toEqual({
        allowed: false,
        reason: 'not-admin',
      })
    },
  )

  it('a member renames themselves; admins rename anyone', () => {
    expect(can(asha, 'renameMember', { memberId: asha.id })).toBe(true)
    expect(can(asha, 'renameMember', { memberId: dawar.id })).toBe(false)
    expect(can(dawar, 'renameMember', { memberId: asha.id })).toBe(true)
  })
})

describe('assertCan and denialMessage', () => {
  it('throws a PermissionDenied with a message ready for a toast', () => {
    expect(() => assertCan(dawar, 'editRow', dawarsRow)).not.toThrow()
    try {
      assertCan(dawar, 'editRow', dhruvsRow)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionDenied)
      const denied = error as PermissionDenied
      expect(denied.action).toBe('editRow')
      expect(denied.reason).toBe('not-owner')
      expect(denied.message).toBe("Another member's sheets are view only")
    }
  })

  it('words every refusal in plain, British sentence case', () => {
    expect(denialMessage({ allowed: false, reason: 'not-owner' }, 'Dhruv')).toBe(
      "Dhruv's sheets are view only",
    )
    expect(denialMessage({ allowed: false, reason: 'signed-out' })).toBe('Sign in to make changes')
    expect(denialMessage({ allowed: false, reason: 'inactive' })).toBe(
      'This account is no longer active on the UA team',
    )
    expect(denialMessage({ allowed: false, reason: 'not-admin' })).toBe(
      'Only an admin can change the team',
    )
    expect(denialMessage({ allowed: false, reason: 'self' })).toBe(
      "You can't change your own admin or active status",
    )
    expect(denialMessage({ allowed: false, reason: 'not-tag-creator' })).toBe(
      'Only the member who created this tag can change it',
    )
    expect(denialMessage({ allowed: false, reason: 'already-yours' })).toBe(
      'This row is already in your tab',
    )
    expect(denialMessage({ allowed: false, reason: 'tag-in-use', names: ['Dhruv'] })).toBe(
      "This tag is used on Dhruv's rows",
    )
    expect(
      denialMessage({ allowed: false, reason: 'tag-in-use', names: ['Asha', 'Dhruv', 'Krithik'] }),
    ).toBe("This tag is used on Asha's, Dhruv's and Krithik's rows")
  })
})
