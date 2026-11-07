import { describe, expect, it } from 'vitest'
import { hasExactDay, nextActionFollowUp } from '@/domain/calendar/followUp'
import type { Row } from '@/domain/types'

type Part = Pick<Row, 'nextAction' | 'nextActionEvent'>

const day = (date: string) => ({ date, precision: 'day' as const })
const linked = { id: 'evt-1', time: '16:00', state: 'linked' as const }

const row = (next: Row['nextAction'], event: Row['nextActionEvent'] = null): Part => ({
  nextAction: next,
  nextActionEvent: event,
})

describe('nextActionFollowUp', () => {
  const before = row({ text: 'Send ROI note', date: day('2026-11-13') }, linked)

  it('updates the event when the text or the day changes, keeping its time', () => {
    expect(
      nextActionFollowUp(before, row({ text: 'Send ROI note', date: day('2026-11-16') }, linked)),
    ).toEqual({ op: 'save', time: '16:00' })
    expect(
      nextActionFollowUp(before, row({ text: 'Send the quote', date: day('2026-11-13') }, linked)),
    ).toEqual({ op: 'save', time: '16:00' })
  })

  it('does nothing when the next action did not change', () => {
    expect(nextActionFollowUp(before, before)).toBeNull()
  })

  it('removes the event when the day becomes fuzzy or the next action is cleared', () => {
    const fuzzy = { date: '2026-11-15', precision: 'mid-month' as const }
    expect(nextActionFollowUp(before, row({ text: 'Send ROI note', date: fuzzy }, linked))).toEqual(
      {
        op: 'remove',
      },
    )
    expect(nextActionFollowUp(before, row(null, linked))).toEqual({ op: 'remove' })
  })

  it('brings a removed event back at its old time when the edit is undone', () => {
    const cleared = row(null)
    expect(
      nextActionFollowUp(cleared, before.nextAction ? row(before.nextAction) : cleared, '16:00'),
    ).toEqual({
      op: 'save',
      time: '16:00',
    })
    expect(nextActionFollowUp(cleared, row(before.nextAction))).toBeNull()
  })

  it('leaves events removed in Google alone (the member chooses "Add again")', () => {
    const gone = row(before.nextAction, { ...linked, state: 'removed_in_google' })
    expect(
      nextActionFollowUp(
        gone,
        row({ text: 'Send ROI note', date: day('2026-11-20') }, gone.nextActionEvent),
      ),
    ).toBeNull()
  })

  it('knows an exact day', () => {
    expect(hasExactDay(before)).toBe(true)
    expect(hasExactDay(row({ text: 'x', date: { date: '2026-11-01', precision: 'month' } }))).toBe(
      false,
    )
    expect(hasExactDay(row(null))).toBe(false)
  })
})
