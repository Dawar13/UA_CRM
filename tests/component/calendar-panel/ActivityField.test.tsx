import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configure, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UaCrmDb } from '@/data/local/db'
import { LocalRepository } from '@/data/local/LocalRepository'
import { seedIds } from '@/data/local/seed'
import { RepositoryProvider } from '@/data/RepositoryContext'
import { type Activity, activityByDay, activityStart } from '@/domain/activity'
import { addDaysIso, istInstant, weekdayOf } from '@/domain/dates'
import {
  ActivityField,
  ActivityFieldView,
  activityDayTitle,
  activitySummary,
} from '@/features/calendar-panel/ActivityField'
import { FROZEN_NOW, freezeClock, renderUi, restoreClock } from '../ui/renderUi'

configure({ asyncUtilTimeout: 5000 })

const START = '2026-10-07'
const TODAY = '2026-11-05'

/** Thirty empty days ending on Thu 5 Nov 2026, with the given counts filled in. */
function fixture(counts: Record<string, { held?: number; moved?: number; missed?: number }>) {
  const days = Array.from({ length: 30 }, (_, k) => {
    const date = addDaysIso(START, k)
    const weekday = weekdayOf(date)
    const c = counts[date] ?? {}
    return {
      date,
      held: c.held ?? 0,
      moved: c.moved ?? 0,
      missed: c.missed ?? 0,
      weekend: weekday === 0 || weekday === 6,
      isToday: date === TODAY,
    }
  })
  const total = (key: 'held' | 'moved' | 'missed') => days.reduce((n, d) => n + d[key], 0)
  const activity: Activity = {
    days,
    held: total('held'),
    moved: total('moved'),
    missed: total('missed'),
  }
  return activity
}

const sample = fixture({
  '2026-11-02': { held: 3, moved: 1, missed: 1 }, // Mon
  '2026-10-20': { held: 7 }, // more than the six slots
  '2026-10-21': { held: 6, moved: 2 }, // the moved dot takes the top slot
  '2026-10-22': { missed: 5 }, // more than the three slots below
  '2026-11-05': { held: 1 },
})

