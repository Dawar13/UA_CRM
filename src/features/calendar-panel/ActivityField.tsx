import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCalendarEvents, useMemberHistory, useMemberRows } from '@/data/hooks'
import { type Activity, type ActivityDay, activityByDay, activityStart } from '@/domain/activity'
import { missedMeetingStarts } from '@/domain/calendar/meetings'
import { addDaysIso, formatDate, istInstant, todayIst } from '@/domain/dates'
import type { Id, IsoDate } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { useMeetingMarks } from '../calendar/useCalendar'
import { useAfterIdle } from './useAfterIdle'

/**
 * The last 30 days as a field of dots, under the week strip in the side panel.
 *
 * Each day is a column. Above the sand zero line: one dot per touch held, stacked upwards, each
 * one a shade deeper so busy days read darker, then a blue dot on top when a stage moved. Below
 * it: one dot per missed follow-up or meeting, hanging down from ochre to brick. Weekends are
 * shaded and today is outlined. Colours come from the --field-* tokens.
 */

/** Dot slots above the zero line (held, then the stage-move dot) and below it (missed). */
export const UP_SLOTS = 6
export const DOWN_SLOTS = 3
/** Shades in the held ramp (--field-up1…5) and the missed ramp (--field-down1…4). */
export const HELD_SHADES = 5
export const MISSED_SHADES = 4

const DOT = 7
const GAP = 2

/** The j-th held dot of a day (0-based): deeper as the day gets busier. */
export function heldShade(j: number): string {
  return `var(--field-up${Math.min(j, HELD_SHADES - 1) + 1})`
}

/** The j-th missed dot of a day (0-based). */
export function missedShade(j: number): string {
  return `var(--field-down${Math.min(j, MISSED_SHADES - 1) + 1})`
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "Last 30 days: 72 touches held, 9 stage moves, 1 missed", the field's accessible name. */
export function activitySummary(activity: Activity): string {
  return [
    `Last ${activity.days.length} days: ${plural(activity.held, 'touch', 'touches')} held`,
    plural(activity.moved, 'stage move', 'stage moves'),
    `${activity.missed} missed`,
  ].join(', ')
}

/** Tooltip for one column: "Mon 2 Nov: 3 held, a stage moved, 1 missed". */
export function activityDayTitle(day: ActivityDay, now: Date): string {
  const parts = [`${day.held} held`]
  if (day.moved === 1) parts.push('a stage moved')
  else if (day.moved > 1) parts.push(`${day.moved} stages moved`)
  if (day.missed > 0) parts.push(`${day.missed} missed`)
  return `${formatDate(day.date, now, { weekday: true })}: ${parts.join(', ')}`
}

/** Axis label without the year: "7 Oct". */
function axisDate(date: IsoDate, now: Date): string {
  return formatDate(date, now).replace(/\s\d{4}$/, '')
}

function Dot({ colour, kind, shade }: { colour: string; kind: string; shade?: number }) {
  return (
    <span
      data-kind={kind}
      data-shade={shade}
      className="size-[7px] shrink-0 rounded-full"
      style={{ background: colour }}
    />
  )
}

function Column({ day, now }: { day: ActivityDay; now: Date }) {
  const moved = day.moved > 0
  const held = Math.min(day.held, moved ? UP_SLOTS - 1 : UP_SLOTS)
  const missed = Math.min(day.missed, DOWN_SLOTS)
  return (
    <div
      title={activityDayTitle(day, now)}
      data-date={day.date}
      data-weekend={day.weekend ? 'true' : undefined}
      data-today={day.isToday ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col items-center rounded-[3px]',
        day.weekend && 'bg-(--field-weekend)',
        day.isToday && 'shadow-[inset_0_0_0_1px_var(--today-line)]',
      )}
    >
      {/* Reversed column: the first dot sits on the zero line and the rest stack upwards. */}
      <div
        className="flex flex-col-reverse items-center gap-0.5 overflow-hidden pb-0.5"
        style={{ height: UP_SLOTS * (DOT + GAP) }}
      >
        {Array.from({ length: held }, (_, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional.
          <Dot key={j} kind="held" shade={Math.min(j, HELD_SHADES - 1) + 1} colour={heldShade(j)} />
        ))}
        {moved ? <Dot kind="moved" colour="var(--field-moved)" /> : null}
      </div>
      <div className="h-[3px] w-full bg-field-zero" />
      <div
        className="flex flex-col items-center gap-0.5 overflow-hidden pt-0.5"
        style={{ height: DOWN_SLOTS * (DOT + GAP) }}
      >
        {Array.from({ length: missed }, (_, j) => (
          <Dot
            // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional.
            key={j}
            kind="missed"
            shade={Math.min(j, MISSED_SHADES - 1) + 1}
            colour={missedShade(j)}
          />
        ))}
      </div>
    </div>
  )
}

