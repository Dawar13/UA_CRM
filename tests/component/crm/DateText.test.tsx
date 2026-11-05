import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateText, toFuzzyDate } from '@/components/crm/DateText'
import { freezeClock, renderUi, restoreClock } from '../ui/renderUi'

beforeEach(() => freezeClock())
afterEach(() => restoreClock())

const time = () => document.querySelector('time') as HTMLTimeElement

describe('toFuzzyDate', () => {
  it('reads ISO dates and instants (in IST)', () => {
    expect(toFuzzyDate('2026-11-04')).toEqual({ date: '2026-11-04', precision: 'day' })
    expect(toFuzzyDate('2026-11-04T20:00:00Z')).toEqual({ date: '2026-11-05', precision: 'day' })
    const fuzzy = { date: '2026-10-15', precision: 'mid-month' } as const
    expect(toFuzzyDate(fuzzy)).toBe(fuzzy)
  })
})

describe('DateText', () => {
  it('renders nothing for null', () => {
    const { container } = renderUi(<DateText date={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('writes exact dates as "4 Nov", with the year when not current', () => {
    const { rerender } = renderUi(<DateText date="2026-11-04" />)
    expect(time()).toHaveTextContent('4 Nov')
    expect(time()).toHaveAttribute('datetime', '2026-11-04')
    rerender(<DateText date="2025-03-12" />)
    expect(time()).toHaveTextContent('12 Mar 2025')
  })

  it('shows instants in IST', () => {
    renderUi(<DateText date="2026-11-04T20:00:00Z" />)
    expect(time()).toHaveTextContent('5 Nov')
  })

  it('writes fuzzy dates as written', () => {
    renderUi(<DateText date={{ date: '2026-10-15', precision: 'mid-month' }} />)
    expect(time()).toHaveTextContent('Mid Oct')
    expect(time()).toHaveAttribute('datetime', '2026-10')
  })

  it('shows the full date and a relative phrase in the tooltip', async () => {
    const { user } = renderUi(<DateText date="2026-11-04" />)
    await user.hover(time())
    expect(await screen.findByRole('tooltip')).toHaveTextContent('4 Nov 2026 · yesterday')
  })

  it('reads "Today" in a small blue chip for the due variant', () => {
    renderUi(<DateText date="2026-11-05" variant="due" />)
    expect(time()).toHaveTextContent('Today')
    expect(time()).toHaveAttribute('data-due', 'today')
    const cls = time().className
    expect(cls).toContain('text-today-fg')
    expect(cls).toContain('bg-[image:linear-gradient(180deg,var(--today-bg-top),var(--today-bg))]')
    expect(cls).toContain('font-mono')
    expect(cls).toContain('text-[11.5px]')
    expect(cls).toContain('font-semibold')
    expect(cls).toContain('rounded-chip')
  })

  it('keeps the today chip whatever size or colour the caller asks for', () => {
    renderUi(
      <DateText date="2026-11-05" variant="due" className="text-xs font-medium text-secondary" />,
    )
    const cls = time().className.split(' ')
    expect(cls).toContain('text-today-fg')
    expect(cls).toContain('text-[11.5px]')
    expect(cls).toContain('font-semibold')
    expect(cls).not.toContain('text-secondary')
    expect(cls).not.toContain('font-medium')
  })

  it('colours overdue dates brick and semibold and says so to screen readers', () => {
    renderUi(<DateText date="2026-11-02" variant="due" className="font-medium" />)
    expect(time()).toHaveTextContent('Overdue: 2 Nov')
    expect(time()).toHaveAttribute('data-due', 'overdue')
    expect(time().className).toContain('text-overdue')
    expect(time().className.split(' ')).toContain('font-semibold')
    expect(time().className.split(' ')).not.toContain('font-medium')
  })

  it('treats a fuzzy period as overdue only once it has passed', () => {
    const { rerender } = renderUi(
      <DateText date={{ date: '2026-10-05', precision: 'early-month' }} variant="due" />,
    )
    expect(time()).toHaveAttribute('data-due', 'overdue')
    rerender(<DateText date={{ date: '2026-11-05', precision: 'early-month' }} variant="due" />)
    expect(time()).not.toHaveAttribute('data-due')
  })

  it('shows future due dates in the main text colour and plain dates uncoloured', () => {
    const { rerender } = renderUi(<DateText date="2026-11-12" variant="due" />)
    expect(time()).not.toHaveAttribute('data-due')
    expect(time()).toHaveTextContent('12 Nov')
    expect(time().className.split(' ')).toContain('text-text')
    rerender(<DateText date="2026-11-05" />)
    expect(time()).toHaveTextContent('5 Nov')
    expect(time().className).not.toContain('text-today')
    expect(time().className.split(' ')).not.toContain('text-text')
  })

  it('moves to the next day as time passes (useNow ticks every minute)', () => {
    vi.useRealTimers()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-05T23:59:30+05:30'))
    renderUi(<DateText date="2026-11-06" variant="due" />)
    expect(time()).toHaveTextContent('6 Nov')
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(time()).toHaveTextContent('Today')
  })
})
