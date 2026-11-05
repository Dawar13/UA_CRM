import { screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemberTabs } from '@/components/crm/MemberTabs'
import { SheetTabs } from '@/components/crm/SheetTabs'
import { ThemeSegmented, ThemeToggle } from '@/components/crm/ThemeToggle'
import { renderUi } from '../ui/renderUi'

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
})

const members = [
  { id: 'm-dawar', name: 'Dawar' },
  { id: 'm-dhruv', name: 'Dhruv' },
]

const sheets = [
  { id: 's-customers', name: 'Customers' },
  { id: 's-investors', name: 'Investors' },
  { id: 's-connectors', name: 'Connectors' },
]

function Members({ onChange }: { onChange: (id: string) => void }) {
  const [value, setValue] = useState('m-dawar')
  return (
    <MemberTabs
      members={members}
      value={value}
      onValueChange={(id) => {
        setValue(id)
        onChange(id)
      }}
    />
  )
}

function Sheets({
  onChange,
  onActiveTabClick,
  list = sheets,
}: {
  onChange: (id: string) => void
  onActiveTabClick?: () => void
  list?: readonly { id: string; name: string }[]
}) {
  const [value, setValue] = useState('s-customers')
  return (
    <SheetTabs
      sheets={list}
      counts={{ 's-customers': 12, 's-investors': 2000 }}
      value={value}
      onValueChange={(id) => {
        setValue(id)
        onChange(id)
      }}
      onActiveTabClick={onActiveTabClick}
    />
  )
}

describe('MemberTabs', () => {
  it('lists members as tabs and marks the selected one', () => {
    renderUi(<Members onChange={vi.fn()} />)
    expect(screen.getByRole('tablist', { name: 'Team members' })).toBeInTheDocument()
    const dawar = screen.getByRole('tab', { name: 'Dawar' })
    expect(dawar).toHaveAttribute('aria-selected', 'true')
    expect(dawar).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: 'Dhruv' })).toHaveAttribute('aria-selected', 'false')
  })

  it('moves and activates with arrow keys', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<Members onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole('tab', { name: 'Dawar' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Dhruv' })).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith('m-dhruv')
    expect(screen.getByRole('tab', { name: 'Dhruv' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches by click', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<Members onChange={onChange} />)
    await user.click(screen.getByRole('tab', { name: 'Dhruv' }))
    expect(onChange).toHaveBeenCalledWith('m-dhruv')
  })

  it('points at no missing panel', () => {
    renderUi(<Members onChange={vi.fn()} />)
    for (const tab of screen.getAllByRole('tab')) expect(tab).not.toHaveAttribute('aria-controls')
  })
})

describe('SheetTabs', () => {
  it('names each tab by its sheet and shows its number and count visually', () => {
    renderUi(<Sheets onChange={vi.fn()} />)
    expect(screen.getByRole('tablist', { name: 'Sheets' })).toBeInTheDocument()
    // The folder design puts the sheet's number before its name ("01 Customers 12").
    const customers = screen.getByRole('tab', { name: 'Customers' })
    expect(customers).toHaveTextContent('01Customers12')
    expect(screen.getByRole('tab', { name: 'Investors' })).toHaveTextContent('02Investors2,000')
    expect(screen.getByRole('tab', { name: 'Connectors' })).toHaveTextContent(/^03Connectors$/)
  })

  it('gives each sheet a folder colour by position, round again after five', () => {
    const list = Array.from({ length: 7 }, (_, i) => ({ id: `s-${i}`, name: `Sheet ${i + 1}` }))
    renderUi(<Sheets onChange={vi.fn()} list={list} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.getAttribute('data-folder'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '1',
      '2',
    ])
    expect(tabs[2]?.style.getPropertyValue('--tab-top')).toBe('var(--folder3-top)')
    expect(tabs[2]?.style.getPropertyValue('--tab-bottom')).toBe('var(--folder3-bottom)')
  })

  it('stands the open tab taller than the rest', async () => {
    const { user } = renderUi(<Sheets onChange={vi.fn()} />)
    const height = (name: string) => screen.getByRole('tab', { name }).style.height
    expect(height('Customers')).toBe('40px')
    expect(height('Investors')).toBe('31px')
    await user.click(screen.getByRole('tab', { name: 'Investors' }))
    expect(height('Investors')).toBe('40px')
    expect(height('Customers')).toBe('31px')
  })

  it('clicking the open tab again folds the front; clicking another tab just switches', async () => {
    const onChange = vi.fn()
    const onActiveTabClick = vi.fn()
    const { user } = renderUi(<Sheets onChange={onChange} onActiveTabClick={onActiveTabClick} />)
    await user.click(screen.getByRole('tab', { name: 'Customers' }))
    expect(onActiveTabClick).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'Investors' }))
    expect(onChange).toHaveBeenLastCalledWith('s-investors')
    expect(onActiveTabClick).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('tab', { name: 'Investors' }))
    expect(onActiveTabClick).toHaveBeenCalledTimes(2)
  })

  it('Enter or Space on the open tab folds the front', async () => {
    const onActiveTabClick = vi.fn()
    const { user } = renderUi(<Sheets onChange={vi.fn()} onActiveTabClick={onActiveTabClick} />)
    await user.tab()
    expect(screen.getByRole('tab', { name: 'Customers' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onActiveTabClick).toHaveBeenCalledTimes(1)
    await user.keyboard(' ')
    expect(onActiveTabClick).toHaveBeenCalledTimes(2)
    // Arrows switch sheets without folding anything.
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Investors' })).toHaveAttribute('aria-selected', 'true')
    expect(onActiveTabClick).toHaveBeenCalledTimes(2)
  })

  it('moves and activates with arrow keys, Home and End', async () => {
    const onChange = vi.fn()
    const { user } = renderUi(<Sheets onChange={onChange} />)
    await user.tab()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Connectors' })).toHaveFocus()
    expect(onChange).toHaveBeenLastCalledWith('s-connectors')
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('s-investors')
    await user.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('s-customers')
  })

  it('fades the edge that has more tabs past it', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    const { container } = renderUi(<Sheets onChange={vi.fn()} />)
    const scroller = container.querySelector('[data-fade-right]') as HTMLElement
    await waitFor(() => expect(scroller).toHaveAttribute('data-fade-right', 'true'))
    expect(scroller).not.toHaveAttribute('data-fade-left')
  })
})

describe('ThemeToggle', () => {
  it('cycles system → light → dark and names the mode', async () => {
    const { user } = renderUi(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Theme: System' })
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Theme: Light' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('ua-crm:theme')).toBe('light')
    await user.click(button)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Theme: System' })).toBeInTheDocument()
  })

  it('names the mode in its tooltip', async () => {
    const { user } = renderUi(<ThemeToggle />)
    await user.hover(screen.getByRole('button', { name: 'Theme: System' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Theme: System')
  })
})

describe('ThemeSegmented', () => {
  it('is a radio group of System, Light and Dark', async () => {
    const { user } = renderUi(<ThemeSegmented />)
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('moves with arrow keys', async () => {
    const { user } = renderUi(<ThemeSegmented />)
    await user.tab()
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus()
    // Hold the key: Radix checks the radio when focus arrives while an arrow key is down.
    await user.keyboard('{ArrowRight>}')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked())
    await user.keyboard('{/ArrowRight}')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})
