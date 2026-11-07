/**
 * Keeps a next action's calendar event in step with CRM edits (Phase 2, C5), for both
 * repositories: one queue per row so an edit and its undo reach Google in order, and a memo of
 * events removed by an edit so the undo can put them back.
 */
import { type FollowUp, nextActionFollowUp } from '@/domain/calendar/followUp'
import type { Id, Row } from '@/domain/types'

type Run = (rowId: Id, followUp: Exclude<FollowUp, null>) => Promise<void>

export class NextActionFollowUps {
  private readonly run: Run
  private readonly removed = new Map<Id, string | null>()
  private readonly queues = new Map<Id, Promise<void>>()

  constructor(run: Run) {
    this.run = run
  }

  /** After a row edit: queues the event change it calls for, if any. Never throws. */
  after(before: Row, after: Row): Promise<void> {
    const followUp = nextActionFollowUp(before, after, this.removed.get(after.id))
    if (!followUp) return Promise.resolve()
    if (followUp.op === 'remove') this.removed.set(after.id, before.nextActionEvent?.time ?? null)
    else this.removed.delete(after.id)
    const queued = (this.queues.get(after.id) ?? Promise.resolve())
      .then(() => this.run(after.id, followUp))
      // A failed update leaves Google as it was; the next edit or "Add again" puts it right.
      .catch(() => undefined)
    this.queues.set(after.id, queued)
    return queued
  }

  /** The member added or removed the event themselves: nothing to bring back. */
  forget(rowId: Id): void {
    this.removed.delete(rowId)
  }
}
