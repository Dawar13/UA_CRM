import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configure, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UaCrmDb } from '@/data/local/db'
import { LocalRepository } from '@/data/local/LocalRepository'
import { seedIds } from '@/data/local/seed'
import { RepositoryProvider } from '@/data/RepositoryContext'
import type { Member } from '@/domain/types'
import {
  agendaDayLabel,
  CalendarPanel,
  weekRangeLabel,
} from '@/features/calendar-panel/CalendarPanel'
import { FROZEN_NOW, freezeClock, restoreClock } from '../ui/renderUi'

configure({ asyncUtilTimeout: 5000 })

let repo: LocalRepository
let qc: QueryClient
let counter = 0

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo}>{children}</RepositoryProvider>
    </QueryClientProvider>
  )
}

async function memberById(id: string): Promise<Member> {
  const member = (await repo.listMembers()).find((m) => m.id === id)
  if (!member) throw new Error(`No member ${id}`)
  return member
}

function renderPanel(member: Member) {
  const router = createMemoryRouter([{ path: '*', element: <CalendarPanel member={member} /> }], {
    initialEntries: ['/m/dawar/investors'],
  })
  return { router, ...render(<RouterProvider router={router} />, { wrapper }) }
}

beforeEach(async () => {
  freezeClock()
  counter += 1
  repo = new LocalRepository(new UaCrmDb(`ua-crm-calendar-panel-${counter}-${Date.now()}`))
  await repo.ensureSeeded()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(async () => {
  restoreClock()
  qc.clear()
  repo.db.close()
  await repo.db.delete()
})

describe('labels', () => {
  it('writes the week range compactly', () => {
    expect(weekRangeLabel('2026-11-05', '2026-11-11', FROZEN_NOW)).toBe('5–11 Nov')
    expect(weekRangeLabel('2026-11-28', '2026-12-04', FROZEN_NOW)).toBe('28 Nov–4 Dec')
    expect(weekRangeLabel('2026-12-28', '2027-01-03', FROZEN_NOW)).toBe('28 Dec 2026–3 Jan 2027')
  })

  it('heads agenda days with Today and Tomorrow, then the date', () => {
    expect(agendaDayLabel('2026-11-05', FROZEN_NOW)).toBe('Today · Thu 5 Nov')
    expect(agendaDayLabel('2026-11-06', FROZEN_NOW)).toBe('Tomorrow · Fri 6 Nov')
    expect(agendaDayLabel('2026-11-09', FROZEN_NOW)).toBe('Mon 9 Nov')
  })
})

describe('CalendarPanel', () => {
  it('shows the week strip, the last 30 days and the agenda for the member', async () => {
    renderPanel(await memberById(seedIds.members.dawar))

    expect(await screen.findByRole('heading', { name: 'This week' })).toHaveAttribute(
      'id',
      'calendar-panel-title',
    )
    expect(screen.getByText('5–11 Nov')).toBeInTheDocument()

    const strip = await screen.findByRole('list', { name: 'Next seven days' })
    const days = within(strip).getAllByRole('listitem')
    expect(days).toHaveLength(7)
    const [today, tomorrow, saturday] = days
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(today).toHaveTextContent('Today, Thu 5 Nov: 2 events')
    expect(within(today as HTMLElement).getAllByTestId('day-bar')).toHaveLength(2)
    expect(tomorrow).toHaveTextContent('Fri 6 Nov: 1 event')
    expect(tomorrow).not.toHaveAttribute('aria-current')
    expect(saturday).toHaveTextContent('Sat 7 Nov: no events')
    expect(within(saturday as HTMLElement).queryAllByTestId('day-bar')).toHaveLength(0)

    const todayAgenda = screen.getByRole('region', { name: 'Today · Thu 5 Nov' })
    const events = within(todayAgenda).getAllByTestId('calendar-event')
    expect(events.map((e) => e.textContent)).toEqual([
      expect.stringContaining('11:30 am'),
      expect.stringContaining('4:00 pm'),
    ])
    expect(screen.getByRole('region', { name: 'Tomorrow · Fri 6 Nov' })).toHaveTextContent(
      'Chakan, Pune',
    )
    expect(screen.getByRole('region', { name: 'Mon 9 Nov' })).toHaveTextContent('Pitch practice')
    expect(screen.getAllByTestId('calendar-event')).toHaveLength(5)

    expect(await screen.findByRole('img', { name: /^Last 30 days: / })).toBeInTheDocument()
  })

  it('jumps to a matched contact from its chip', async () => {
    const user = userEvent.setup()
    const { router } = renderPanel(await memberById(seedIds.members.dawar))
    const today = await screen.findByRole('region', { name: 'Today · Thu 5 Nov' })
    const chip = await within(today).findByRole('button', { name: 'Rohan Mehta' })
    expect(chip).toHaveAccessibleDescription('Dawar · Customers')

    await user.click(chip)
    expect(router.state.location.pathname).toBe('/m/dawar/customers')
    expect(router.state.location.search).toBe(`?row=${seedIds.rows.rohanMehta}`)
  })
})
