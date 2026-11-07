/**
 * The calendar week page (Phase 2): weeks from Monday, in IST, and where each event sits in a
 * day's column. Overlapping events share the column side by side, like Google Calendar. Pure.
 */
import { addDaysIso, istInstant, parseIsoDate } from '../dates'
import type { CalendarEvent, IsoDate } from '../types'

export const MINUTES_PER_DAY = 24 * 60

/** The Monday of the IST week holding `date`. */
export function weekStartOf(date: IsoDate): IsoDate {
  const { year, month, day } = parseIsoDate(date)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0 is Sunday
  return addDaysIso(date, -((weekday + 6) % 7))
}

export function weekDays(start: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(start, i))
}

export interface Placed {
  event: CalendarEvent
  /** Minutes from IST midnight, clipped to the day. */
  startMinute: number
  endMinute: number
  /** Side by side: this event's lane out of `lanes`. */
  lane: number
  lanes: number
}

/** True when an all-day event covers the day (its end is the IST midnight after its last day). */
export function coversDay(event: CalendarEvent, day: IsoDate): boolean {
  const from = istInstant(day).getTime()
  const to = istInstant(addDaysIso(day, 1)).getTime()
  return Date.parse(event.start) < to && Date.parse(event.end) > from
}

/** The timed events of one day, placed. Very short events still get a readable height. */
export function layoutDay(
  events: readonly CalendarEvent[],
  day: IsoDate,
  minMinutes = 20,
): Placed[] {
  const from = istInstant(day).getTime()
  const to = istInstant(addDaysIso(day, 1)).getTime()
  const items = events
    .filter((e) => !e.allDay && Date.parse(e.start) < to && Date.parse(e.end) > from)
    .map((event) => {
      const startMinute = Math.max(0, (Date.parse(event.start) - from) / 60_000)
      const endMinute = Math.min(MINUTES_PER_DAY, (Date.parse(event.end) - from) / 60_000)
      return {
        event,
        startMinute,
        endMinute: Math.min(MINUTES_PER_DAY, Math.max(endMinute, startMinute + minMinutes)),
      }
    })
    .sort(
      (a, b) =>
        a.startMinute - b.startMinute ||
        b.endMinute - a.endMinute ||
        a.event.id.localeCompare(b.event.id),
    )

  // Clusters of events that overlap one another; within each, the first free lane.
  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1
  const close = () => {
    const lanes = cluster.reduce((max, p) => Math.max(max, p.lane + 1), 0)
    for (const p of cluster) p.lanes = lanes
    placed.push(...cluster)
    cluster = []
  }
  for (const item of items) {
    if (item.startMinute >= clusterEnd && cluster.length > 0) close()
    const laneEnds: number[] = []
    for (const p of cluster) laneEnds[p.lane] = Math.max(laneEnds[p.lane] ?? 0, p.endMinute)
    let lane = laneEnds.findIndex((end) => end <= item.startMinute)
    if (lane === -1) lane = laneEnds.length
    cluster.push({ ...item, lane, lanes: 1 })
    clusterEnd = Math.max(clusterEnd, item.endMinute)
  }
  if (cluster.length > 0) close()
  return placed
}
