/** A contact's history: a meeting the calendar logged can be marked missed, or held again (D-059). */
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryEntry, Member } from '@/domain/types'
import { HistoryList } from '@/features/row-detail/HistoryList'
import { renderUi } from '../ui/renderUi'

const dawar = { id: 'm-dawar', name: 'Dawar' } as Member
const members = new Map([[dawar.id, dawar]])

function entry(over: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: 'h-1',
    rowId: 'r-1',
    kind: 'meeting',
    source: 'calendar',
    at: '2026-11-12T16:00:00.000Z',
    fuzzyDate: null,
    text: 'Call with Rohan',
    memberId: dawar.id,
    ...over,
  }
}

describe('HistoryList', () => {
  it('reads a missed meeting as missed, and offers to mark it held', async () => {
    const onMarkMeeting = vi.fn()
    const missed = entry({ meta: { calendarEventId: 'g-1', missed: true } })
    const { user } = renderUi(
      <HistoryList entries={[missed]} members={members} onMarkMeeting={onMarkMeeting} />,
    )
    expect(screen.getByText('Missed meeting:')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Mark this meeting held' }))
    expect(onMarkMeeting).toHaveBeenCalledWith(missed, 'held')
  })

  it('offers Mark missed on a logged meeting only, and only to the owner', async () => {
    const onMarkMeeting = vi.fn()
    const logged = entry({ id: 'h-2', meta: { calendarEventId: 'g-2', missed: false } })
    const typed = entry({ id: 'h-3', source: 'manual', text: 'Met at CII' })
    const { user, rerender } = renderUi(
      <HistoryList entries={[logged, typed]} members={members} onMarkMeeting={onMarkMeeting} />,
    )
    expect(screen.getAllByRole('button', { name: 'Mark this meeting missed' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Mark this meeting missed' }))
    expect(onMarkMeeting).toHaveBeenCalledWith(logged, 'missed')

    // Another member's row: view only.
    rerender(<HistoryList entries={[logged, typed]} members={members} />)
    expect(screen.queryByRole('button', { name: /mark this meeting/i })).not.toBeInTheDocument()
  })

  it('a new mark shows at once, before the server answers', () => {
    const logged = entry({ meta: { calendarEventId: 'g-1', missed: false } })
    renderUi(
      <HistoryList
        entries={[logged]}
        members={members}
        outcomes={new Map([['g-1', 'missed']])}
        onMarkMeeting={vi.fn()}
      />,
    )
    expect(screen.getByText('Missed meeting:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark this meeting held' })).toBeInTheDocument()
  })
})
