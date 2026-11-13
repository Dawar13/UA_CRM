/**
 * Did these happen? (D-059) Today's check-in for the signed-in member's past meetings with a
 * contact, over the local repository and its sample calendar.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AuthContext, type AuthValue } from '@/auth/AuthContext'
import { UaCrmDb } from '@/data/local/db'
import { LocalRepository } from '@/data/local/LocalRepository'
import { seedIds } from '@/data/local/seed'
import { RepositoryProvider } from '@/data/RepositoryContext'
import type { Member } from '@/domain/types'
import { MeetingsToConfirm } from '@/features/calendar/MeetingsToConfirm'
import { freezeClock, restoreClock } from '../ui/renderUi'

configure({ asyncUtilTimeout: 5000 })

// Fri 6 Nov, noon IST: Dawar's call with Rohan (5 Nov) and plant walk with Sunita (6 Nov, 10 am)
// have ended; the founders' sync has no contact.
const LATER = new Date('2026-11-06T12:00:00+05:30')

let repo: LocalRepository
let qc: QueryClient
let counter = 0
let actor: Member | null = null

function wrapper({ children }: { children: ReactNode }) {
  const auth = { mode: 'local', status: 'signed-in', member: actor } as unknown as AuthValue
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={auth}>
        <RepositoryProvider repository={repo}>{children}</RepositoryProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

function renderCheckIn() {
  const router = createMemoryRouter([{ path: '*', element: <MeetingsToConfirm /> }], {
    initialEntries: ['/today'],
  })
  return render(<RouterProvider router={router} />, { wrapper })
}

const ctx = () => ({ actorId: seedIds.members.dawar, now: LATER })

beforeEach(async () => {
  freezeClock(LATER)
  counter += 1
  repo = new LocalRepository(new UaCrmDb(`ua-crm-confirm-${counter}-${Date.now()}`))
  await repo.ensureSeeded()
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  actor = (await repo.listMembers()).find((m) => m.id === seedIds.members.dawar) ?? null
})

afterEach(async () => {
  restoreClock()
  qc.clear()
  repo.db.close()
  await repo.db.delete()
})

describe('MeetingsToConfirm', () => {
  it('asks about each past meeting with a contact, oldest first', async () => {
    renderCheckIn()
    const section = await screen.findByRole('region', { name: /did these happen/i })
    const items = await within(section).findAllByTestId('today-confirm-meeting')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Call with Rohan Mehta'),
      expect.stringContaining('Plant walk: Deccan Castings'),
    ])
    const first = items[0] as HTMLElement
    expect(first).toHaveTextContent('Thu 5 Nov · 11:30 am')
    expect(within(first).getByRole('button', { name: 'Rohan Mehta' })).toBeVisible()
  })

  it('Missed marks the meeting and it leaves the list', async () => {
    const user = userEvent.setup()
    renderCheckIn()
    await user.click(await screen.findByRole('button', { name: 'Missed: Call with Rohan Mehta' }))
    await waitFor(() => expect(screen.getAllByTestId('today-confirm-meeting')).toHaveLength(1))
    expect(await repo.listMeetingMarks(ctx())).toEqual([
      { eventKey: 'e-dawar-01', outcome: 'missed' },
    ])
  })

  it('All held answers every meeting, and the section goes', async () => {
    const user = userEvent.setup()
    renderCheckIn()
    await user.click(await screen.findByRole('button', { name: 'All held' }))
    await waitFor(() => expect(screen.queryByTestId('today-confirm')).not.toBeInTheDocument())
    expect(await repo.listMeetingMarks(ctx())).toEqual(
      expect.arrayContaining([
        { eventKey: 'e-dawar-01', outcome: 'held' },
        { eventKey: 'e-dawar-03', outcome: 'held' },
      ]),
    )
  })

  it('shows nothing while no meeting has ended', async () => {
    freezeClock(new Date('2026-11-05T10:00:00+05:30'))
    const { container } = renderCheckIn()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(container).toBeEmptyDOMElement()
  })
})
