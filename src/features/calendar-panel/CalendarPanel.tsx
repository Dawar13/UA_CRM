import { MapPin } from 'lucide-react'
import { useId, useMemo } from 'react'
import { useJumpToRow } from '@/app/navigation'
import { AvatarInitials } from '@/components/crm/AvatarInitials'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCalendarEvents } from '@/data/hooks'
import type { RowLocation } from '@/data/repository'
import { groupEventsByDay } from '@/domain/calendar'
import { addDaysIso, formatDayHeading, formatTime, istInstant, todayIst } from '@/domain/dates'
import type { CalendarEvent, Member } from '@/domain/types'
import { useNow } from '@/lib/useNow'
import { useEventContacts } from './useEventContacts'

/** The panel shows today and the six days after it. */
export const PANEL_DAYS = 7

function ContactChip({ location }: { location: RowLocation }) {
  const jump = useJumpToRow()
  const contextId = useId()
  return (
    <button
      type="button"
      onClick={() =>
        jump({ member: location.member, sheet: location.sheet, rowId: location.row.id })
      }
      className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-pill-border bg-bg pl-0.5 pr-2 text-xs text-text transition-colors duration-[var(--duration-fast)] hover:border-border-strong hover:bg-surface-subtle"
      data-testid="event-contact"
      aria-describedby={contextId}
    >
      <AvatarInitials name={location.row.name} size="sm" />
      <span className="truncate">{location.row.name}</span>
      {/* The name is the visible text; where the row lives is the description. */}
      <span id={contextId} hidden>
        {`${location.member.name} · ${location.sheet.name}`}
      </span>
    </button>
  )
}

function EventItem({ event, contacts }: { event: CalendarEvent; contacts: RowLocation[] }) {
  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-2" data-testid="calendar-event">
      <span className="pt-px text-xs text-muted tabular-nums">{formatTime(event.start)}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-text">{event.title}</span>
        {event.location ? (
          <span className="flex items-center gap-1 text-xs text-muted">
            <MapPin aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </span>
        ) : null}
        {contacts.length > 0 ? (
          <span className="flex flex-wrap gap-1.5 pt-0.5">
            {contacts.map((c) => (
              <ContactChip key={c.row.id} location={c} />
            ))}
          </span>
        ) : null}
      </span>
    </li>
  )
}

export function CalendarPanel({ member }: { member: Member }) {
  const now = useNow()
  const today = todayIst(now)
  const range = useMemo(
    () => ({
      from: istInstant(today).toISOString(),
      to: istInstant(addDaysIso(today, PANEL_DAYS)).toISOString(),
    }),
    [today],
  )
  const { data: events, isPending } = useCalendarEvents(member.id, range)
  const { data: contacts } = useEventContacts(events)
  const days = useMemo(() => groupEventsByDay(events ?? []), [events])

  return (
    <section aria-labelledby="calendar-panel-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center px-4">
        <h2
          id="calendar-panel-title"
          tabIndex={-1}
          className="rounded-control text-sm font-semibold text-text"
        >
          This week
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="calendar-panel">
        {isPending ? (
          <div className="flex flex-col gap-3 pt-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : days.length === 0 ? (
          <EmptyState
            title="A clear week"
            description="No meetings in the next seven days."
            className="pt-10"
          />
        ) : (
          days.map((day) => (
            <section key={day.date} aria-label={formatDayHeading(day.date, now)} className="pt-3">
              <h3 className="pb-1 text-xs font-medium text-muted">
                {formatDayHeading(day.date, now)}
              </h3>
              <ol className="divide-y divide-border">
                {day.events.map((event) => (
                  <EventItem
                    key={event.id}
                    event={event}
                    contacts={contacts?.get(event.id) ?? []}
                  />
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </section>
  )
}
