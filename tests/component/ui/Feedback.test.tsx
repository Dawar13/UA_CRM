import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Pill } from '@/components/ui/Pill'
import { Separator } from '@/components/ui/Separator'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { Textarea } from '@/components/ui/Textarea'
import { TOAST_DURATION_MS, Toaster, toast, undoToast } from '@/components/ui/Toast'
import { renderUi } from './renderUi'

describe('Toast', () => {
  it('shows an undo toast for 8 seconds in a polite live region', async () => {
    expect(TOAST_DURATION_MS).toBe(8000)
    const onUndo = vi.fn()
    const { user } = renderUi(<Toaster />)
    act(() => {
      undoToast('Moved to Plant visit', onUndo, { description: 'Rohan Mehta · Customers' })
    })
    expect(await screen.findByText('Moved to Plant visit')).toBeInTheDocument()
    expect(screen.getByText('Rohan Mehta · Customers')).toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('styles toasts with tokens, not sonner defaults', async () => {
    renderUi(<Toaster />)
    act(() => {
      toast('Warmth set to Warm')
    })
    const text = await screen.findByText('Warmth set to Warm')
    const item = text.closest('[data-sonner-toast]')
    expect(item).toHaveAttribute('data-styled', 'false')
    expect(item?.className).toContain('bg-surface-raised')
    act(() => {
      toast.dismiss()
    })
    await waitFor(() => expect(screen.queryByText('Warmth set to Warm')).not.toBeInTheDocument())
  })
})

describe('Input and Textarea', () => {
  it('are labelled text fields that accept typing', async () => {
    const { user } = renderUi(
      <>
        <label htmlFor="name">Name</label>
        <Input id="name" placeholder="Search people" />
        <label htmlFor="notes">Notes</label>
        <Textarea id="notes" />
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAttribute('type', 'text')
    await user.type(input, 'Rohan')
    expect(input).toHaveValue('Rohan')
    const notes = screen.getByRole('textbox', { name: 'Notes' })
    expect(notes.tagName).toBe('TEXTAREA')
    expect(notes).toHaveAttribute('rows', '3')
  })

  it('shows invalid and disabled states', () => {
    renderUi(
      <>
        <Input aria-label="Phone" aria-invalid="true" />
        <Input aria-label="City" disabled />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Phone' })).toBeInvalid()
    expect(screen.getByRole('textbox', { name: 'City' })).toBeDisabled()
  })
})

describe('Pill, Skeleton and Separator', () => {
  it('renders pills in each tone', () => {
    renderUi(
      <>
        <Pill>Decision maker</Pill>
        <Pill tone="brand">Internal CRM</Pill>
      </>,
    )
    expect(screen.getByText('Decision maker').className).toContain('bg-pill-bg')
    expect(screen.getByText('Internal CRM').className).toContain('text-brand-tint-fg')
  })

  it('hides skeletons and decorative separators from assistive tech', () => {
    const { container } = renderUi(
      <>
        <Skeleton data-testid="skeleton" />
        <Separator data-testid="sep" />
        <Separator decorative={false} orientation="vertical" />
      </>,
    )
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('sep')).toHaveAttribute('role', 'none')
    const semantic = screen.getByRole('separator')
    expect(semantic).toHaveAttribute('aria-orientation', 'vertical')
    expect(container.querySelectorAll('.bg-border').length).toBeGreaterThanOrEqual(2)
  })
})

describe('EmptyState', () => {
  it('shows a title, a description, decorative art and an action', async () => {
    const onClick = vi.fn()
    const { user, container } = renderUi(
      <EmptyState
        title="No one here yet"
        description="People added to this sheet show up here."
        action={<Button onClick={onClick}>Clear search</Button>}
      />,
    )
    expect(screen.getByText('No one here yet')).toBeInTheDocument()
    expect(screen.getByText('People added to this sheet show up here.')).toBeInTheDocument()
    const art = container.querySelector('svg')
    expect(art).toHaveAttribute('aria-hidden', 'true')
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('gives each art instance its own gradient ids', () => {
    const { container } = renderUi(
      <>
        <EmptyState title="A" />
        <EmptyState title="B" />
      </>,
    )
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('can drop the art', () => {
    const { container } = renderUi(<EmptyState title="Nothing matches" art={false} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('Tabs', () => {
  it('moves and activates with arrow keys', async () => {
    const { user } = renderUi(
      <Tabs defaultValue="history">
        <TabsList aria-label="Row detail">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
        </TabsList>
        <TabsContent value="history">History panel</TabsContent>
        <TabsContent value="links">Links panel</TabsContent>
      </Tabs>,
    )
    const history = screen.getByRole('tab', { name: 'History' })
    expect(history).toHaveAttribute('aria-selected', 'true')
    await user.tab()
    expect(history).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    const links = screen.getByRole('tab', { name: 'Links' })
    expect(links).toHaveFocus()
    expect(links).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Links panel')
  })
})
