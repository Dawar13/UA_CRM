/**
 * The Today view for the signed-in member (CLAUDE.md §2.9): next actions that are overdue, those
 * due today, and the rows added this week. Lost rows are left out. Pure.
 */
import {
  addDaysIso,
  compareFuzzy,
  isOverdue,
  isToday,
  istDateOf,
  todayIst,
  weekdayOf,
} from './dates'
import type { Row } from './types'

export interface TodayItems {
  overdue: Row[]
  dueToday: Row[]
  addedThisWeek: Row[]
}

/** Monday of the IST week that `now` falls in. */
export function weekStartIst(now: Date): string {
  const today = todayIst(now)
  // weekdayOf: 0 is Sunday … 6 is Saturday.
  const back = (weekdayOf(today) + 6) % 7
  return addDaysIso(today, -back)
}

export function todayItems(rows: readonly Row[], now: Date): TodayItems {
  const live = rows.filter((r) => r.deletedAt === null && r.lost === null)
  const dated = live.filter((r) => r.nextAction?.date)
  const byDate = (a: Row, b: Row) =>
    compareFuzzy(a.nextAction?.date ?? null, b.nextAction?.date ?? null) ||
    a.name.localeCompare(b.name)
  const weekStart = weekStartIst(now)
  return {
    overdue: dated
      .filter((r) => {
        const date = r.nextAction?.date
        return date ? isOverdue(date, now) && !isToday(date, now) : false
      })
      .sort(byDate),
    dueToday: dated
      .filter((r) => (r.nextAction?.date ? isToday(r.nextAction.date, now) : false))
      .sort(byDate),
    addedThisWeek: live
      .filter((r) => istDateOf(r.createdAt) >= weekStart)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }
}
