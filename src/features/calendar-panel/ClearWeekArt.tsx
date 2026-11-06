/**
 * The "clear week" art for the side panel: the empty-state heatmap read as the next seven days,
 * one column a day from today and one row for each part of the working day (9, 12, 3, 6). The
 * deep-blue cell in today's column is the part of the day we are in. Decorative; the text beside
 * it says it.
 */
import { HeatmapArt } from '@/components/ui/EmptyState'
import { istDateOf } from '@/domain/dates'
import type { IsoDate } from '@/domain/types'

/** Parts of the day: the hour each starts (IST) and its label. */
const SLOTS = [
  { hour: 9, label: '9' },
  { hour: 12, label: '12' },
  { hour: 15, label: '3' },
  { hour: 18, label: '6' },
] as const

/** The IST hour of an instant (IST is a fixed UTC+5:30). */
function istHour(now: Date): number {
  return new Date(now.getTime() + 330 * 60_000).getUTCHours()
}

/** Which part of today we are in: -1 before 9 am, the last one after 6 pm. */
export function currentSlot(now: Date): number {
  const hour = istHour(now)
  let slot = -1
  SLOTS.forEach((s, i) => {
    if (hour >= s.hour) slot = i
  })
  return slot
}

export function ClearWeekArt({ today, now }: { today: IsoDate; now: Date }) {
  return (
    <HeatmapArt
      nowRow={istDateOf(now) === today ? currentSlot(now) : -1}
      rowLabels={SLOTS.map((s) => s.label)}
      data-testid="clear-week-art"
    />
  )
}