function column(container: HTMLElement, date: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-date="${date}"]`)
  if (!el) throw new Error(`No column for ${date}`)
  return el
}

function dots(col: HTMLElement, kind: string): HTMLElement[] {
  return [...col.querySelectorAll<HTMLElement>(`[data-kind="${kind}"]`)]
}

function shades(list: HTMLElement[]): string[] {
  return list.map((d) => d.style.background)
}

describe('ActivityFieldView', () => {
  it('draws one column per day, oldest first', () => {
    const { container } = renderUi(<ActivityFieldView activity={sample} now={FROZEN_NOW} />)
    const columns = container.querySelectorAll('[data-date]')
    expect(columns).toHaveLength(30)
    expect(columns[0]).toHaveAttribute('data-date', START)
    expect(columns[29]).toHaveAttribute('data-date', TODAY)
  })

  it('stacks held dots in deepening shades, a moved dot on top and missed dots below', () => {
    const { container } = renderUi(<ActivityFieldView activity={sample} now={FROZEN_NOW} />)
    const monday = column(container, '2026-11-02')
    expect(shades(dots(monday, 'held'))).toEqual([
      'var(--field-up1)',
      'var(--field-up2)',
      'var(--field-up3)',
    ])
    const moved = dots(monday, 'moved')
    expect(moved).toHaveLength(1)
    expect(moved[0]?.style.background).toBe('var(--field-moved)')
    // The upper area is a reversed column, so the last child is drawn on top.
    expect(moved[0]?.parentElement?.lastElementChild).toBe(moved[0])
    expect(shades(dots(monday, 'missed'))).toEqual(['var(--field-down1)'])
  })

  it('caps a busy day at the slots it has, deepening to the last shade', () => {
    const { container } = renderUi(<ActivityFieldView activity={sample} now={FROZEN_NOW} />)
    expect(shades(dots(column(container, '2026-10-20'), 'held'))).toEqual([
      'var(--field-up1)',
      'var(--field-up2)',
      'var(--field-up3)',
      'var(--field-up4)',
      'var(--field-up5)',
      'var(--field-up5)',
    ])
    const busyAndMoved = column(container, '2026-10-21')
    expect(dots(busyAndMoved, 'held')).toHaveLength(5)
    expect(dots(busyAndMoved, 'moved')).toHaveLength(1)
    expect(shades(dots(column(container, '2026-10-22'), 'missed'))).toEqual([
      'var(--field-down1)',
      'var(--field-down2)',
      'var(--field-down3)',
    ])
    // Exact counts stay in the tooltip.
    expect(column(container, '2026-10-20')).toHaveAttribute('title', 'Tue 20 Oct: 7 held')
  })

  it('shades weekends and outlines today', () => {
    const { container } = renderUi(<ActivityFieldView activity={sample} now={FROZEN_NOW} />)
    const weekends = [...container.querySelectorAll('[data-weekend="true"]')].map((el) =>
      el.getAttribute('data-date'),
    )
    expect(weekends).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-17',
      '2026-10-18',
      '2026-10-24',
      '2026-10-25',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(column(container, '2026-10-10').className).toContain('bg-(--field-weekend)')
    const today = column(container, TODAY)
    expect(today).toHaveAttribute('data-today', 'true')
    expect(today.className).toContain('var(--today-line)')
    expect(container.querySelectorAll('[data-today]')).toHaveLength(1)
  })

  it('names each day in its tooltip', () => {
    const { container } = renderUi(<ActivityFieldView activity={sample} now={FROZEN_NOW} />)
    expect(column(container, '2026-11-02')).toHaveAttribute(
      'title',
      'Mon 2 Nov: 3 held, a stage moved, 1 missed',
    )
    expect(column(container, '2026-10-21')).toHaveAttribute(
      'title',
      'Wed 21 Oct: 6 held, 2 stages moved',
    )
    expect(column(container, '2026-10-08')).toHaveAttribute('title', 'Thu 8 Oct: 0 held')
  })

  it('is one image named by its totals, with the totals, axis and legend in view', () => {
    renderUi(<ActivityFieldView activity={sample} now={FROZEN_NOW} />)
    expect(
      screen.getByRole('img', {
        name: 'Last 30 days: 17 touches held, 3 stage moves, 6 missed',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Last 30 days' })).toBeInTheDocument()
    expect(screen.getByText('17 held · 6 missed')).toBeInTheDocument()
    expect([...screen.getByTestId('activity-axis').children].map((el) => el.textContent)).toEqual([
      '7 Oct',
      '14 Oct',
      '21 Oct',
      '28 Oct',
      'Today',
    ])

    const legend = screen.getByRole('list')
    const items = within(legend).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['held', 'stage moved', 'missed'])
    const legendShades = items.map((li) =>
      [...li.querySelectorAll<HTMLElement>('[style]')].map((d) => d.style.background),
    )
    expect(legendShades).toEqual([
      [
        'var(--field-up1)',
        'var(--field-up2)',
        'var(--field-up3)',
        'var(--field-up4)',
        'var(--field-up5)',
      ],
      ['var(--field-moved)'],
      ['var(--field-down1)', 'var(--field-down2)', 'var(--field-down3)', 'var(--field-down4)'],
    ])
  })

  it('uses the singular for one touch and one stage move', () => {
    const one = fixture({ '2026-11-03': { held: 1, moved: 1 } })
    expect(activitySummary(one)).toBe('Last 30 days: 1 touch held, 1 stage move, 0 missed')
    const day = one.days.find((d) => d.date === '2026-11-03')
    if (!day) throw new Error('missing day')
    expect(activityDayTitle(day, FROZEN_NOW)).toBe('Tue 3 Nov: 1 held, a stage moved')
  })
})

describe('ActivityField', () => {
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

  beforeEach(async () => {
    freezeClock()
    counter += 1
    repo = new LocalRepository(new UaCrmDb(`ua-crm-activity-${counter}-${Date.now()}`))
    await repo.ensureSeeded()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(async () => {
    restoreClock()
    qc.clear()
    repo.db.close()
    await repo.db.delete()
  })

  it('shows a skeleton, then the member’s last 30 days from their rows and history', async () => {
    const member = seedIds.members.dawar
    render(<ActivityField memberId={member} />, { wrapper })
    expect(await screen.findByRole('status', { name: 'Loading the last 30 days' })).toBeVisible()

    const now = new Date()
    const range = {
      from: istInstant(activityStart(now)).toISOString(),
      to: istInstant(addDaysIso(TODAY, 1)).toISOString(),
    }
    const expected = activityByDay(
      await repo.listMemberHistory(member, range),
      await repo.listMemberRows(member),
      now,
    )
    const field = await screen.findByRole('img', { name: activitySummary(expected) })
    expect(field.querySelectorAll('[data-date]')).toHaveLength(30)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
