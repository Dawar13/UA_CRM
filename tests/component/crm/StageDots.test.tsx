import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  StageDots,
  type StageViewItem,
  stageBarCellWidth,
  stageBlockKind,
  stageFill,
  stageInk,
  stageLabel,
  stageSummary,
} from '@/components/crm/StageDots'
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

/** Dated stages up to and including `upTo`. */
const dated = (upTo: number) =>
  Array.from({ length: upTo + 1 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)

const cells = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-stage-index]'),
]
const label = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-stage-label]') as HTMLElement

beforeEach(() => freezeClock())
afterEach(() => restoreClock())

describe('stageSummary', () => {
  it('names each situation', () => {
    expect(stageSummary(view([F, F, F, F, F, F, F]))).toBe('Not started')
    expect(stageSummary(view([D, D, D, C, F, F, F]))).toBe('Stage 4 of 7: Plant visit')
    expect(stageSummary(view([D, D, D, D, D, D, 'won']))).toBe('Won: Paid')
    expect(stageSummary(view([D, D, D, C, 'lost-marker', F, F]))).toBe('Lost after Plant visit')
  })

  it('names a row lost at the final stage, which has no marker, when told it is lost', () => {
    const atPaid = view([D, D, D, D, D, D, C])
    expect(stageSummary(atPaid)).toBe('Stage 7 of 7: Paid')
    expect(stageSummary(atPaid, true)).toBe('Lost after Paid')
  })
})

describe('stageLabel', () => {
  it('names the state in words with a tone', () => {
    expect(stageLabel(view([D, D, C, F]))).toEqual({ text: 'First call', tone: 'current' })
    expect(stageLabel(view([D, D, D, D, D, D, 'won']))).toEqual({ text: 'Paid', tone: 'won' })
    expect(stageLabel(view([D, D, C, 'lost-marker']))).toEqual({
      text: 'Lost · First call',
      tone: 'lost',
    })
    expect(stageLabel(view([F, F, F]))).toEqual({ text: 'Not started', tone: 'none' })
  })
})

describe('stage block kinds and colours', () => {
  it('derives the kind of each position', () => {
    const open = view([D, D, C, F], ['2026-10-01', null, '2026-10-15'])
    expect(open.map((s) => stageBlockKind(s, false))).toEqual([
      'done',
      'skipped',
      'current',
      'future',
    ])
    const lost = view([D, C, 'lost-marker', F], ['2026-10-01', '2026-10-08'])
    expect(lost.map((s) => stageBlockKind(s, true))).toEqual([
      'lost-done',
      'lost-done',
      'lost',
      'future',
    ])
    expect(stageBlockKind(view([D, 'won'])[1] as StageViewItem, false)).toBe('won')
  })

  it('fills from the tokens only', () => {
    expect(stageFill('done', 3)).toBe('var(--stage3)')
    expect(stageFill('current', 6)).toBe('var(--stage6)')
    expect(stageFill('won', 6)).toBe('var(--stage-won)')
    expect(stageFill('lost-done', 2)).toBe('var(--stage-lost-done)')
    expect(stageFill('lost', 2)).toBe('var(--stage-lost)')
    expect(stageFill('future', 2)).toBe('var(--stage-track)')
    expect(stageFill('skipped', 2)).toBe(
      'repeating-linear-gradient(135deg, var(--stage2) 0 2px, var(--stage-track) 2px 4px)',
    )
    // The tracker (D-048): stages passed are pencil hatching in their own ramp colour, the
    // current one is solid, skipped ones are faint grey hatching.
    expect(stageFill('done', 3, true)).toBe(
      'repeating-linear-gradient(135deg, color-mix(in srgb, var(--stage3) 45%, var(--bg)) 0 1.5px, color-mix(in srgb, var(--stage3) 18%, var(--bg)) 1.5px 5px)',
    )
    expect(stageFill('current', 3, true)).toBe('var(--stage3)')
    expect(stageFill('skipped', 2, true)).toBe(
      'repeating-linear-gradient(135deg, var(--grid-line) 0 1px, var(--stage-track) 1px 6px)',
    )
  })

  it('pairs each fill with its contrast-tested text colour', () => {
    expect(stageInk('current', 6)).toBe('var(--stage-fg6)')
    // Ink on the hatching (checked on both stripe and ground in tokens.contrast.test.ts).
    expect(stageInk('done', 6)).toBe('var(--text)')
    expect(stageInk('skipped', 6)).toBe('var(--text-secondary)')
    expect(stageInk('won', 6)).toBe('var(--stage-won-fg)')
    expect(stageInk('lost', 3)).toBe('var(--stage-lost-fg)')
    expect(stageInk('future', 3)).toBe('var(--text-muted)')
  })

  it('keeps the bar about 100px wide', () => {
    expect(stageBarCellWidth(7)).toBe(13)
    expect(stageBarCellWidth(6)).toBe(15)
    expect(stageBarCellWidth(3)).toBe(28)
    expect(stageBarCellWidth(1)).toBe(28)
    expect(stageBarCellWidth(40)).toBe(4)
    expect(stageBarCellWidth(0)).toBe(0)
    for (const n of [4, 5, 6, 7]) {
      const total = n * stageBarCellWidth(n) + (n - 1)
      expect(total).toBeGreaterThanOrEqual(90)
      expect(total).toBeLessThanOrEqual(100)
    }
  })
})

