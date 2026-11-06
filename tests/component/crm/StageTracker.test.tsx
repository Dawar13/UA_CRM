import { fireEvent, screen, within } from '@testing-library/react'
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
    // Mark lost sits in the header line above the blocks, so it comes first in the tab order.
    await user.tab()
    expect(screen.getByRole('button', { name: 'Mark lost' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Move back to Identified' })).toHaveFocus()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Move to Plant visit' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(props.onMove).toHaveBeenCalledWith(3)
  })

  it('shows dates on reached stages, "Skipped" on skipped ones and a dash ahead', () => {
    setup({ stages: view([D, D, D, C, F, F, F], ['2026-10-01', null, null, '2026-11-02']) })
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1 Oct')
    expect(items[1]).toHaveTextContent('Skipped')
    expect(items[2]).toHaveTextContent('Skipped')
    expect(items[3]).toHaveTextContent('2 Nov')
    expect(items[4]).toHaveTextContent('—')
    expect(items[4]).not.toHaveTextContent(/Skipped|Nov|Oct/)
  })

  it('hatches the stages passed, keeps the current one solid with a ring', () => {
    setup({ stages: view([D, D, D, C, F, F, F], ['2026-10-01', null, null, '2026-11-02']) })
    const items = screen.getAllByRole('listitem')
    const block = (i: number) => items[i]?.firstElementChild as HTMLElement
    expect(items.map((li) => li.getAttribute('data-kind'))).toEqual([
      'done',
      'skipped',
      'skipped',
      'current',
      'future',
      'future',
      'future',
    ])
    // Passed: pencil hatching in the stage's own colour, ink text (D-048).
    expect(block(0).style.background).toContain('repeating-linear-gradient')
    expect(block(0).style.background).toContain('var(--stage1)')
    expect(block(0).style.color).toBe('var(--text)')
    // Skipped: faint grey hatching.
    expect(block(1).style.background).toContain('var(--grid-line)')
    // Current: solid.
    expect(block(3).style.background).toBe('var(--stage4)')
    expect(block(3).style.color).toBe('var(--stage-fg4)')
    expect(block(3).className).toContain('shadow-[0_0_0_2px_var(--bg),0_0_0_3.5px_var(--text)]')
    expect(block(4).style.background).toBe('var(--stage-track)')
    expect(block(4).className).not.toContain('shadow-')
    expect(block(0).className).toContain('rounded-l-control')
    expect(block(6).className).toContain('rounded-r-control')
  })

  it('rings the won stage and colours it green', () => {
    setup({ stages: view([D, D, D, D, D, D, 'won'], ['2026-10-01', '2026-10-02']) })
    const won = screen.getAllByRole('listitem')[6] as HTMLElement
    expect(won).toHaveAttribute('aria-current', 'step')
    const block = won.firstElementChild as HTMLElement
    expect(block.style.background).toBe('var(--stage-won)')
    expect(block.style.color).toBe('var(--stage-won-fg)')
    expect(block.className).toContain('shadow-[0_0_0_2px_var(--bg)')
  })

  it('shows "[" and "]" hints and moves with them from inside the tracker', async () => {
    const { user, props } = setup()
    const tracker = screen.getByTestId('stage-tracker')
    expect(tracker).toHaveTextContent('Previous [ Next ]')
    screen.getByRole('button', { name: 'Move back to Identified' }).focus()
    await user.keyboard(']')
    expect(props.onMove).toHaveBeenLastCalledWith(3)
    await user.keyboard('[[') // '[[' types a literal '['
    expect(props.onMove).toHaveBeenLastCalledWith(1)
    expect(props.onMove).toHaveBeenCalledTimes(2)
  })

  it('does not move with "[" or "]" while lost or disabled, or past the ends', async () => {
    const lost = setup({
      stages: view([D, D, C, 'lost-marker', F, F, F]),
      lost: { afterStageName: 'First call', date: '2026-10-15' },
    })
    expect(lost.container).not.toHaveTextContent('Previous')
    screen.getByRole('button', { name: 'Reopen' }).focus()
    await lost.user.keyboard('[[]')
    expect(lost.props.onMove).not.toHaveBeenCalled()
    lost.unmount()

    const atStart = setup({ stages: view([C, F, F], ['2026-10-01']) })
    screen.getByRole('button', { name: 'Move to Intro asked' }).focus()
    await atStart.user.keyboard('[[')
    expect(atStart.props.onMove).not.toHaveBeenCalled()
    atStart.unmount()

    // Disabled buttons cannot take focus, so send the key straight to the tracker.
    const disabled = setup({ disabled: true })
    fireEvent.keyDown(screen.getByTestId('stage-tracker'), { key: ']' })
    expect(disabled.props.onMove).not.toHaveBeenCalled()
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
    expect(screen.getByRole('button', { name: 'Mark lost' }).className).toContain('text-lost')
    await user.click(screen.getByRole('button', { name: 'Mark lost' }))
    expect(props.onMarkLost).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
  })

  it('shows the lost line, a "Lost" block and Reopen when lost', async () => {
    const { user, props } = setup({
      stages: view([D, D, C, 'lost-marker', F, F, F], ['2026-10-01', '2026-10-08', '2026-10-15']),
      lost: { afterStageName: 'First call', date: '2026-10-20' },
    })
    expect(screen.getByTestId('lost-line')).toHaveTextContent('Lost after first call · 20 Oct')
    expect(screen.getByTestId('lost-line').className).toContain('text-lost')
    const items = screen.getAllByRole('listitem')
    // Reached stages turn grey; the next position reads "Lost" with the date, in brick.
    expect(items.slice(0, 3).map((li) => li.getAttribute('data-kind'))).toEqual([
      'lost-done',
      'lost-done',
      'lost-done',
    ])
    expect(items[3]).toHaveTextContent('Lost20 Oct')
    const marker = screen.getByRole('button', { name: 'Lost, move to Plant visit' })
    expect(marker.style.background).toBe('var(--stage-lost)')
    expect(marker.style.color).toBe('var(--stage-lost-fg)')
    // No ring while lost.
    const stopped = items[2]?.firstElementChild as HTMLElement
    expect(stopped.className).not.toContain('shadow-')
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
    // A disabled block is not actionable, so its name is exactly what it shows (D-028).
    await user.click(screen.getByRole('button', { name: 'Paid —' }))
    expect(props.onMove).not.toHaveBeenCalled()
  })
})
