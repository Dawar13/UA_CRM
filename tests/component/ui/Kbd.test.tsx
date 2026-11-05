import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ariaKeyShortcuts, formatKeys, Kbd, keyLabel } from '@/components/ui/Kbd'
import { renderUi } from './renderUi'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('key labels', () => {
  it('maps Mod to ⌘ on Apple and Ctrl elsewhere', () => {
    expect(keyLabel('Mod', true)).toBe('⌘')
    expect(keyLabel('Mod', false)).toBe('Ctrl')
    expect(keyLabel('Shift', true)).toBe('⇧')
    expect(keyLabel('Shift', false)).toBe('Shift')
  })

  it('names special keys the same way everywhere', () => {
    expect(keyLabel('Escape', true)).toBe('Esc')
    expect(keyLabel('ArrowUp', false)).toBe('↑')
    expect(keyLabel('PageDown', false)).toBe('PgDn')
    expect(keyLabel('/', false)).toBe('/')
  })

  it('formats a shortcut as text', () => {
    expect(formatKeys(['Mod', 'K'], true)).toBe('⌘K')
    expect(formatKeys(['Mod', 'K'], false)).toBe('Ctrl+K')
  })

  it('builds aria-keyshortcuts values', () => {
    expect(ariaKeyShortcuts(['Mod', 'K'], true)).toBe('Meta+K')
    expect(ariaKeyShortcuts(['Mod', '.'], false)).toBe('Control+.')
    expect(ariaKeyShortcuts(['W'], false)).toBe('W')
    expect(ariaKeyShortcuts(['Esc'], false)).toBe('Escape')
  })
})

describe('Kbd', () => {
  it('renders one keycap per key, Ctrl off Apple platforms', () => {
    const { container } = renderUi(<Kbd keys={['Mod', 'K']} data-testid="kbd" />)
    const outer = screen.getByTestId('kbd')
    expect(outer.tagName).toBe('KBD')
    const caps = container.querySelectorAll('kbd kbd')
    expect([...caps].map((c) => c.textContent)).toEqual(['Ctrl', 'K'])
  })

  it('renders ⌘ on macOS', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const { container } = renderUi(<Kbd keys={['Mod', 'K']} />)
    expect([...container.querySelectorAll('kbd kbd')].map((c) => c.textContent)).toEqual(['⌘', 'K'])
  })
})
