/**
 * Who may do what (CLAUDE.md §2.14): every member reads every tab; only the owner changes it.
 * The single source of truth for the UI and the local repository; the database enforces the same
 * rules with row-level security (supabase/migrations). Pure: no React, no I/O.
 */
import type { Id, Member } from './types'

/** The signed-in member, as far as permissions are concerned. */
export type Actor = Pick<Member, 'id' | 'isAdmin' | 'active'>

/**
 * Something in a member's tab: a sheet or a row (both carry `memberId`, the owner). For history,
 * files and links, pass the row they hang off; for a new sheet, pass the tab's member as
 * `{ memberId }`.
 */
export interface Owned {
  memberId: Id
}

export interface TagTarget {
  createdBy: Id | null
  /** Every member whose rows use the tag. */
  usedBy: readonly { memberId: Id; name: string }[]
}

/** The target each action is checked against. `undefined` means the action needs none. */
export interface PermissionTargets {
  // Reading works everywhere.
  view: Owned
  search: undefined
  contact: Owned
  copyCell: Owned
  export: Owned
  // Changing a tab: the owner only.
  /** Cells, warmth, stage, next action, the row's tags and its links. */
  editRow: Owned
  /** Add or paste rows, quick-add and import. Target: the sheet. */
  addRow: Owned
  deleteRow: Owned
  addHistory: Owned
  editHistory: Owned
  /** Create, rename, reorder or delete sheets. Target: the sheet, or the tab for a new one. */
  manageSheet: Owned
  manageColumns: Owned
  manageStages: Owned
  manageFiles: Owned
  /** See and restore Trash. Target: the tab. */
  viewTrash: Owned
  // Across tabs.
  /** Introduced by, connects to and "keep both, linked": stored on the source row's side. */
  linkRows: { source: Owned; target: Owned }
  copyToMySheet: { source: Owned; destination: Owned }
  mergeRows: { rows: readonly Owned[] }
  /** "Different person": remembered by whoever owns at least one of the pair. */
  markNotDuplicate: { rows: readonly Owned[] }
  // One shared tag vocabulary.
  createTag: undefined
  editTag: TagTarget
  deleteTag: TagTarget
  // The team.
  addMember: undefined
  setMemberActive: { memberId: Id }
  setMemberAdmin: { memberId: Id }
  renameMember: { memberId: Id }
}

export type Action = keyof PermissionTargets

export type Denial =
  | 'signed-out'
  | 'inactive'
  | 'not-owner'
  | 'not-admin'
  | 'self'
  | 'not-tag-creator'
  | 'tag-in-use'
  | 'already-yours'

export type Permission =
  | { allowed: true }
  | {
      allowed: false
      reason: Denial
      /** For `tag-in-use`: the members whose rows use the tag. */
      names?: readonly string[]
    }

type TargetArgs<A extends Action> = PermissionTargets[A] extends undefined
  ? []
  : [target: PermissionTargets[A]]

const ALLOWED: Permission = { allowed: true }
const deny = (reason: Denial, names?: readonly string[]): Permission =>
  names === undefined ? { allowed: false, reason } : { allowed: false, reason, names }

const READ_ACTIONS = new Set<Action>(['view', 'search', 'contact', 'copyCell', 'export'])
const OWNER_ACTIONS = new Set<Action>([
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
])

