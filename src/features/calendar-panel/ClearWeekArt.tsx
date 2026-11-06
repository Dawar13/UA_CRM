/**
 * The "clear week" mark for the side panel: a small heatmap of the next seven days, one column a
 * day (starting today, like the strip above it) and one row for each part of the working day.
 * The week is free, so the cells are quiet greys; today's column is in light stage blues and a
 * deep blue square marks the part of today we are in. Decorative; the text beside it says it.
 */
import { addDaysIso, istDateOf, weekdayOf } from '@/domain/dates'
import type { IsoDate } from '@/domain/types'

const CELL = 18
const GAP = 4
const LABEL_GAP = 8
const BOTTOM_LABELS = 14
const RIGHT_LABELS = 22
/** Parts of the day: the hour each starts (IST) and its label. */
const SLOTS = [
  { hour: 9, label: '9' },
  { hour: 12, label: '12' },
  { hour: 15, label: '3' },
  { hour: 18, label: '6' },
] as const
const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

/** The IST hour of an instant (IST is a fixed UTC+5:30). */
function istHour(now: Date): number {
  return new Date(now.getTime() + 330 * 60_000).getUTCHours()
}

/** Which slot of today we are in: -1 before 9 am, the last slot after 6 pm. */
function currentSlot(now: Date): number {
  const hour = istHour(now)
  let slot = -1
  SLOTS.forEach((s, i) => {
    if (hour >= s.hour) slot = i
  })
  return slot
}

function cellFill(column: number, row: number, nowSlot: number): string {
  if (column === 0) {
    if (row === nowSlot) return 'var(--stage6)'
    // Earlier today is spent; later today is still open, lightest last.
    if (row < nowSlot) return 'var(--stage-track)'
    return row - nowSlot === 1 ? 'var(--stage2)' : 'var(--stage1)'
  }
  // A quiet, fixed texture of two greys, so the grid reads as a calendar, not a block.
  return (column * 3 + row * 2) % 5 === 1 ? 'var(--grid-line)' : 'var(--stage-track)'
}

export function ClearWeekArt({ today, now }: { today: IsoDate; now: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(today, i))
  const nowSlot = istDateOf(now) === today ? currentSlot(now) : -1
  const gridWidth = days.length * CELL + (days.length - 1) * GAP
  const gridHeight = SLOTS.length * CELL + (SLOTS.length - 1) * GAP
  const width = gridWidth + LABEL_GAP + RIGHT_LABELS
  const height = gridHeight + LABEL_GAP + BOTTOM_LABELS

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      data-testid="clear-week-art"
      className="shrink-0 font-mono"
    >
      {days.map((date, column) =>
        SLOTS.map((slot, row) => (
          <rect
            key={`${date}-${slot.hour}`}
            x={column * (CELL + GAP)}
            y={row * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx="4"
            className="origin-center [transform-box:fill-box] motion-safe:animate-pop-in"
            style={{
              fill: cellFill(column, row, nowSlot),
              animationDelay: `${column * 28 + row * 14}ms`,
              animationFillMode: 'both',
            }}
          />
        )),
      )}
      {days.map((date, column) => (
        <text
          key={date}
          x={column * (CELL + GAP) + CELL / 2}
          y={gridHeight + LABEL_GAP + 9}
          textAnchor="middle"
          fontSize="8.5"
          letterSpacing="0.06em"
          fontWeight={column === 0 ? 600 : 500}
          style={{ fill: column === 0 ? 'var(--text)' : 'var(--text-muted)' }}
        >
          {WEEKDAY[weekdayOf(date)]}
        </text>
      ))}
      {SLOTS.map((slot, row) => (
        <text
          key={slot.hour}
          x={gridWidth + LABEL_GAP}
          y={row * (CELL + GAP) + CELL / 2 + 3}
          fontSize="8.5"
          fontWeight={500}
          style={{ fill: 'var(--text-muted)' }}
        >
          {slot.label}
        </text>
      ))}
    </svg>
  )
}
