import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { nextWarmthFromKey, WarmthChip, warmthAccessibleName } from '@/components/crm/WarmthChip'
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
    ['warm', 'Warm', 'text-warm'],
    ['waiting', 'Waiting', 'text-waiting'],
    ['cold', 'Cold', 'text-cold'],
  ] as const)('shows %s with its semantic colours', (value, label, cls) => {
    renderUi(<WarmthChip value={value} />)
    const chip = screen.getByText(label)
    expect(chip).toHaveAttribute('data-warmth', value)
    expect(chip.className).toContain(cls)
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
    ['sm', 'h-5'],
    ['md', 'h-6'],
  ] as const)('has a %s size', (size, cls) => {
    renderUi(<WarmthChip value="warm" onChange={vi.fn()} size={size} />)
    expect(screen.getByRole('button', { name: 'Warmth: Warm' }).className).toContain(cls)
  })
})
