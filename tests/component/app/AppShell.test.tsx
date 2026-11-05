import { act, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { routes } from '@/app/routes'
import { useUiStore } from '@/app/uiStore'
import { getDefaultRepository } from '@/data/RepositoryContext'

/**
 * The real app (routes, shell, grid, panel, palette) on the seeded local database, driven like a
 * user would. Browser-level behaviour (layout, focus rings, WebKit) is covered by Playwright.
 */

configure({ asyncUtilTimeout: 8000 })
// Each test boots the whole app on a freshly reset IndexedDB, which is slow in jsdom.
vi.setConfig({ testTimeout: 30_000 })

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const utils = render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  )
  return { ...utils, router }
}

async function findGrid() {
  return screen.findByRole('grid', { name: 'Customers' })
}

function gridRow(rowName: string) {
  const cell = screen.getAllByText(rowName).find((el) => el.closest('[role="row"][data-row-id]'))
  const row = cell?.closest('[role="row"]')
  if (!(row instanceof HTMLElement)) throw new Error(`No grid row for ${rowName}`)
  return row
}

// jsdom has no layout, so every element reports a 0 × 0 client size and the virtualised grid would
// render no rows. Give the grid's scroll element a desktop-sized viewport for these tests.
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
  // Thu 5 Nov 2026, 10:00 IST. Only Date is faked so timers, React and IndexedDB run normally.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T04:30:00.000Z'))
  await getDefaultRepository().resetSampleData()
  useUiStore.setState({
    panelOpen: true,
    panelView: { kind: 'calendar' },
    paletteOpen: false,
    shortcutsOpen: false,
    flashRowId: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('app shell', () => {
  it('opens the last-used member and sheet, and shows brand, tabs, grid and calendar', async () => {
    const { router } = renderApp('/')
    const grid = await findGrid()
    expect(router.state.location.pathname).toBe('/m/dawar/customers')

    expect(screen.getByText('Utopian Autonomy')).toBeInTheDocument()
    expect(screen.getByText('Internal CRM')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Dawar' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Customers' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Investors' })).toBeInTheDocument()

    expect(grid).toHaveAttribute('aria-rowcount', '13')
    expect(await within(grid).findByText('Rohan Mehta')).toBeInTheDocument()
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(
      expect.arrayContaining(['Name', 'Warmth', 'Stage', 'Tags', 'Last touch', 'Next action']),
    )

    const panel = screen.getByTestId('right-panel')
    expect(within(panel).getByText('This week')).toBeInTheDocument()
    expect(await within(panel).findByText('Call with Rohan Mehta')).toBeInTheDocument()
    expect(document.documentElement.dataset.appReady).toBe('true')
  })

  it('moves with the keyboard, expands with Enter and collapses with Esc', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await findGrid()
    await within(grid).findByText('Rohan Mehta')

    grid.focus()
    await user.keyboard('{ArrowDown}')
    const active = () => grid.querySelector('[role="row"][data-active]')
    await waitFor(() => expect(active()).toHaveAttribute('aria-rowindex', '3'))
    expect(grid.getAttribute('aria-activedescendant')).toBeTruthy()

    await user.keyboard('{Enter}')
    const expanded = await screen.findByTestId('expanded-row')
    expect(within(expanded).getByText('Next action')).toBeInTheDocument()
    expect(within(expanded).getByText('History')).toBeInTheDocument()
    expect(grid).toHaveAttribute('aria-rowcount', '14')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('expanded-row')).not.toBeInTheDocument())

    await user.keyboard('{Control>}{End}{/Control}')
    await waitFor(() => expect(active()).toHaveAttribute('aria-rowindex', '13'))
    await user.keyboard('{Control>}{Home}{/Control}')
    await waitFor(() => expect(active()).toHaveAttribute('aria-rowindex', '2'))
  })

  it('cycles warmth with W, records it, and undoes it from the toast', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await findGrid()
    await within(grid).findByText('Rohan Mehta')

    grid.focus()
    // Rohan Mehta is the first row and Warm; W moves to Waiting.
    await user.keyboard('w')
    expect(await screen.findByText('Warmth set to Waiting')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(gridRow('Rohan Mehta')).getByRole('button', { name: /Warmth: Waiting/ }),
      ).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() =>
      expect(
        within(gridRow('Rohan Mehta')).getByRole('button', { name: /Warmth: Warm/ }),
      ).toBeInTheDocument(),
    )
  })

  it('moves the stage with ] and back with [', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    const grid = await findGrid()
    await within(grid).findByText('Rohan Mehta')
    const stage = () => within(gridRow('Rohan Mehta')).getByRole('img', { name: /Stage/ })
    await waitFor(() => expect(stage()).toHaveAccessibleName('Stage 3 of 7: First call'))

    grid.focus()
    await user.keyboard(']')
    await waitFor(() => expect(stage()).toHaveAccessibleName('Stage 4 of 7: Plant visit'))
    expect(await screen.findByText('Moved to Plant visit')).toBeInTheDocument()
    // '[[' types a literal '[' in user-event's keyboard syntax.
    await user.keyboard('[[')
    await waitFor(() => expect(stage()).toHaveAccessibleName('Stage 3 of 7: First call'))
  })

  it('searches across members from the palette and jumps to the row', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/m/dawar/customers')
    await findGrid()

    await user.keyboard('{Control>}k{/Control}')
    const palette = await screen.findByTestId('command-palette')
    await user.keyboard('menon')
    await waitFor(() => expect(within(palette).getAllByTestId('palette-result')).toHaveLength(2))
    // Each label shows as the group heading and on the result itself.
    expect(within(palette).getAllByText('Dawar · Connectors').length).toBeGreaterThan(0)
    expect(within(palette).getAllByText('Dhruv · Investors').length).toBeGreaterThan(0)

    await user.click(within(palette).getAllByTestId('palette-result')[1] as HTMLElement)
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/m/dawar/customers'))
    expect(router.state.location.search).toMatch(/row=/)
    expect(await screen.findByTestId('expanded-row')).toBeInTheDocument()
  })

  it('runs commands from the palette', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/m/dawar/customers')
    await findGrid()
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByTestId('command-palette')
    await user.keyboard('switch dhruv')
    await user.click(await screen.findByText('Switch to Dhruv'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/m/dhruv/customers'))
    expect(await screen.findByRole('tab', { name: 'Dhruv' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('opens the shortcut sheet with ? and toggles the side panel with Ctrl+.', async () => {
    const user = userEvent.setup()
    renderApp('/m/dawar/customers')
    await findGrid()

    await user.keyboard('?')
    const sheet = await screen.findByTestId('shortcut-sheet')
    expect(within(sheet).getByText('Cycle warmth on the active row')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('shortcut-sheet')).not.toBeInTheDocument())

    expect(screen.getByTestId('right-panel')).toBeInTheDocument()
    await user.keyboard('{Control>}.{/Control}')
    await waitFor(() => expect(screen.queryByTestId('right-panel')).not.toBeInTheDocument())
    await user.keyboard('{Control>}.{/Control}')
    expect(await screen.findByTestId('right-panel')).toBeInTheDocument()
  })

  it('switches sheets from the tabs and remembers the last sheet per member', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/m/dawar/customers')
    await findGrid()
    await user.click(screen.getByRole('tab', { name: 'Investors' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/m/dawar/investors'))
    expect(await screen.findByRole('grid', { name: 'Investors' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Dhruv' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/m/dhruv/customers'))
    await user.click(screen.getByRole('tab', { name: 'Dawar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/m/dawar/investors'))
  })

  it('opens a deep-linked row with its history and link chips', async () => {
    renderApp('/m/dhruv/investors?row=r-dhruv-investors-02')
    const expanded = await screen.findByTestId('expanded-row')
    expect(within(expanded).getByText('Introduced by')).toBeInTheDocument()
    expect(await within(expanded).findAllByTestId('link-chip')).not.toHaveLength(0)
    expect((await within(expanded).findAllByTestId('history-entry')).length).toBeGreaterThan(0)
  })

  it('shows the full history in the side panel', async () => {
    const user = userEvent.setup()
    // Two more touches so the row has more than the five entries shown inline.
    const ctx = { actorId: 'm-dawar', now: new Date() }
    await getDefaultRepository().updateWarmth('r-dawar-customers-02', 'cold', ctx)
    await getDefaultRepository().updateWarmth('r-dawar-customers-02', 'warm', ctx)
    renderApp('/m/dawar/customers?row=r-dawar-customers-02')
    const expanded = await screen.findByTestId('expanded-row')
    const showAll = await within(expanded).findByRole('button', { name: /Show all/ })
    await user.click(showAll)
    const history = await screen.findByTestId('history-panel')
    expect(within(history).getAllByTestId('history-entry').length).toBeGreaterThan(5)
    await user.click(screen.getByRole('button', { name: 'Back to this week' }))
    expect(await screen.findByTestId('calendar-panel')).toBeInTheDocument()
  })

  it('redirects a member link to their first sheet and shows not found for unknown paths', async () => {
    const { router, unmount } = renderApp('/m/dhruv')
    await screen.findByRole('grid', { name: 'Customers' })
    expect(router.state.location.pathname).toBe('/m/dhruv/customers')
    unmount()

    renderApp('/m/nobody/customers')
    expect(await screen.findByTestId('not-found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your sheets' })).toHaveAttribute('href', '/')
  })

  it('resets sample data through the test hook', async () => {
    renderApp('/m/dawar/customers')
    await findGrid()
    await waitFor(() => expect(window.__uaTest).toBeDefined())
    await act(async () => {
      await window.__uaTest?.resetSampleData()
    })
    expect(await findGrid()).toBeInTheDocument()
  })
})
