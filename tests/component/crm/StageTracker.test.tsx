import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StageViewItem } from '@/components/crm/StageDots'
import { StageTracker, type StageTrackerProps } from '@/components/crm/StageTracker'
import type { StageState } from '@/domain/types'
import { freezeClock, renderUi, restoreClock } from '../ui/renderUi'

const names = [
  'Identified',
  'Intro asked',
  'First call',
  'Plant visit',
  'Pilot scoped',
  'Pilot live',
  'Paid',
]

function view(states: StageState[], dates: (string | null)[] = []): StageViewItem[] {
  return states.map((state, index) => ({
    id: `s${index}`,
    name: names[index] ?? `Stage ${index}`,
    index,
    state,
    date: dates[index] ?? null,
  }))
}

const F = 'future' as const
const D = 'done' as const
const C = 'current' as const

function setup(overrides: Partial<StageTrackerProps> = {}) {
  const props: StageTrackerProps = {
    stages: view([D, D, C, F, F, F, F], ['2026-10-01', '2026-10-08', '2026-10-15']),
    lost: null,
    onMove: vi.fn(),
    onMarkLost: vi.fn(),
    onReopen: vi.fn(),
    ...overrides,
  }
  return { props, ...renderUi(<StageTracker {...props} />) }
}

beforeEach(() => freezeClock())
afterEach(() => restoreClock())

describe('StageTracker', () => {
  it('renders nothing when the sheet has no stages', () => {
    const { container } = setup({ stages: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('makes other stages buttons and marks the current one', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Move to Pilot scoped' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move back to Intro asked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /First call/ })).not.toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Stages' })
    const current = within(list)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step')
    expect(current).toHaveTextContent('First call')
    expect(current).toHaveTextContent('15 Oct')
  })

  it('moves forward and back by mouse', async () => {
    const { user, props } = setup()
    await user.click(screen.getByRole('button', { name: 'Move to Pilot scoped' }))
    expect(props.onMove).toHaveBeenLastCalledWith(4)
    await user.click(screen.getByRole('button', { name: 'Move back to Identified' }))
    expect(props.onMove).toHaveBeenLastCalledWith(0)
  })

  it('moves by keyboard', async () => {
    const { user, props } = setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Move back to Identified' })).toHaveFocus()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Move to Plant visit' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(props.onMove).toHaveBeenCalledWith(3)
  })

  it('shows dates under reached stages and "no date" for skipped ones', () => {
    setup({ stages: view([D, D, D, C, F, F, F], ['2026-10-01', null, null, '2026-11-02']) })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1 Oct')
    expect(items[1]).toHaveTextContent('no date')
    expect(items[2]).toHaveTextContent('no date')
    expect(items[3]).toHaveTextContent('2 Nov')
    expect(items[4]).not.toHaveTextContent(/no date|Nov|Oct/)
  })

  it('exposes each position state', () => {
    setup({ stages: view([D, C, 'lost-marker', F]) })
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('data-state'))).toEqual([
      'done',
      'current',
      'lost-marker',
      'future',
    ])
  })

  it('offers Mark lost', async () => {
    const { user, props } = setup()
    await user.click(screen.getByRole('button', { name: 'Mark lost' }))
    expect(props.onMarkLost).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
  })

  it('shows the lost line and Reopen when lost', async () => {
    const { user, props } = setup({
      stages: view([D, D, C, 'lost-marker', F, F, F]),
      lost: { afterStageName: 'First call', date: '2026-10-15' },
    })
    expect(screen.getByTestId('lost-line')).toHaveTextContent('Lost after first call · 15 Oct')
    expect(screen.getByTestId('lost-line').className).toContain('text-lost')
    expect(screen.queryByRole('button', { name: 'Mark lost' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(props.onReopen).toHaveBeenCalledTimes(1)
  })

  it('has no Mark lost once won', () => {
    setup({ stages: view([D, D, D, D, D, D, 'won']) })
    expect(screen.queryByRole('button', { name: 'Mark lost' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Paid/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(6)
  })

  it('treats every stage as forward when none is reached', () => {
    setup({ stages: view([F, F, F]) })
    expect(screen.getByRole('button', { name: 'Move to Identified' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move to First call' })).toBeInTheDocument()
  })

  it('disables every control', async () => {
    const { user, props } = setup({ disabled: true })
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move to Paid' }))
    expect(props.onMove).not.toHaveBeenCalled()
  })
})
