import { Check, MapPin, Maximize2, X } from 'lucide-react'
import { useId, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useJumpToRow } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCalendarEvents } from '@/data/hooks'
import type { RowLocation } from '@/data/repository'
import { groupEventsByDay } from '@/domain/calendar/events'
import {
  addDaysIso,
  formatDate,
  formatDayHeading,
  formatTime,
  istInstant,
  parseIsoDate,
  todayIst,
} from '@/domain/dates'
import type { CalendarEvent, IsoDate, Member } from '@/domain/types'
import {
  ConnectCalendarCard,
  PrivateCalendar,
  ReconnectBanner,
  SyncStatus,
} from '@/features/calendar/CalendarStatus'
import { useCalendarConnection, useLinkEvent } from '@/features/calendar/useCalendar'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { ActivityField } from './ActivityField'
import { ClearWeekArt } from './ClearWeekArt'
import { eventKey, useEventContacts } from './useEventContacts'

/** The panel shows today and the six days after it. */
export const PANEL_DAYS = 7

/** Event bars drawn under a day in the week strip, at most three; the agenda lists every event. */
const DAY_BARS = ['first', 'second', 'third'] as const

const capsClassName = 'font-mono font-semibold uppercase'

/** "5–11 Nov", "28 Nov–4 Dec", "28 Dec 2026–3 Jan 2027". */
export function weekRangeLabel(from: IsoDate, to: IsoDate, now: Date): string {
  const [fromDay, fromMonth, fromYear] = formatDate(from, now).split(' ')
  const [toDay, toMonth, toYear] = formatDate(to, now).split(' ')
  if (fromYear !== toYear)
    return `${fromDay} ${fromMonth} ${fromYear}–${toDay} ${toMonth} ${toYear}`
  if (fromMonth !== toMonth) return `${fromDay} ${fromMonth}–${toDay} ${toMonth}`
  return `${fromDay}–${toDay} ${toMonth}`
}

/** Agenda heading: "Today · Thu 5 Nov", "Tomorrow · Fri 6 Nov", "Mon 9 Nov". */
export function agendaDayLabel(date: IsoDate, now: Date): string {
  const full = formatDate(date, now, { weekday: true })
  const relative = formatDayHeading(date, now)
  return relative === full ? full : `${relative} · ${full}`
}

export interface WeekStripDay {
  date: IsoDate
  /** Events that day. */
  count: number
}

/**
 * Seven days in a row: weekday, date and one short blue bar per event. Today sits in a sky
 * square. Each day is announced as one phrase ("Today, Thu 5 Nov: 2 events").
 */
