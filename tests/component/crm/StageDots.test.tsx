import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { StageDots, type StageViewItem, stageSummary } from '@/components/crm/StageDots'
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

beforeEach(() => freezeClock())
afterEach(() => restoreClock())

describe('stageSummary', () => {
  it('names each situation', () => {
    expect(stageSummary(view([F, F, F, F, F, F, F]))).toBe('Not started')
    expect(stageSummary(view([D, D, D, C, F, F, F]))).toBe('Stage 4 of 7: Plant visit')
    expect(stageSummary(view([D, D, D, D, D, D, 'won']))).toBe('Won: Paid')
    expect(stageSummary(view([D, D, D, C, 'lost-marker', F, F]))).toBe('Lost after Plant visit')
  })
})

describe('StageDots', () => {
  it('is an image named "Stage 4 of 7: Plant visit" with a dot per stage', () => {
    const { container } = renderUi(
      <StageDots
        stages={view(
          [D, D, D, C, F, F, F],
          ['2026-10-01', '2026-10-08', '2026-10-15', '2026-11-03'],
        )}
      />,
    )
    const img = screen.getByRole('img', { name: 'Stage 4 of 7: Plant visit' })
    const dots = img.querySelectorAll('[data-state]')
    expect([...dots].map((d) => d.getAttribute('data-state'))).toEqual([
      'done',
      'done',
      'done',
      'current',
      'future',
      'future',
      'future',
    ])
    expect(container.querySelectorAll('[data-state="current"]')).toHaveLength(1)
  })

  it('draws state with shape as well as colour', () => {
    const { container } = renderUi(<StageDots stages={view([D, D, D, C, 'lost-marker', F, F])} />)
    const cls = (state: string) =>
      container.querySelector(`[data-state="${state}"]`)?.className ?? ''
    expect(cls('done')).toContain('bg-stage-done')
    expect(cls('current')).toContain('ring-stage-current-ring')
    expect(cls('future')).toContain('border-stage-future')
    expect(cls('future')).not.toContain('bg-')
    expect(cls('lost-marker')).toContain('bg-stage-lost')
    expect(cls('done')).toContain('size-2')
    expect(screen.getByRole('img', { name: 'Lost after Plant visit' })).toBeInTheDocument()
  })

  it('marks the last stage green when won', () => {
    const { container } = renderUi(<StageDots stages={view([D, D, D, D, D, D, 'won'])} />)
    expect(screen.getByRole('img', { name: 'Won: Paid' })).toBeInTheDocument()
    expect(container.querySelector('[data-state="won"]')?.className).toContain('bg-stage-won')
  })

  it('reads "Not started" when no stage is reached', () => {
    renderUi(<StageDots stages={view([F, F, F])} />)
    expect(screen.getByRole('img', { name: 'Not started' })).toBeInTheDocument()
  })

  it.each([
    [2, 'First call · 3 Nov'],
    [1, 'Intro asked · no date'],
    [3, 'Plant visit'],
  ])('shows the stage name and date in the tooltip of dot %i', async (index, text) => {
    const { user, container } = renderUi(
      <StageDots stages={view([D, D, C, F], ['2026-10-01', null, '2026-11-03'])} />,
    )
    const dot = container.querySelectorAll('[data-state]')[index] as HTMLElement
    await user.hover(dot)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.textContent).toBe(text)
  })

  it('explains the lost marker', async () => {
    const { user, container } = renderUi(<StageDots stages={view([D, C, 'lost-marker', F])} />)
    await user.hover(container.querySelector('[data-state="lost-marker"]') as HTMLElement)
    expect((await screen.findByRole('tooltip')).textContent).toBe('Lost after Intro asked')
  })

  it('renders nothing for a sheet without stages', () => {
    const { container } = renderUi(<StageDots stages={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
