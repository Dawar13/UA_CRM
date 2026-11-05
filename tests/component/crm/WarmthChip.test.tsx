import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  nextWarmthFromKey,
  WarmthChip,
  WarmthRadioGroup,
  warmthAccessibleName,
} from '@/components/crm/WarmthChip'
import { renderUi } from '../ui/renderUi'

describe('nextWarmthFromKey', () => {
  it('maps the menu digits', () => {
    expect(nextWarmthFromKey('1')).toBe('warm')
    expect(nextWarmthFromKey('2')).toBe('waiting')
    expect(nextWarmthFromKey('3')).toBe('cold')
    expect(nextWarmthFromKey('0')).toBeNull()
    expect(nextWarmthFromKey('4')).toBeUndefined()
    expect(nextWarmthFromKey('w')).toBeUndefined()
  })

  it('names each state', () => {
    expect(warmthAccessibleName('cold')).toBe('Warmth: Cold')
    expect(warmthAccessibleName('warm')).toBe('Warmth: Warm')
    expect(warmthAccessibleName(null)).toBe('Warmth: none')
  })
})

describe('WarmthChip, display only', () => {
  it.each([
    ['warm', 'Warm'],
    ['waiting', 'Waiting'],
    ['cold', 'Cold'],
  ] as const)('shows %s as a soft chip with a square in its colour', (value, label) => {
    renderUi(<WarmthChip value={value} />)
    const chip = screen.getByText(label)
    expect(chip).toHaveAttribute('data-warmth', value)
    expect(chip.className).toContain(`text-${value}`)
    expect(chip.className).toContain(
      `bg-[image:linear-gradient(180deg,var(--${value}-bg-top),var(--${value}-bg))]`,
    )
    expect(chip.className).toContain(`shadow-[inset_0_0_0_1px_var(--${value}-border)]`)
    expect(chip.className).toContain('rounded-chip')
    expect(chip.className).toContain('font-semibold')
    const square = chip.querySelector('[aria-hidden="true"]')
    expect(square?.className).toContain(`bg-${value}-cell`)
    expect(square?.className).toContain('size-1.5')
    expect(chip).toHaveTextContent(`Warmth: ${label}`)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders nothing when empty', () => {
    const { container } = renderUi(<WarmthChip value={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('WarmthChip, interactive', () => {
  it('is a menu button named "Warmth: Cold"', () => {
    renderUi(<WarmthChip value="cold" onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Warmth: Cold' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('data-warmth', 'cold')
    expect(button).toHaveTextContent('Cold')
  })

  it('opens a menu with Warm, Waiting, Cold and Clear and picks by click', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthChip value="cold" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Warmth: Cold' }))
    await screen.findByRole('menu')
    const radios = screen.getAllByRole('menuitemradio')
    expect(radios.map((r) => r.textContent)).toEqual(['Warm1', 'Waiting2', 'Cold3'])
    expect(screen.getByRole('menuitemradio', { name: /Cold/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitem', { name: /Clear/ })).toHaveAttribute(
      'aria-keyshortcuts',
      '0',
    )
    await user.click(screen.getByRole('menuitemradio', { name: /Waiting/ }))
    expect(onChange).toHaveBeenCalledWith('waiting')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it.each([
    ['1', 'warm'],
    ['2', 'waiting'],
    ['0', null],
  ] as const)('selects with the digit %s while the menu is open', async (key, expected) => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthChip value="cold" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Warmth: Cold' }))
    await screen.findByRole('menu')
    await user.keyboard(key)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expected)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('closes without a change when the digit picks the current value', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthChip value="cold" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Warmth: Cold' }))
    await screen.findByRole('menu')
    await user.keyboard('3')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('works from the keyboard alone', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthChip value={null} onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('button', { name: /Warmth: none/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/warm|waiting/))
  })

  it('shows "Set warmth" only on row hover or focus when empty', () => {
    renderUi(<WarmthChip value={null} onChange={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Warmth: none, set warmth' })
    expect(button).toHaveTextContent('Set warmth')
    expect(button.className).toContain('opacity-0')
    expect(button.className).toContain('group-hover/row:opacity-100')
    expect(button.className).toContain('group-data-[active=true]/row:opacity-100')
    expect(button.className).toContain('group-focus-within/row:opacity-100')
    expect(button.className).toContain('focus-visible:opacity-100')
  })

  it('keeps the empty affordance visible with alwaysShowEmpty', () => {
    renderUi(<WarmthChip value={null} onChange={vi.fn()} alwaysShowEmpty />)
    expect(screen.getByRole('button', { name: /Warmth: none/ }).className).not.toContain(
      'opacity-0',
    )
  })

  it('leaves the tab order inside the grid (tabbable={false})', () => {
    renderUi(<WarmthChip value="warm" onChange={vi.fn()} tabbable={false} />)
    expect(screen.getByRole('button', { name: 'Warmth: Warm' })).toHaveAttribute('tabindex', '-1')
  })

  it('returns focus to the grid cell when not tabbable', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(
      // biome-ignore lint/a11y/useSemanticElements: a stand-in for the grid's active cell.
      <div role="gridcell" tabIndex={0} data-testid="cell">
        <WarmthChip value="warm" onChange={onChange} tabbable={false} />
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'Warmth: Warm' }))
    await screen.findByRole('menu')
    await user.keyboard('3')
    await waitFor(() => expect(screen.getByTestId('cell')).toHaveFocus())
    expect(onChange).toHaveBeenCalledWith('cold')
  })

  it.each([
    ['sm', 'h-[22px]'],
    ['md', 'h-[30px]'],
  ] as const)('has a %s size', (size, cls) => {
    renderUi(<WarmthChip value="warm" onChange={vi.fn()} size={size} />)
    expect(screen.getByRole('button', { name: 'Warmth: Warm' }).className).toContain(cls)
  })
})

describe('WarmthRadioGroup', () => {
  it('is a radio group of Warm, Waiting and Cold with the value checked', () => {
    renderUi(<WarmthRadioGroup value="waiting" onChange={vi.fn()} />)
    const group = screen.getByRole('radiogroup', { name: 'Warmth' })
    expect(group).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Warm', 'Waiting', 'Cold'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios.map((r) => r.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', '3'])
  })

  it('gives the chosen chip its soft gradient and the others a hairline', () => {
    renderUi(<WarmthRadioGroup value="cold" onChange={vi.fn()} />)
    const cold = screen.getByRole('radio', { name: 'Cold' })
    expect(cold.className).toContain('bg-[image:linear-gradient(180deg,var(--cold-bg-top)')
    expect(cold.className).toContain('text-cold')
    expect(cold.className).toContain('font-semibold')
    const warm = screen.getByRole('radio', { name: 'Warm' })
    expect(warm.className).toContain('bg-bg')
    expect(warm.className).toContain('shadow-[inset_0_0_0_1px_var(--border)]')
    expect(warm.className).toContain('h-[30px]')
    expect(warm.className).toContain('rounded-control')
    expect(warm.querySelector('.bg-warm-cell')).toHaveAttribute('aria-hidden', 'true')
  })

  it('chooses by click and clears when the chosen chip is clicked again', async () => {
    const onChange = vi.fn()
    const { user, rerender } = renderUi(<WarmthRadioGroup value={null} onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Waiting' }))
    expect(onChange).toHaveBeenLastCalledWith('waiting')
    rerender(<WarmthRadioGroup value="waiting" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Waiting' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('is one tab stop; arrows move focus without choosing and Space chooses', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthRadioGroup value="warm" onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Warm' })).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Cold' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Warm' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}{End}{Home}{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Waiting' })).toHaveFocus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('waiting')
    await user.tab()
    expect(document.body).toHaveFocus()
  })

  it('takes the first chip as the tab stop when no warmth is set', async () => {
    const { user } = renderUi(<WarmthRadioGroup value={null} onChange={vi.fn()} />)
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Warm' })).toHaveFocus()
  })

  it.each([
    ['3', 'cold'],
    ['0', null],
  ] as const)('chooses with the digit %s', async (key, expected) => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthRadioGroup value="warm" onChange={onChange} />)
    await user.tab()
    await user.keyboard(key)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expected)
  })

  it('ignores the digit of the current value', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthRadioGroup value="warm" onChange={onChange} />)
    await user.tab()
    await user.keyboard('1')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables every chip', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<WarmthRadioGroup value="warm" onChange={onChange} disabled />)
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: 'Cold' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
