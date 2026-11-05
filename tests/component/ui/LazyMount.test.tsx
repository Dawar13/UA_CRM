/**
 * Grid performance: tooltips and the warmth menu must cost nothing until someone interacts with
 * them. These tests pin that down (nothing portalled, no Radix ids, no listeners' side effects)
 * while keeping names and behaviour.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StageDots, type StageViewItem } from '@/components/crm/StageDots'
import { TagList } from '@/components/crm/TagChip'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { placeTooltip, Tooltip, TooltipDelegate } from '@/components/ui/Tooltip'
import { renderUi } from './renderUi'

const stages: StageViewItem[] = [
  { id: 'a', name: 'Identified', index: 0, state: 'done', date: '2026-10-01' },
  { id: 'b', name: 'First call', index: 1, state: 'current', date: '2026-11-03' },
  { id: 'c', name: 'Paid', index: 2, state: 'future', date: null },
]

function Row({ n }: { n: number }) {
  return (
    <div data-testid={`row-${n}`}>
      <WarmthChip value="warm" onChange={vi.fn()} tabbable={false} size="sm" />
      <StageDots stages={stages} />
      <TagList
        tags={[
          { id: 't1', name: 'foundry', colour: 'indigo' },
          { id: 't2', name: 'defence', colour: 'violet' },
          { id: 't3', name: 'pilot candidate', colour: 'pink' },
        ]}
      />
    </div>
  )
}

describe('lazy mounting', () => {
  it('mounts no tooltip or menu machinery for a screen of rows', () => {
    const before = document.body.childElementCount
    const { container } = renderUi(
      <>
        {Array.from({ length: 40 }, (_, n) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static list of test rows.
          <Row key={n} n={n} />
        ))}
      </>,
    )
    // Only the render container itself was added to <body>: no portals.
    expect(document.body.childElementCount).toBe(before + 1)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // Radix triggers carry aria-controls and generated ids; the lazy ones do not.
    expect(container.querySelector('[aria-controls]')).toBeNull()
    expect(container.querySelector('[id^="radix-"]')).toBeNull()
    expect(container.querySelector('[aria-describedby]')).toBeNull()
  })

  it('keeps the warmth chip a menu button with the same name before it mounts the menu', () => {
    renderUi(<WarmthChip value="cold" onChange={vi.fn()} tabbable={false} />)
    const button = screen.getByRole('button', { name: 'Warmth: Cold' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('tabindex', '-1')
    expect(button).not.toHaveAttribute('aria-controls')
  })

  it.each([
    ['pointer down', (el: HTMLElement) => fireEvent.pointerDown(el, { button: 0 })],
    ['Enter', (el: HTMLElement) => fireEvent.keyDown(el, { key: 'Enter' })],
    ['Space', (el: HTMLElement) => fireEvent.keyDown(el, { key: ' ' })],
    ['ArrowDown', (el: HTMLElement) => fireEvent.keyDown(el, { key: 'ArrowDown' })],
  ])('mounts the warmth menu already open on %s', async (_label, interact) => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthChip value="cold" onChange={onChange} />)
    interact(screen.getByRole('button', { name: 'Warmth: Cold' }))
    await screen.findByRole('menu')
    expect(screen.getByRole('button', { name: 'Warmth: Cold' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await user.keyboard('1')
    expect(onChange).toHaveBeenCalledWith('warm')
  })

  it('ignores a right-click on the lazy warmth chip', () => {
    renderUi(<WarmthChip value="cold" onChange={vi.fn()} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Warmth: Cold' }), { button: 2 })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps the same trigger element when a tooltip opens and closes', async () => {
    const { user } = renderUi(
      <Tooltip content="Search everyone">
        <button type="button">Search</button>
      </Tooltip>,
    )
    const button = screen.getByRole('button', { name: 'Search' })
    await user.hover(button)
    const tooltip = await screen.findByRole('tooltip')
    expect(screen.getByRole('button', { name: 'Search' })).toBe(button)
    expect(button).toHaveAttribute('aria-describedby', tooltip.id)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    expect(button).not.toHaveAttribute('aria-describedby')
    expect(button.isConnected).toBe(true)
  })

  it('opens instantly on keyboard focus and closes on blur', async () => {
    const { user } = renderUi(
      <>
        <Tooltip content="Theme: System">
          <button type="button">Theme</button>
        </Tooltip>
        <button type="button">Next</button>
      </>,
    )
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Theme: System')
    await user.tab()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('does not open on focus that comes from a click, and closes on click', async () => {
    const { user } = renderUi(
      <Tooltip content="Expand row">
        <button type="button">Expand</button>
      </Tooltip>,
    )
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows only one tooltip at a time', async () => {
    const { user } = renderUi(
      <>
        <Tooltip content="First tip">
          <button type="button">One</button>
        </Tooltip>
        <Tooltip content="Second tip">
          <button type="button">Two</button>
        </Tooltip>
      </>,
    )
    await user.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent('First tip')
    await user.hover(screen.getByRole('button', { name: 'Two' }))
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Second tip'))
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
  })

  it('consults openWhen before opening', async () => {
    const openWhen = vi.fn(() => false)
    const { user } = renderUi(
      <Tooltip content="Never" openWhen={openWhen}>
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    await user.tab()
    expect(openWhen).toHaveBeenCalledWith(screen.getByRole('button', { name: 'Trigger' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('TooltipDelegate', () => {
  it('anchors one tooltip to whichever child is hovered', async () => {
    const { user } = renderUi(
      <TooltipDelegate selector="[data-i]" content={(el) => `Item ${el.dataset.i}`}>
        <div>
          <span data-i="1">a</span>
          <span data-i="2">b</span>
          <span>no tip</span>
        </div>
      </TooltipDelegate>,
    )
    await user.hover(screen.getByText('a'))
    expect((await screen.findByRole('tooltip')).textContent).toBe('Item 1')
    expect(screen.getByText('a')).toHaveAttribute(
      'aria-describedby',
      screen.getByRole('tooltip').id,
    )
    await user.hover(screen.getByText('b'))
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('Item 2'))
    expect(screen.getByText('a')).not.toHaveAttribute('aria-describedby')
    await user.hover(screen.getByText('no tip'))
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })
})

describe('placeTooltip', () => {
  const viewport = { width: 1000, height: 800 }
  const size = { width: 100, height: 24 }

  it('centres above the trigger', () => {
    const rect = { top: 400, left: 450, width: 100, height: 20 }
    expect(placeTooltip(rect, size, viewport, 'top', 'center', 6)).toEqual({
      top: 370,
      left: 450,
      side: 'top',
    })
  })

  it('flips below when there is no room above', () => {
    const rect = { top: 10, left: 450, width: 100, height: 20 }
    expect(placeTooltip(rect, size, viewport, 'top', 'center', 6)).toMatchObject({
      top: 36,
      side: 'bottom',
    })
  })

  it('clamps to the viewport edges', () => {
    const rect = { top: 400, left: 0, width: 10, height: 20 }
    expect(placeTooltip(rect, size, viewport, 'top', 'center', 6).left).toBe(8)
    const right = { top: 400, left: 995, width: 5, height: 20 }
    expect(placeTooltip(right, size, viewport, 'top', 'center', 6).left).toBe(892)
  })

  it('places to the side when asked', () => {
    const rect = { top: 400, left: 450, width: 100, height: 20 }
    expect(placeTooltip(rect, size, viewport, 'right', 'start', 4)).toEqual({
      top: 400,
      left: 554,
      side: 'right',
    })
  })
})
