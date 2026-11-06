/**
 * Editing the grid (Phase 1 M1.3) in the real app on the seeded local database: typing into a
 * cell, choosing from a list, tags, adding and trashing rows, clearing a cell, undo, and the
 * view-only refusal in another member's tab. Browser-level behaviour is covered by Playwright
 * (tests/e2e/editing.spec.ts); these run the same code paths under coverage.
 */
import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { routes } from '@/app/routes'
import { useUiStore } from '@/app/uiStore'
import { seedIds } from '@/data/local/seed'
import { getDefaultRepository } from '@/data/RepositoryContext'
import { useUndoStack } from '@/lib/undoStack'

configure({
  asyncUtilTimeout: 8000,
  getElementError: (message) =>
    Object.assign(new Error(message ?? ''), { name: 'TestingLibraryElementError' }),
})
vi.setConfig({ testTimeout: 30_000 })

const ROHAN = seedIds.rows.rohanMehta

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  )
}

async function openGrid(firstRowId: string = ROHAN) {
  const grid = await screen.findByRole('grid', { name: 'Customers' })
  await waitFor(() => rowById(grid, firstRowId))
  return grid
}

function rowById(grid: HTMLElement, id: string): HTMLElement {
  const row = grid.querySelector(`[role="row"][data-row-id="${id}"]`)
  if (!(row instanceof HTMLElement)) throw new Error(`No grid row ${id}`)
  return row
}

function cell(grid: HTMLElement, id: string, key: string): HTMLElement {
  const found = rowById(grid, id).querySelector(`[data-col="${key}"]`)
  if (!(found instanceof HTMLElement)) throw new Error(`No ${key} cell`)
  return found
}

const editor = () => screen.findByTestId('cell-editor')

// jsdom has no layout: give the grid a desktop-sized viewport so the virtualised rows render.
const sizeProps = ['clientWidth', 'clientHeight'] as const
const originalSize = sizeProps.map((p) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, p))

beforeAll(async () => {
  for (const prop of sizeProps) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        if (this.getAttribute('role') !== 'grid') return 0
        return prop === 'clientWidth' ? 1200 : 800
      },
    })
  }
  await getDefaultRepository().ensureSeeded()
})

afterAll(() => {
  sizeProps.forEach((prop, i) => {
    const descriptor = originalSize[i]
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor)
  })
})

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T04:30:00.000Z'))
  await getDefaultRepository().resetSampleData()
  useUndoStack.getState().clear()
  useUiStore.setState({
    panelOpen: false,
    paletteOpen: false,
    shortcutsOpen: false,
    flashRowId: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('editing the grid', () => {
  it('typing replaces a text cell, Enter saves it, and undo puts it back', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await openGrid()
    const before = (await getDefaultRepository().getRow(ROHAN))?.company

    await user.click(cell(grid, ROHAN, 'company'))
    await user.keyboard('Acme Forge')
    expect(await editor()).toBeInTheDocument()
    await user.keyboard('{Enter}')

    await waitFor(async () =>
      expect((await getDefaultRepository().getRow(ROHAN))?.company).toBe('Acme Forge'),
    )
    expect(cell(grid, ROHAN, 'company')).toHaveTextContent('Acme Forge')

    grid.focus()
    await user.keyboard('{Control>}z{/Control}')
    await waitFor(async () =>
      expect((await getDefaultRepository().getRow(ROHAN))?.company).toBe(before),
    )
  })

  it('Esc cancels an edit without saving', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await openGrid()
    const before = (await getDefaultRepository().getRow(ROHAN))?.title

    await user.click(cell(grid, ROHAN, 'title'))
    await user.keyboard('{Enter}')
    await editor()
    await user.keyboard('{Control>}a{/Control}Nobody')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('cell-editor')).not.toBeInTheDocument())
    expect((await getDefaultRepository().getRow(ROHAN))?.title).toBe(before)
  })

  it('a dropdown cell takes a typed choice', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await openGrid()

    await user.click(cell(grid, ROHAN, 'archetype'))
    await user.keyboard('{Enter}')
    const box = await editor()
    await user.keyboard('pharm')
    await waitFor(() =>
      expect(
        within(box)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Pharma']),
    )
    await user.keyboard('{Enter}')
    await waitFor(async () =>
      expect((await getDefaultRepository().getRow(ROHAN))?.fields.archetype).toBe('Pharma'),
    )
  })

  it('N adds a row with its name typed straight in, and undo removes it', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await openGrid()
    const count = (await getDefaultRepository().listRows(seedIds.sheets.dawarCustomers)).length

    grid.focus()
    await user.keyboard('n')
    await editor()
    await user.keyboard('Asha Rao{Enter}')
    expect(await within(grid).findByText('Asha Rao')).toBeInTheDocument()
    await waitFor(async () =>
      expect(await getDefaultRepository().listRows(seedIds.sheets.dawarCustomers)).toHaveLength(
        count + 1,
      ),
    )

    await useUndoStack.getState().undo()
    await waitFor(() => expect(within(grid).queryByText('Asha Rao')).not.toBeInTheDocument())
  })

  it('Delete clears a cell, and Ctrl+Delete moves the row to Trash', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await openGrid()

    await user.click(cell(grid, ROHAN, 'title'))
    await user.keyboard('{Delete}')
    await waitFor(async () => expect((await getDefaultRepository().getRow(ROHAN))?.title).toBe(''))

    await user.keyboard('{Control>}{Delete}{/Control}')
    await waitFor(() =>
      expect(grid.querySelector(`[data-row-id="${ROHAN}"]`)).not.toBeInTheDocument(),
    )
    // A trashed row is no longer listed (and comes back from Trash or Undo).
    const listed = await getDefaultRepository().listRows(seedIds.sheets.dawarCustomers)
    expect(listed.map((r) => r.id)).not.toContain(ROHAN)

    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(grid.querySelector(`[data-row-id="${ROHAN}"]`)).toBeInTheDocument())
  })

  it('tags are added from the tag editor', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await openGrid()

    await user.click(cell(grid, ROHAN, 'tags'))
    await user.keyboard('{Enter}')
    const box = await editor()
    expect(box).toHaveTextContent('Enter picks · Tab saves')
    await user.keyboard('defen')
    await within(box).findByRole('option', { name: /defence/i })
    await user.keyboard('{Enter}{Tab}')
    await waitFor(async () =>
      expect((await getDefaultRepository().getRow(ROHAN))?.tagIds).toContain(seedIds.tags.defence),
    )
  })
})

describe("another member's tab", () => {
  it('ignores edit keys and says once that the tab is view only', async () => {
    const user = userEvent.setup()
    renderApp('/m/dhruv/customers')
    const grid = await openGrid(seedIds.rows.naveenGowda)
    const rows = (await getDefaultRepository().listRows(seedIds.sheets.dhruvCustomers)).length

    grid.focus()
    await user.keyboard('n')
    expect(await screen.findByText("Dhruv's sheets are view only")).toBeInTheDocument()
    await user.keyboard('x{Enter}{Delete}')
    expect(screen.queryByTestId('cell-editor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-row')).not.toBeInTheDocument()
    expect(await getDefaultRepository().listRows(seedIds.sheets.dhruvCustomers)).toHaveLength(rows)
  })
})