/** Whether `actor` may do `action` on `target`, and why not. */
export function check<A extends Action>(
  actor: Actor | null | undefined,
  action: A,
  ...[target]: TargetArgs<A>
): Permission {
  if (actor === null || actor === undefined) return deny('signed-out')
  if (!actor.active) return deny('inactive')
  if (READ_ACTIONS.has(action)) return ALLOWED

  const mine = (owned: Owned) => owned.memberId === actor.id
  if (OWNER_ACTIONS.has(action)) return mine(target as Owned) ? ALLOWED : deny('not-owner')

  switch (action) {
    case 'linkRows': {
      const { source } = target as PermissionTargets['linkRows']
      return mine(source) ? ALLOWED : deny('not-owner')
    }
    case 'copyToMySheet': {
      const { source, destination } = target as PermissionTargets['copyToMySheet']
      if (mine(source)) return deny('already-yours')
      return mine(destination) ? ALLOWED : deny('not-owner')
    }
    case 'mergeRows': {
      const { rows } = target as PermissionTargets['mergeRows']
      return rows.length > 0 && rows.every(mine) ? ALLOWED : deny('not-owner')
    }
    case 'markNotDuplicate': {
      const { rows } = target as PermissionTargets['markNotDuplicate']
      return rows.some(mine) ? ALLOWED : deny('not-owner')
    }
    case 'createTag':
      return ALLOWED
    case 'editTag':
    case 'deleteTag': {
      const tag = target as TagTarget
      if (tag.createdBy !== actor.id) return deny('not-tag-creator')
      const others = [
        ...new Set(tag.usedBy.filter((u) => u.memberId !== actor.id).map((u) => u.name)),
      ].sort((a, b) => a.localeCompare(b))
      return others.length === 0 ? ALLOWED : deny('tag-in-use', others)
    }
    case 'addMember':
      return actor.isAdmin ? ALLOWED : deny('not-admin')
    case 'setMemberActive':
    case 'setMemberAdmin': {
      const { memberId } = target as { memberId: Id }
      if (memberId === actor.id) return deny('self')
      return actor.isAdmin ? ALLOWED : deny('not-admin')
    }
    case 'renameMember': {
      const { memberId } = target as { memberId: Id }
      return memberId === actor.id || actor.isAdmin ? ALLOWED : deny('not-admin')
    }
    default:
      return deny('not-owner')
  }
}

/** Whether `actor` may do `action` on `target`. */
export function can<A extends Action>(
  actor: Actor | null | undefined,
  action: A,
  ...target: TargetArgs<A>
): boolean {
  return check(actor, action, ...target).allowed
}

/** A refused write, from either repository. `message` is ready to show in a toast. */
export class PermissionDenied extends Error {
  readonly action: Action
  readonly reason: Denial
  constructor(
    action: Action,
    permission: Extract<Permission, { allowed: false }>,
    message: string,
  ) {
    super(message)
    this.name = 'PermissionDenied'
    this.action = action
    this.reason = permission.reason
  }
}

/** Throws PermissionDenied unless `actor` may do `action` on `target`. */
export function assertCan<A extends Action>(
  actor: Actor | null | undefined,
  action: A,
  ...target: TargetArgs<A>
): void {
  const permission = check(actor, action, ...target)
  if (!permission.allowed) {
    throw new PermissionDenied(action, permission, denialMessage(permission))
  }
}

/** "Dhruv's", "Dhruv's and Asha's", "A's, B's and C's". */
function possessives(names: readonly string[]): string {
  const owned = names.map((n) => `${n}'s`)
  if (owned.length <= 1) return owned.join('')
  return `${owned.slice(0, -1).join(', ')} and ${owned.at(-1)}`
}

/**
 * Plain words for a refusal (CLAUDE.md §3.5). `ownerName` names the tab's owner for `not-owner`;
 * without it the sentence stays general.
 */
export function denialMessage(
  permission: Extract<Permission, { allowed: false }>,
  ownerName?: string,
): string {
  switch (permission.reason) {
    case 'signed-out':
      return 'Sign in to make changes'
    case 'inactive':
      return 'This account is no longer active on the UA team'
    case 'not-owner':
      return ownerName === undefined
        ? "Another member's sheets are view only"
        : `${ownerName}'s sheets are view only`
    case 'not-admin':
      return 'Only an admin can change the team'
    case 'self':
      return "You can't change your own admin or active status"
    case 'not-tag-creator':
      return 'Only the member who created this tag can change it'
    case 'tag-in-use':
      return `This tag is used on ${possessives(permission.names ?? [])} rows`
    case 'already-yours':
      return 'This row is already in your tab'
  }
}
