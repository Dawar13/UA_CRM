import { screen } from '@testing-library/react'
import { Search } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { renderUi } from './renderUi'

describe('Button', () => {
  it('is a type="button" secondary button by default', () => {
    renderUi(<Button>Reopen</Button>)
    const button = screen.getByRole('button', { name: 'Reopen' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.className).toContain('bg-surface-raised')
  })

  it('renders the primary variant as the brand fill with white text', () => {
    renderUi(<Button variant="primary">Add to calendar</Button>)
    const button = screen.getByRole('button', { name: 'Add to calendar' })
    expect(button.className).toContain('bg-primary')
    expect(button.className).toContain('text-primary-fg')
  })

  it.each([
    ['ghost', 'hover:bg-surface-hover'],
    ['danger', 'bg-danger'],
  ] as const)('applies the %s variant', (variant, cls) => {
    renderUi(<Button variant={variant}>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain(cls)
  })

  it.each([
    ['sm', 'h-7'],
    ['md', 'h-8'],
  ] as const)('is %s sized', (size, cls) => {
    renderUi(<Button size={size}>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain(cls)
  })

  it('fires onClick by mouse and keyboard', async () => {
    const onClick = vi.fn()
    const { user } = renderUi(<Button onClick={onClick}>Save</Button>)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('does nothing when disabled', async () => {
    const onClick = vi.fn()
    const { user } = renderUi(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders its child with button styles when asChild is set', () => {
    renderUi(
      <Button asChild variant="ghost">
        <a href="/m/dawar/customers">Customers</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Customers' })
    expect(link).toHaveAttribute('href', '/m/dawar/customers')
    expect(link.className).toContain('rounded-control')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets a className override the variant', () => {
    renderUi(
      <Button variant="primary" className="bg-primary-hover">
        Hover
      </Button>,
    )
    const cls = screen.getByRole('button', { name: 'Hover' }).className.split(' ')
    expect(cls).toContain('bg-primary-hover')
    expect(cls).not.toContain('bg-primary')
  })
})

describe('IconButton', () => {
  it('is named by its aria-label', () => {
    renderUi(
      <IconButton aria-label="Search">
        <Search aria-hidden="true" />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('type', 'button')
  })

  it('shows a tooltip with the shortcut and exposes aria-keyshortcuts', async () => {
    const { user } = renderUi(
      <IconButton aria-label="Search" shortcut={['Mod', 'K']}>
        <Search aria-hidden="true" />
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+K')
    await user.hover(button)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Search')
    expect(tooltip).toHaveTextContent('Ctrl')
    expect(tooltip).toHaveTextContent('K')
  })

  it('opens the tooltip on keyboard focus too', async () => {
    const { user } = renderUi(
      <IconButton aria-label="More options" tooltip="More options">
        <Search aria-hidden="true" />
      </IconButton>,
    )
    await user.tab()
    expect(screen.getByRole('button', { name: 'More options' })).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('More options')
  })

  it('renders no tooltip when neither tooltip nor shortcut is given', async () => {
    const { user } = renderUi(
      <IconButton aria-label="Close">
        <Search aria-hidden="true" />
      </IconButton>,
    )
    await user.hover(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
