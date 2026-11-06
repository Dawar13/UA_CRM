import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClearWeekArt } from '@/features/calendar-panel/ClearWeekArt'

function cells() {
  return [...screen.getByTestId('clear-week-art').querySelectorAll('rect')]
}

describe('ClearWeekArt', () => {
  it('draws seven days from today, four parts of each, labelled from today', () => {
    render(<ClearWeekArt today="2026-11-05" now={new Date('2026-11-05T10:00:00+05:30')} />)
    const art = screen.getByTestId('clear-week-art')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    expect(cells()).toHaveLength(28)
    const labels = [...art.querySelectorAll('text')].map((t) => t.textContent)
    expect(labels.slice(0, 7)).toEqual(['THU', 'FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED'])
    expect(labels.slice(7)).toEqual(['9', '12', '3', '6'])
  })

  it('marks the part of today we are in with the deep blue', () => {
    // 4:30 pm IST: the afternoon slot (from 3 pm), the third row of today's column.
    render(<ClearWeekArt today="2026-11-05" now={new Date('2026-11-05T16:30:00+05:30')} />)
    const today = cells().filter((_, i) => i < 4)
    expect(today.map((c) => c.style.fill)).toEqual([
      'var(--stage-track)',
      'var(--stage-track)',
      'var(--stage6)',
      'var(--stage2)',
    ])
  })

  it('has no "now" before the working day starts', () => {
    render(<ClearWeekArt today="2026-11-05" now={new Date('2026-11-05T07:00:00+05:30')} />)
    expect(cells().some((c) => c.style.fill === 'var(--stage6)')).toBe(false)
  })
})
