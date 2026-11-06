/**
 * Permission checks for the UI, through the same can() the repositories use. Editing controls
 * render only when allowed; an edit keystroke in another member's tab is refused with one short
 * toast per session ("Dhruv's sheets are view only"), and silently after that. In Supabase mode
 * nothing can be edited while offline (writes are never queued).
 */
import { useCallback, useContext } from 'react'
import { toast } from 'sonner'
import { type Action, can, type TargetArgs } from '@/domain/permissions'
import type { Member } from '@/domain/types'
import { useOnline } from '@/lib/useOnline'
import { AuthContext, useActor } from './AuthContext'

export const OFFLINE_MESSAGE = "You're offline. Changes are paused until the connection is back."

/** Whether the signed-in member may do `action` on `target`. */
export function useCan<A extends Action>(action: A, ...target: TargetArgs<A>): boolean {
  return can(useActor(), action, ...target)
}

let viewOnlyNoticed = false

/** Tests: forget that this session was already told about view only. */
export function resetViewOnlyNotice(): void {
  viewOnlyNoticed = false
}

export interface EditGate {
  /** The signed-in member may change this tab right now. */
  editable: boolean
  /** The tab belongs to someone else. */
  viewOnly: boolean
  /** Supabase mode without a connection. */
  offline: boolean
  /** Call when an edit was attempted and refused: says why, once per session for view only. */
  refuse(): void
}

/** Editing in `owner`'s tab. */
export function useEditGate(owner: Pick<Member, 'id' | 'name'>): EditGate {
  const actor = useActor()
  const mode = useContext(AuthContext)?.mode ?? 'local'
  const online = useOnline()
  const viewOnly = !can(actor, 'editRow', { memberId: owner.id })
  const offline = mode === 'supabase' && !online
  const ownerName = owner.name
  const refuse = useCallback(() => {
    if (offline && !viewOnly) {
      toast(OFFLINE_MESSAGE, { id: 'offline' })
      return
    }
    if (viewOnlyNoticed) return
    viewOnlyNoticed = true
    toast(`${ownerName}'s sheets are view only`, { id: 'view-only' })
  }, [offline, viewOnly, ownerName])
  return { editable: !viewOnly && !offline, viewOnly, offline, refuse }
}