function LegendDots({ colours }: { colours: readonly string[] }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
      {colours.map((colour) => (
        <span
          key={colour}
          className="size-[7px] shrink-0 rounded-full"
          style={{ background: colour }}
        />
      ))}
    </span>
  )
}

const heldLegend = Array.from({ length: HELD_SHADES }, (_, j) => heldShade(j))
const missedLegend = Array.from({ length: MISSED_SHADES }, (_, j) => missedShade(j))

const titleClassName =
  'font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-secondary'

export interface ActivityFieldViewProps {
  activity: Activity
  /** The reference time for dates and labels. */
  now: Date
  className?: string
}

/** The field itself, from an `Activity` (see `activityByDay`). Pure presentation. */
export function ActivityFieldView({ activity, now, className }: ActivityFieldViewProps) {
  const first = activity.days[0]?.date
  // Weekly ticks from the first day, then "Today" at the right edge.
  const ticks = first
    ? [0, 7, 14, 21].map((offset) => axisDate(addDaysIso(first, offset), now))
    : []
  return (
    <div className={cn('flex flex-col px-2.5 py-3', className)} data-testid="activity-field">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <h3 className={titleClassName}>Last {activity.days.length} days</h3>
        <span aria-hidden="true" className="font-mono text-[11px] text-muted tabular-nums">
          {activity.held} held · {activity.missed} missed
        </span>
      </div>
      <div
        role="img"
        aria-label={activitySummary(activity)}
        className="mt-2.5 grid gap-px"
        style={{ gridTemplateColumns: `repeat(${activity.days.length}, minmax(0, 1fr))` }}
      >
        {activity.days.map((day) => (
          <Column key={day.date} day={day} now={now} />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="mt-1.5 flex justify-between px-0.5 font-mono text-[9.5px] text-muted"
        data-testid="activity-axis"
      >
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
        <span>Today</span>
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5 px-0.5 text-[10.5px] text-secondary">
        <li className="inline-flex items-center gap-1.5">
          <LegendDots colours={heldLegend} />
          held
        </li>
        <li className="inline-flex items-center gap-1.5">
          <LegendDots colours={['var(--field-moved)']} />
          stage moved
        </li>
        <li className="inline-flex items-center gap-1.5">
          <LegendDots colours={missedLegend} />
          missed
        </li>
      </ul>
    </div>
  )
}

/** Placeholder with the field's footprint, so nothing jumps when the data lands. */
export function ActivityFieldSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading the last 30 days"
      className={cn('flex flex-col gap-2.5 px-3 py-3', className)}
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-[84px] w-full" />
      <Skeleton className="h-2.5 w-full" />
      <Skeleton className="h-2.5 w-2/3" />
    </div>
  )
}

/**
 * The member's last 30 days: touches held, stage moves, and missed follow-ups and meetings, by
 * IST day. The reads wait until the browser is idle after mount, like the panel's contact
 * matching, so they do not compete with the grid's first paint.
 */
export function ActivityField({ memberId, className }: { memberId: Id; className?: string }) {
  const idle = useAfterIdle()
  const now = useNow()
  const today = todayIst(now)
  const start = activityStart(now)
  const range = useMemo(
    () => ({
      from: istInstant(start).toISOString(),
      to: istInstant(addDaysIso(today, 1)).toISOString(),
    }),
    [start, today],
  )
  const rows = useMemberRows(idle ? memberId : undefined)
  const history = useMemberHistory(idle ? memberId : undefined, range)
  // Meetings marked missed (D-059) hang below the line with missed follow-ups.
  const events = useCalendarEvents(idle ? memberId : undefined, range)
  const marks = useMeetingMarks(memberId)
  const activity = useMemo(() => {
    if (!rows.data || !history.data) return null
    const missedMeetings =
      events.data && marks.data ? missedMeetingStarts(events.data, marks.data) : []
    return activityByDay(history.data, rows.data, now, { missedMeetings })
  }, [rows.data, history.data, events.data, marks.data, now])

  if (rows.isError || history.isError) {
    return (
      <p className={cn('px-3 py-3 text-xs text-muted', className)}>
        The last 30 days could not load. Reload to try again.
      </p>
    )
  }
  if (!activity) return <ActivityFieldSkeleton className={className} />
  return <ActivityFieldView activity={activity} now={now} className={className} />
}
