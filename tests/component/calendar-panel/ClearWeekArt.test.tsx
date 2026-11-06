import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from '@/components/ui/EmptyState'
import { ClearWeekArt } from '@/features/calendar-panel/ClearWeekArt'

function cells(testId: string) {
  return [...screen.getByTestId(testId).querySelectorAll('rect')]
}

describe('the empty-state heatmap', () => {
  it('is the art of every empty state: 7 by 4 cells, no labels, decorative', () => {
    render(<EmptyState title="No sheets yet." description="Dhruv has not made any sheets yet." />)
    const art = screen.getByTestId('empty-state-art')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    expect(cells('empty-state-art')).toHaveLength(28)
    expect(art.querySelectorAll('text')).toHaveLength(0)
    // The first column's top cell is the deep blue.
    expect(cells('empty-state-art')[0]?.style.fill).toBe('var(--stage6)')
  })
})

describe('ClearWeekArt', () => {
  it('labels the parts of the day, and not the days', () => {
    render(<ClearWeekArt today="2026-11-05" now={new Date('2026-11-05T10:00:00+05:30')} />)
    const labels = [...screen.getByTestId('clear-week-art').querySelectorAll('text')].map(
      (t) => t.textContent,
    )
    expect(labels).toEqual(['9', '12', '3', '6'])
    expect(cells('clear-week-art')).toHaveLength(28)
  })

  it('marks the part of today we are in with the deep blue', () => {
    // 4:30 pm IST: the afternoon slot (from 3 pm), the third row of today's column.
    render(<ClearWeekArt today="2026-11-05" now={new Date('2026-11-05T16:30:00+05:30')} />)
    const today = cells('clear-week-art').slice(0, 4)
    expect(today.map((c) => c.style.fill)).toEqual([
      'var(--stage-track)',
      'var(--stage-track)',
      'var(--stage6)',
      'var(--stage2)',
    ])
  })

  it('has no "now" before the working day starts', () => {
    render(<ClearWeekArt today="2026-11-05" now={new Date('2026-11-05T07:00:00+05:30')} />)
    expect(cells('clear-week-art').some((c) => c.style.fill === 'var(--stage6)')).toBe(false)
  })
})
