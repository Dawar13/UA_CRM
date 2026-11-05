import { screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/Dialog'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Tooltip } from '@/components/ui/Tooltip'
import { renderUi } from './renderUi'

function DemoMenu({ onExpand, onTrash }: { onExpand: () => void; onTrash: () => void }) {
  const [density, setDensity] = useState('comfortable')
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button>Row actions</Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Rohan Mehta</MenuLabel>
        <MenuItem shortcut={['Enter']} onSelect={onExpand}>
          Expand row
        </MenuItem>
        <MenuItem disabled>Previous stage</MenuItem>
        <MenuSeparator />
        <MenuRadioGroup value={density} onValueChange={setDensity}>
          <MenuRadioItem value="comfortable">Comfortable</MenuRadioItem>
          <MenuRadioItem value="compact">Compact</MenuRadioItem>
        </MenuRadioGroup>
        <MenuItem destructive onSelect={onTrash}>
          Move to trash
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

describe('Menu', () => {
  it('opens on click, lists items with their shortcut and selects one', async () => {
    const onExpand = vi.fn()
    const { user } = renderUi(<DemoMenu onExpand={onExpand} onTrash={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Row actions' }))
    const menu = await screen.findByRole('menu')
    expect(menu.className).toContain('rounded-card')
    const expand = screen.getByRole('menuitem', { name: /Expand row/ })
    expect(expand).toHaveAttribute('aria-keyshortcuts', 'Enter')
    expect(screen.getByRole('menuitem', { name: 'Previous stage' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(expand)
    expect(onExpand).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('works from the keyboard and returns focus to the trigger', async () => {
    const onTrash = vi.fn()
    const { user } = renderUi(<DemoMenu onExpand={vi.fn()} onTrash={onTrash} />)
    await user.tab()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{End}{Enter}')
    expect(onTrash).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Row actions' })).toHaveFocus())
  })

  it('checks radio items', async () => {
    const { user } = renderUi(<DemoMenu onExpand={vi.fn()} onTrash={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(screen.getByRole('menuitemradio', { name: 'Comfortable' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(screen.getByRole('menuitemradio', { name: 'Compact' }))
    await user.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(await screen.findByRole('menuitemradio', { name: 'Compact' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('is non-modal: the rest of the page stays exposed', async () => {
    const { user, container } = renderUi(<DemoMenu onExpand={vi.fn()} onTrash={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Row actions' }))
    await screen.findByRole('menu')
    expect(container).not.toHaveAttribute('aria-hidden')
    expect(container.closest('[aria-hidden="true"]')).toBeNull()
  })
})

function DialogDemo({ onReset }: { onReset: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent
        title="Reset sample data"
        description="Every sheet goes back to the original sample rows."
      >
        <DialogFooter>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button variant="danger" onClick={onReset}>
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('is named by its title and described by its description', async () => {
    const { user } = renderUi(<DialogDemo onReset={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reset sample data' })
    expect(dialog).toHaveAccessibleDescription('Every sheet goes back to the original sample rows.')
  })

  it('closes with the close button, Esc and DialogClose, returning focus', async () => {
    const { user } = renderUi(<DialogDemo onReset={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Open dialog' })

    await user.click(trigger)
    await user.click(await screen.findByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('can hide the close button and needs no description', async () => {
    const { user } = renderUi(
      <Dialog defaultOpen>
        <DialogContent title="Shortcuts" hideClose />
      </Dialog>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Shortcuts' })
    expect(dialog).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Popover', () => {
  it('opens on click and closes with Esc', async () => {
    const { user } = renderUi(
      <Popover>
        <PopoverTrigger asChild>
          <Button>Introduced by</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Introduced by details">Krithik Rao</PopoverContent>
      </Popover>,
    )
    await user.click(screen.getByRole('button', { name: 'Introduced by' }))
    const content = await screen.findByRole('dialog', { name: 'Introduced by details' })
    expect(content).toHaveTextContent('Krithik Rao')
    expect(content.className).toContain('shadow-popover')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Krithik Rao')).not.toBeInTheDocument())
  })
})

describe('Tooltip', () => {
  it('shows its content and shortcut on hover', async () => {
    const { user } = renderUi(
      <Tooltip content="Search everyone" shortcut={['Mod', 'K']}>
        <button type="button">Search</button>
      </Tooltip>,
    )
    await user.hover(screen.getByRole('button', { name: 'Search' }))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Search everyone')
    expect(tooltip).toHaveTextContent('Ctrl')
  })

  it('never opens when disabled', async () => {
    const { user } = renderUi(
      <Tooltip content="Hidden" disabled>
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    await user.hover(screen.getByRole('button', { name: 'Trigger' }))
    await user.tab()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
