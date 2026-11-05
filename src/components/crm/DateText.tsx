import { Tooltip } from '@/components/ui/Tooltip'
import {
  exactDate,
  formatFullDate,
  formatFuzzyDate,
  isOverdue,
  isToday,
  istDateOf,
  relative,
} from '@/domain/dates'
import type { FuzzyDate } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** An ISO date ("2026-11-04") or instant ("2026-11-04T10:00:00Z") as a day-precision date. */
export function toFuzzyDate(date: FuzzyDate | string): FuzzyDate {
  if (typeof date !== 'string') return date
  return exactDate(ISO_DATE.test(date) ? date : istDateOf(date))
}

/** Machine-readable value for <time dateTime>: "2026-11-04", or "2026-10" for fuzzy dates. */
function machineDate(date: FuzzyDate): string {
  return date.precision === 'day' ? date.date : date.date.slice(0, 7)
}

/** Tooltip text, computed only while the tooltip is open. */
function DateTooltip({ value }: { value: FuzzyDate }) {
  const now = useNow()
  return <>{`${formatFullDate(value)} · ${relative(value, now)}`}</>
}

interface DateView {
  value: FuzzyDate
  text: string
  today: boolean
  overdue: boolean
}

/**
 * Formatting in IST is the costly part of a grid date, and a sheet repeats the same few dates,
 * so results are cached for the current minute (useNow's snapshot changes once a minute).
 */
const viewCache = new Map<string, DateView>()
let viewCacheTime = Number.NaN

function dateView(date: FuzzyDate | string, due: boolean, now: Date): DateView {
  if (now.getTime() !== viewCacheTime) {
    viewCache.clear()
    viewCacheTime = now.getTime()
  }
  const key = typeof date === 'string' ? `${date}|${due}` : `${date.date}|${date.precision}|${due}`
  const cached = viewCache.get(key)
  if (cached) return cached
  const value = toFuzzyDate(date)
  const today = due && isToday(value, now)
  const overdue = due && !today && isOverdue(value, now)
  const view = { value, text: today ? 'Today' : formatFuzzyDate(value, now), today, overdue }
  if (viewCache.size > 2000) viewCache.clear()
  viewCache.set(key, view)
  return view
}

export interface DateTextProps {
  date: FuzzyDate | string | null
  /** "due" colours overdue dates red and shows "Today" for today. */
  variant?: 'plain' | 'due'
  className?: string
}

/**
 * A date as people write it: "4 Nov" (year when not current), "Mid Oct" for fuzzy dates. The
 * tooltip shows the full date and how long ago or ahead it is. Renders nothing for null.
 */
export function DateText({ date, variant = 'plain', className }: DateTextProps) {
  const now = useNow()
  if (date === null) return null
  const { value, text, today, overdue } = dateView(date, variant === 'due', now)

  return (
    <Tooltip content={<DateTooltip value={value} />}>
      <time
        dateTime={machineDate(value)}
        data-due={today ? 'today' : overdue ? 'overdue' : undefined}
        className={cn(
          'whitespace-nowrap tabular-nums',
          today && 'font-medium text-today',
          overdue && 'text-overdue',
          className,
        )}
      >
        {overdue ? <span className="sr-only">Overdue: </span> : null}
        {text}
      </time>
    </Tooltip>
  )
}