export function WeekStrip({ days, now }: { days: readonly WeekStripDay[]; now: Date }) {
  const today = todayIst(now)
  return (
    <ol
      aria-label="Next seven days"
      className="grid grid-cols-7 gap-0.5 px-1.5 pt-3 pb-2.5"
      data-testid="week-strip"
    >
      {days.map((day) => {
        const isToday = day.date === today
        const full = formatDate(day.date, now, { weekday: true })
        const events =
          day.count === 0 ? 'no events' : day.count === 1 ? '1 event' : `${day.count} events`
        return (
          <li
            key={day.date}
            aria-current={isToday ? 'date' : undefined}
            className="flex min-w-0 flex-col items-center gap-1.5"
          >
            <span className="sr-only">{`${isToday ? 'Today, ' : ''}${full}: ${events}`}</span>
            <span
              aria-hidden="true"
              className="font-mono text-[10px] tracking-[0.06em] text-muted uppercase"
            >
              {full.split(' ')[0]}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'grid size-7 place-items-center rounded-[8px] text-[13.5px] font-semibold tabular-nums',
                isToday
                  ? 'bg-[image:linear-gradient(160deg,var(--today-bg-top),var(--today-bg))] text-today-fg shadow-[0_4px_10px_-4px_color-mix(in_srgb,var(--today-bg)_55%,transparent)]'
                  : 'text-text',
              )}
            >
              {parseIsoDate(day.date).day}
            </span>
            <span aria-hidden="true" className="flex h-1 gap-0.5">
              {DAY_BARS.slice(0, day.count).map((bar) => (
                <span
                  key={bar}
                  data-testid="day-bar"
                  className="h-1 w-2 rounded-[2px] bg-brand-400"
                />
              ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ContactChip({ location }: { location: RowLocation }) {
  const jump = useJumpToRow()
  const contextId = useId()
  return (
    <button
      type="button"
      onClick={() =>
        jump({ member: location.member, sheet: location.sheet, rowId: location.row.id })
      }
      className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-control bg-bg px-2 text-xs text-text shadow-[inset_0_0_0_1px_var(--border)] transition-shadow duration-(--duration-fast) ease-out hover:shadow-[inset_0_0_0_1px_var(--border-strong)]"
      data-testid="event-contact"
      aria-describedby={contextId}
    >
      <span className="truncate">{location.row.name}</span>
      {/* The name is the visible text; where the row lives is the description. */}
      <span id={contextId} hidden>
        {`${location.member.name} · ${location.sheet.name}`}
      </span>
    </button>
  )
}

/**
 * "Rohan Mehta?": the title names one of your contacts but no guest matched. Yes links the event
 * to the row (its meeting then logs there); no keeps it from being suggested again.
 */
export function SuggestionChip({
  event,
  location,
}: {
  event: CalendarEvent
  location: RowLocation
}) {
  const link = useLinkEvent()
  const answer = (kind: 'confirmed' | 'dismissed') =>
    link.mutate({
      googleEventId: eventKey(event),
      recurringEventId: null,
      rowId: location.row.id,
      kind,
    })
  const name = location.row.name
  return (
    <span
      className="inline-flex h-7 max-w-full items-center gap-1 rounded-control border border-dashed border-border-strong/70 pr-0.5 pl-2 text-xs text-secondary"
      data-testid="event-suggestion"
    >
      <span className="truncate">{name}?</span>
      <IconButton
        aria-label={`Yes, ${name}`}
        tooltip={`Yes, ${name}`}
        size="sm"
        className="size-6"
        onClick={() => answer('confirmed')}
        disabled={link.isPending}
      >
        <Check className="size-3.5" />
      </IconButton>
      <IconButton
        aria-label={`Not ${name}`}
        tooltip={`Not ${name}`}
        size="sm"
        className="size-6"
        onClick={() => answer('dismissed')}
        disabled={link.isPending}
      >
        <X className="size-3.5" />
      </IconButton>
    </span>
  )
}

/** "11:30 am", or "All day". */
export function eventTimeLabel(event: CalendarEvent): string {
  return event.allDay ? 'All day' : formatTime(event.start)
}

function EventItem({
  event,
  contacts,
  suggestion,
}: {
  event: CalendarEvent
  contacts: RowLocation[]
  suggestion: RowLocation | undefined
}) {
  return (
    <li
      className="grid grid-cols-[62px_minmax(0,1fr)] gap-x-2 rounded-card border border-border bg-surface-raised px-3 py-2.5 shadow-card"
      data-testid="calendar-event"
    >
      <span className="pt-px font-mono text-xs whitespace-nowrap text-secondary tabular-nums">
        {eventTimeLabel(event)}
      </span>
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <span className="text-[13.5px] font-semibold tracking-[-0.005em] text-text">
          {event.title || 'Busy'}
        </span>
        {event.location ? (
          <span className="flex max-w-full items-center gap-1 text-xs text-muted">
            <MapPin aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </span>
        ) : null}
        {contacts.length > 0 || suggestion ? (
          <span className="flex max-w-full flex-wrap gap-1.5">
            {contacts.map((c) => (
              <ContactChip key={c.row.id} location={c} />
            ))}
            {suggestion ? <SuggestionChip event={event} location={suggestion} /> : null}
          </span>
        ) : null}
      </span>
    </li>
  )
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-16 w-full rounded-card" />
      <Skeleton className="h-16 w-full rounded-card" />
    </div>
  )
}

function Agenda({ memberId, now }: { memberId: string; now: Date }) {
  const today = todayIst(now)
  const range = useMemo(
    () => ({
      from: istInstant(today).toISOString(),
      to: istInstant(addDaysIso(today, PANEL_DAYS)).toISOString(),
    }),
    [today],
  )
  const { data: events, isPending } = useCalendarEvents(memberId, range)
  const { data: matches } = useEventContacts(events)
  const days = useMemo(() => groupEventsByDay(events ?? []), [events])
  const strip = useMemo(() => {
    const counts = new Map(days.map((d) => [d.date, d.events.length]))
    return Array.from({ length: PANEL_DAYS }, (_, i) => {
      const date = addDaysIso(today, i)
      return { date, count: counts.get(date) ?? 0 }
    })
  }, [days, today])

  return (
    <>
      <div className="overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-card">
        {isPending ? (
          <div className="px-3 pt-3 pb-2.5" aria-hidden="true">
            <Skeleton className="h-[58px] w-full" />
          </div>
        ) : (
          <WeekStrip days={strip} now={now} />
        )}
        <div className="border-t border-border">
          <ActivityField memberId={memberId} />
        </div>
      </div>

      {isPending ? (
        <PanelSkeleton />
      ) : days.length === 0 ? (
        <EmptyState
          art={<ClearWeekArt today={today} now={now} />}
          title="A clear week"
          description="No meetings in the next seven days."
          className="py-6"
        />
      ) : (
        days.map((day) => {
          const label = agendaDayLabel(day.date, now)
          return (
            <section key={day.date} aria-label={label} className="flex flex-col gap-2">
              <h3 className={cn(capsClassName, 'text-[10.5px] tracking-[0.08em] text-secondary')}>
                {label}
              </h3>
              <ol className="flex flex-col gap-2">
                {day.events.map((event) => (
                  <EventItem
                    key={event.id}
                    event={event}
                    contacts={matches?.contacts.get(event.id) ?? []}
                    suggestion={matches?.suggestions.get(event.id)}
                  />
                ))}
              </ol>
            </section>
          )
        })
      )}
    </>
  )
}

/** The 30-day field alone, for a tab whose calendar is not shown. */
function ActivityOnly({ memberId }: { memberId: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-card">
      <ActivityField memberId={memberId} />
    </div>
  )
}

export function CalendarPanel({ member }: { member: Member }) {
  const now = useNow()
  const navigate = useNavigate()
  const actor = useActor()
  const today = todayIst(now)
  const lastDay = addDaysIso(today, PANEL_DAYS - 1)
  const own = actor?.id === member.id
  const { data: connection } = useCalendarConnection()
  const state = own ? (connection?.state ?? 'loading') : 'private'

  return (
    <section aria-labelledby="calendar-panel-title" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="calendar-panel">
        <div className="flex flex-col gap-[18px] px-[18px] pt-[18px] pb-8">
          <header className="flex items-center justify-between gap-3">
            <h2
              id="calendar-panel-title"
              tabIndex={-1}
              className={cn(capsClassName, 'rounded-chip text-[11.5px] tracking-[0.1em] text-text')}
            >
              This week
            </h2>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[11.5px] text-muted tabular-nums">
                {weekRangeLabel(today, lastDay, now)}
              </span>
              {state === 'active' || state === 'needs_reconnect' ? (
                <IconButton
                  aria-label="Open the calendar"
                  tooltip="Open the calendar"
                  size="sm"
                  onClick={() => navigate('/calendar')}
                >
                  <Maximize2 />
                </IconButton>
              ) : null}
            </span>
          </header>

          {state === 'private' ? (
            <>
              <ActivityOnly memberId={member.id} />
              <PrivateCalendar member={member} />
            </>
          ) : state === 'loading' ? (
            <PanelSkeleton />
          ) : state === 'not_connected' ? (
            <>
              <ActivityOnly memberId={member.id} />
              <ConnectCalendarCard />
            </>
          ) : (
            <>
              {state === 'needs_reconnect' ? <ReconnectBanner /> : null}
              {connection && state === 'active' ? (
                <SyncStatus connection={connection} now={now} />
              ) : null}
              <Agenda memberId={member.id} now={now} />
            </>
          )}
        </div>
      </div>
    </section>
  )
}
