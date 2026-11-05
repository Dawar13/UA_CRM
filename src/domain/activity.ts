/**
 * The last 30 days as a field of dots, for the side panel. Pure.
 *
 * - Held: touches logged that day (calls, meetings, WhatsApp and email). Notes, stage and warmth
 *   changes are not touches with the person.
 * - Moved: a stage moved forward that day (undo entries do not count).
 * - Missed: a next action due that day (exact date) that was still open when the day passed: no
 *   touch since, and the row is not lost. In Phase 2 missed calendar meetings join it.
 */
import { addDaysIso, istDateOf, todayIst, weekdayOf } from './dates'
import type { HistoryEntry, HistoryKind, IsoDate, Row } from './types'

export const ACTIVITY_DAYS = 30

export const HELD_KINDS: ReadonlySet<HistoryKind> = new Set<HistoryKind>([
  'call',
  'meeting',
  'whatsapp',
  'email',
])

export interface ActivityDay {
  date: IsoDate
  held: number
  moved: number
  missed: number
  weekend: boolean
  isToday: boolean
}

export interface Activity {
  days: ActivityDay[]
  held: number
  moved: number
  missed: number
}

/** First day of the window: today and the 29 days before it (IST). */
export function activityStart(now: Date, days = ACTIVITY_DAYS): IsoDate {
  return addDaysIso(todayIst(now), -(days - 1))
}

function isForwardMove(entry: HistoryEntry): boolean {
  if (entry.kind !== 'stage' || entry.meta?.undo || entry.meta?.lost) return false
  const from = entry.meta?.fromStageIndex ?? -1
  const to = entry.meta?.toStageIndex
  return typeof to === 'number' && to > from
}

export function activityByDay(
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  now: Date,
  days = ACTIVITY_DAYS,
): Activity {
  const today = todayIst(now)
  const start = activityStart(now, days)
  const index = new Map<IsoDate, ActivityDay>()
  const list: ActivityDay[] = []
  for (let i = 0; i < days; i++) {
    const date = addDaysIso(start, i)
    const weekday = weekdayOf(date)
    const day: ActivityDay = {
      date,
      held: 0,
      moved: 0,
      missed: 0,
      weekend: weekday === 0 || weekday === 6,
      isToday: date === today,
    }
    index.set(date, day)
    list.push(day)
  }

  for (const entry of history) {
    if (entry.fuzzyDate) continue
    const day = index.get(istDateOf(entry.at))
    if (!day) continue
    if (HELD_KINDS.has(entry.kind)) day.held += 1
    else if (isForwardMove(entry)) day.moved += 1
  }

  for (const row of rows) {
    const due = row.nextAction?.date
    if (due?.precision !== 'day' || row.lost || due.date >= today) continue
    const day = index.get(due.date)
    if (!day) continue
    const lastTouch = row.lastTouchAt ? istDateOf(row.lastTouchAt) : null
    if (lastTouch === null || lastTouch < due.date) day.missed += 1
  }

  return {
    days: list,
    held: list.reduce((n, d) => n + d.held, 0),
    moved: list.reduce((n, d) => n + d.moved, 0),
    missed: list.reduce((n, d) => n + d.missed, 0),
  }
}
