/**
 * What a CRM edit to a next action means for its calendar event (Phase 2, C5): a new text or day
 * updates the event, a fuzzy or cleared date removes it, and undoing that edit puts it back at
 * the time it had. Pure.
 */
import type { Row } from '../types'

export type FollowUp = { op: 'save'; time: string | null } | { op: 'remove' } | null

/** True when the next action has an exact day, so it can sit in a calendar. */
export function hasExactDay(row: Pick<Row, 'nextAction'>): boolean {
  return row.nextAction?.date?.precision === 'day'
}

function sameNextAction(a: Row['nextAction'], b: Row['nextAction']): boolean {
  return (
    (a?.text ?? '') === (b?.text ?? '') &&
    (a?.date?.date ?? null) === (b?.date?.date ?? null) &&
    (a?.date?.precision ?? null) === (b?.date?.precision ?? null)
  )
}

/**
 * The event change a row edit calls for. `removedTime` is the time of an event this rule removed
 * earlier for the same row (undefined when there was none): an undo that makes the day exact
 * again brings the event back.
 */
export function nextActionFollowUp(
  before: Pick<Row, 'nextAction' | 'nextActionEvent'>,
  after: Pick<Row, 'nextAction' | 'nextActionEvent'>,
  removedTime?: string | null,
): FollowUp {
  const linked = before.nextActionEvent?.state === 'linked' ? before.nextActionEvent : null
  if (linked) {
    if (!hasExactDay(after)) return { op: 'remove' }
    return sameNextAction(before.nextAction, after.nextAction)
      ? null
      : { op: 'save', time: linked.time }
  }
  if (removedTime !== undefined && hasExactDay(after) && !after.nextActionEvent) {
    return { op: 'save', time: removedTime }
  }
  return null
}