describe('StageDots', () => {
  it('is an image named "Stage 4 of 7: Plant visit" with a bar cell per stage', () => {
    const { container } = renderUi(<StageDots stages={view([D, D, D, C, F, F, F], dated(3))} />)
    const img = screen.getByRole('img', { name: 'Stage 4 of 7: Plant visit' })
    const states = [...img.querySelectorAll('[data-state]')].map((d) =>
      d.getAttribute('data-state'),
    )
    expect(states).toEqual(['done', 'done', 'done', 'current', 'future', 'future', 'future'])
    expect(container.querySelectorAll('[data-state="current"]')).toHaveLength(1)
  })

  it('steps reached stages along the blue ramp and leaves the rest on the track', () => {
    const { container } = renderUi(<StageDots stages={view([D, D, D, C, F, F, F], dated(3))} />)
    expect(cells(container).map((c) => c.style.background)).toEqual([
      'var(--stage1)',
      'var(--stage2)',
      'var(--stage3)',
      'var(--stage4)',
      'var(--stage-track)',
      'var(--stage-track)',
      'var(--stage-track)',
    ])
    expect(cells(container).every((c) => c.style.width === '13px')).toBe(true)
  })

  it('always shows the stage in words beside the bar', () => {
    const { container } = renderUi(<StageDots stages={view([D, D, D, C, F, F, F], dated(3))} />)
    expect(label(container)).toHaveTextContent('Plant visit')
    expect(label(container).className).toContain('text-secondary')
    expect(label(container).className).toContain('truncate')
  })

  it('stripes a skipped stage (done without a date)', () => {
    const { container } = renderUi(
      <StageDots stages={view([D, D, D, C, F, F, F], ['2026-10-01', null, null, '2026-10-23'])} />,
    )
    const [first, second] = cells(container)
    expect(first?.dataset.kind).toBe('done')
    expect(second?.dataset.kind).toBe('skipped')
    expect(second?.style.background).toContain('repeating-linear-gradient')
    expect(second?.style.background).toContain('var(--stage-track)')
  })

  it('marks the last stage green and names it when won', () => {
    const { container } = renderUi(<StageDots stages={view([D, D, D, D, D, D, 'won'], dated(6))} />)
    expect(screen.getByRole('img', { name: 'Won: Paid' })).toBeInTheDocument()
    const won = container.querySelector<HTMLElement>('[data-state="won"]')
    expect(won?.style.background).toBe('var(--stage-won)')
    expect(label(container)).toHaveTextContent('Paid')
    expect(label(container).className).toContain('text-won-fg')
    expect(label(container).className).toContain('font-semibold')
  })

  it('greys what a lost row reached, marks the next position and says "Lost · First call"', () => {
    const { container } = renderUi(
      <StageDots stages={view([D, D, C, 'lost-marker', F, F, F], dated(2))} />,
    )
    expect(screen.getByRole('img', { name: 'Lost after First call' })).toBeInTheDocument()
    expect(cells(container).map((c) => c.dataset.kind)).toEqual([
      'lost-done',
      'lost-done',
      'lost-done',
      'lost',
      'future',
      'future',
      'future',
    ])
    expect(cells(container)[3]?.style.background).toBe('var(--stage-lost)')
    expect(cells(container)[0]?.style.background).toBe('var(--stage-lost-done)')
    expect(label(container)).toHaveTextContent('Lost · First call')
    expect(label(container).className).toContain('text-lost')
  })

  it('shows a row lost at the final stage as lost when told', () => {
    const { container } = renderUi(
      <StageDots stages={view([D, D, D, D, D, D, C], dated(6))} lost />,
    )
    expect(screen.getByRole('img', { name: 'Lost after Paid' })).toBeInTheDocument()
    expect(cells(container).every((c) => c.dataset.kind === 'lost-done')).toBe(true)
    expect(label(container)).toHaveTextContent('Lost · Paid')
  })

  it('reads "Not started" when no stage is reached, in words too', () => {
    const { container } = renderUi(<StageDots stages={view([F, F, F])} />)
    expect(screen.getByRole('img', { name: 'Not started' })).toBeInTheDocument()
    expect(label(container)).toHaveTextContent('Not started')
    expect(cells(container).every((c) => c.style.width === '28px')).toBe(true)
  })

  it.each([
    [0, 'Identified · 1 Oct'],
    [1, 'Intro asked · skipped'],
    [2, 'First call · 3 Nov'],
    [3, 'Plant visit'],
  ])('shows the stage name and date in the tooltip of cell %i', async (index, text) => {
    const { user, container } = renderUi(
      <StageDots stages={view([D, D, C, F], ['2026-10-01', null, '2026-11-03'])} />,
    )
    await user.hover(cells(container)[index] as HTMLElement)
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
