import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { routes } from '@/app/routes'
import { SUMMARY_OPEN_KEY, useUiStore } from '@/app/uiStore'
import { getDefaultRepository } from '@/data/RepositoryContext'

/**
 * The folder layout in the real app on the seeded local database: the tabs, the folder front and
 * the grid in one folder, and the open tab folding the front.
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

function sheetTab(name: string) {
  return within(screen.getByRole('tablist', { name: 'Sheets' })).getByRole('tab', { name })
}

beforeAll(async () => {
  await getDefaultRepository().ensureSeeded()
})

beforeEach(async () => {
  // Thu 5 Nov 2026, 10:00 IST. Only Date is faked so timers, React and IndexedDB run normally.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T04:30:00.000Z'))
  await getDefaultRepository().resetSampleData()
  useUiStore.setState({ summaryOpen: true, panelOpen: true, panelView: { kind: 'calendar' } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('folder layout', () => {
  it('puts the folder front and the grid in one folder under the tabs', async () => {
    renderApp('/m/dawar/customers')
    const grid = await screen.findByRole('grid', { name: 'Customers' })
    const folder = screen.getByRole('region', { name: 'Dawar · Customers' })
    const summary = within(folder).getByRole('region', { name: 'Customers summary' })
    expect(folder).toContainElement(grid)
    expect(summary).toHaveAttribute('data-folder', '1')
    expect(summary).toHaveTextContent('Owned by Dawar · 7 stages')
    expect(sheetTab('Customers')).toHaveAttribute('data-folder', '1')
    // The side panel toggle stays at the end of the tab row.
    expect(screen.getByRole('button', { name: 'Hide side panel' })).toBeInTheDocument()
    expect(screen.getByTestId('right-panel')).toBeInTheDocument()
    expect(document.documentElement.dataset.appReady).toBe('true')
  })

  it('folds the front from the open tab, keeps it folded across sheets, and remembers it', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/m/dawar/customers')
    await screen.findByRole('grid', { name: 'Customers' })

    await user.click(sheetTab('Customers'))
    const folded = screen.getByRole('region', { name: 'Customers summary' })
    expect(folded).toHaveAttribute('data-state', 'closed')
    expect(window.localStorage.getItem(SUMMARY_OPEN_KEY)).toBe('false')
    expect(router.state.location.pathname).toBe('/m/dawar/customers')

    // Switching sheets does not unfold it; the new sheet takes its own folder colour.
    await user.click(sheetTab('Connectors'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/m/dawar/connectors'))
    const connectors = await screen.findByRole('region', { name: 'Connectors summary' })
    expect(connectors).toHaveAttribute('data-state', 'closed')
    expect(connectors).toHaveAttribute('data-folder', '4')

    await user.click(sheetTab('Connectors'))
    expect(screen.getByRole('region', { name: 'Connectors summary' })).toHaveAttribute(
      'data-state',
      'open',
    )
    expect(screen.getByRole('heading', { name: 'By relationship' })).toBeInTheDocument()
    expect(window.localStorage.getItem(SUMMARY_OPEN_KEY)).toBe('true')
  })
})
