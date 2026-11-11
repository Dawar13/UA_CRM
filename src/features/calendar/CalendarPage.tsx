/**
 * The calendar, expanded (Phase 2): a member's week as Google Calendar's week view shows it,
 * seven days by the hours of the day in IST, with each event's contacts on it. Yours by default;
 * a switch opens another member's, view only (D-054, `?member=<slug>`). It reads and links;
 * changing events stays in Google Calendar. Opens from the side panel and the member switch.
 * Left and right arrows move a week.
 */
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Header } from '@/app/Header'
import { ShellSkeleton } from '@/app/MainView'
import { useJumpToRow } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useCalendarEvents, useMembers } from '@/data/hooks'
import type { RowLocation } from '@/data/repository'
import {
  coversDay,
  layoutDay,
  MINUTES_PER_DAY,
  weekDays,
  weekStartOf,
} from '@/domain/calendar/week'
import {
  addDaysIso,
  formatDate,
  formatTime,
  istInstant,
  parseIsoDate,
  todayIst,
} from '@/domain/dates'
import type { CalendarEvent, IsoDate, Member } from '@/domain/types'
import { weekRangeLabel } from '@/features/calendar-panel/CalendarPanel'
import { useEventContacts } from '@/features/calendar-panel/useEventContacts'
import { cn } from '@/lib/cn'
import { isTypingTarget } from '@/lib/platform'
import { useNow } from '@/lib/useNow'
import { ConnectCalendarCard, NotConnectedYet, ReconnectBanner, SyncStatus } from './CalendarStatus'
import { useCalendarConnection } from './useCalendar'

/** One hour is this tall. */
const HOUR_PX = 48
const PX_PER_MINUTE = HOUR_PX / 60
const HOURS = Array.from({ length: 24 }, (_, h) => h)
/** The morning is in view when the page opens. */
const SCROLL_TO_HOUR = 8

function hourLabel(hour: number): string {
  if (hour === 0) return ''
  if (hour === 12) return '12 pm'
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`
}

function isIsoDate(value: string | null): value is IsoDate {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function ContactName({ location }: { location: RowLocation }) {
  const jump = useJumpToRow()
  return (
    <button
      type="button"
      onClick={() =>
        jump({ member: location.member, sheet: location.sheet, rowId: location.row.id })
      }
      className="max-w-full truncate rounded-[3px] bg-surface-hover px-1 text-left text-[11px] leading-[14px] font-medium text-text hover:underline"
      data-testid="week-event-contact"
    >
      {location.row.name}
    </button>
  )
}

function EventBlock({
  event,
  contacts,
  style,
  compact,
}: {
  event: CalendarEvent
  contacts: RowLocation[]
  style?: React.CSSProperties
  compact?: boolean
}) {
  const time = event.allDay ? 'All day' : `${formatTime(event.start)} to ${formatTime(event.end)}`
  const title = event.title || 'Busy'
  return (
    <li
      style={style}
      className={cn(
        'flex min-w-0 flex-col gap-px overflow-hidden rounded-[6px] border border-border border-l-[3px] border-l-brand-500 bg-surface-raised px-1.5 py-[3px] shadow-card',
        style ? 'absolute' : '',
      )}
      data-testid="week-event"
    >
      <span className="sr-only">{`${time}, `}</span>
      {event.htmlLink ? (
        <a
          href={event.htmlLink}
          target="_blank"
          rel="noreferrer"
          className="group/link inline-flex min-w-0 shrink-0 items-center gap-1 text-[12px] leading-[15px] font-semibold text-text hover:underline"
        >
          <span className="truncate">{title}</span>
          <ExternalLink
            aria-hidden
            className="size-3 shrink-0 opacity-0 group-hover/link:opacity-60"
          />
          <span className="sr-only"> (opens Google Calendar)</span>
        </a>
      ) : (
        <span className="shrink-0 truncate text-[12px] leading-[15px] font-semibold text-text">
          {title}
        </span>
      )}
      {compact ? null : (
        <span
          aria-hidden
          className="shrink-0 truncate font-mono text-[10.5px] leading-[13px] text-secondary tabular-nums"
        >
          {event.allDay ? 'All day' : formatTime(event.start)}
        </span>
      )}
      {contacts.length > 0 ? (
        <span className="flex min-w-0 shrink-0 flex-wrap gap-0.5">
          {contacts.map((c) => (
            <ContactName key={c.row.id} location={c} />
          ))}
        </span>
      ) : null}
    </li>
  )
}

function WeekGrid({ start, memberId, now }: { start: IsoDate; memberId: string; now: Date }) {
  const days = useMemo(() => weekDays(start), [start])
  const range = useMemo(
    () => ({
      from: istInstant(start).toISOString(),
      to: istInstant(addDaysIso(start, 7)).toISOString(),
    }),
    [start],
  )
  const { data: events = [] } = useCalendarEvents(memberId, range)
  const { data: matches } = useEventContacts(events, memberId)
  const today = todayIst(now)
  const scroller = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const allDayRow = useRef<HTMLDivElement>(null)

  // On a phone the hours scroll sideways too (about three days show); the day names and the
  // all-day row follow, and the hour labels stay pinned on the left.
  const followScroll = () => {
    const left = scroller.current?.scrollLeft ?? 0
    if (head.current) head.current.scrollLeft = left
    if (allDayRow.current) allDayRow.current.scrollLeft = left
  }

  useEffect(() => {
    const todayHead = head.current?.querySelector<HTMLElement>('[aria-current="date"]')
    scroller.current?.scrollTo({
      top: SCROLL_TO_HOUR * HOUR_PX - 12,
      // Start at today (nothing moves when the whole week fits).
      left: todayHead
        ? Math.max(0, todayHead.offsetLeft - (todayHead.parentElement?.offsetLeft ?? 0) - 56)
        : 0,
    })
  }, [])

  const nowMinute = (now.getTime() - istInstant(today).getTime()) / 60_000
  const allDay = days.map((day) => events.filter((e) => e.allDay && coversDay(e, day)))
  const hasAllDay = allDay.some((list) => list.length > 0)
  // On a phone each day keeps a readable width and the week scrolls sideways.
  const columns = 'grid-cols-[56px_repeat(7,minmax(0,1fr))] max-md:min-w-[728px]'
  const pinned = 'max-md:sticky max-md:left-0 max-md:z-20'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-border bg-bg">
      <div ref={head} className="shrink-0 overflow-hidden border-b border-border bg-grid-header">
        <div className={cn('grid', columns)}>
          <span className={cn(pinned, 'bg-grid-header')} />
          {days.map((day) => {
            const isToday = day === today
            const [weekday] = formatDate(day, now, { weekday: true }).split(' ')
            return (
              <div
                key={day}
                aria-current={isToday ? 'date' : undefined}
                className="flex items-center justify-center gap-1.5 border-l border-grid-line py-2"
              >
                <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">
                  {weekday}
                </span>
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-[7px] text-[13px] font-semibold tabular-nums',
                    isToday
                      ? 'bg-[image:linear-gradient(160deg,var(--today-bg-top),var(--today-bg))] text-today-fg'
                      : 'text-text',
                  )}
                >
                  {parseIsoDate(day).day}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {hasAllDay ? (
        <div ref={allDayRow} className="shrink-0 overflow-hidden border-b border-border">
          <div className={cn('grid', columns)}>
            <span
              className={cn(
                pinned,
                'self-center pr-2 text-right font-mono text-[10px] text-muted uppercase',
                'max-md:flex max-md:items-center max-md:justify-end max-md:self-stretch max-md:bg-bg',
              )}
            >
              All day
            </span>
            {days.map((day, i) => (
              <ul
                key={day}
                aria-label={`${formatDate(day, now, { weekday: true })}, all day`}
                className="flex min-w-0 flex-col gap-0.5 border-l border-grid-line p-0.5"
              >
                {(allDay[i] ?? []).map((event) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    contacts={matches?.contacts.get(event.id) ?? []}
                    compact
                  />
                ))}
              </ul>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scroller}
        onScroll={followScroll}
        className="min-h-0 flex-1 overflow-y-auto max-md:overflow-x-auto"
        data-testid="week-scroller"
      >
        <div className={cn('relative grid', columns)} style={{ height: 24 * HOUR_PX }}>
          <div aria-hidden className={cn('relative', pinned, 'max-md:bg-bg')}>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-muted tabular-nums"
                style={{ top: hour * HOUR_PX }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const placed = layoutDay(events, day)
            return (
              <ul
                key={day}
                aria-label={formatDate(day, now, { weekday: true })}
                className={cn(
                  'relative border-l border-grid-line',
                  day === today && 'bg-surface-subtle',
                )}
                data-testid="week-day"
              >
                {HOURS.slice(1).map((hour) => (
                  <span
                    key={hour}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-grid-line"
                    style={{ top: hour * HOUR_PX }}
                  />
                ))}
                {placed.map((p) => {
                  const contacts = matches?.contacts.get(p.event.id) ?? []
                  const minutes = p.endMinute - p.startMinute
                  return (
                    <EventBlock
                      key={p.event.id}
                      event={p.event}
                      contacts={contacts}
                      // The time line goes first when the block is short (it is read out anyway).
                      compact={minutes < 60 || (contacts.length > 0 && minutes < 90)}
                      style={{
                        top: p.startMinute * PX_PER_MINUTE,
                        height: (p.endMinute - p.startMinute) * PX_PER_MINUTE - 2,
                        left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / p.lanes}% - 4px)`,
                      }}
                    />
                  )
                })}
                {day === today && nowMinute >= 0 && nowMinute < MINUTES_PER_DAY ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-(--today-bg)"
                    style={{ top: nowMinute * PX_PER_MINUTE }}
                    data-testid="week-now"
                  />
                ) : null}
              </ul>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Whose calendar the page shows: a segmented switch, yours first. */
function OwnerSwitch({
  members,
  actorId,
  value,
  onChange,
}: {
  members: readonly Member[]
  actorId: string
  value: string
  onChange: (slug: string) => void
}) {
  const ordered = [
    ...members.filter((m) => m.id === actorId),
    ...members.filter((m) => m.id !== actorId),
  ]
  return (
    <Tabs.Root value={value} onValueChange={onChange} activationMode="automatic">
      <Tabs.List
        aria-label="Whose calendar"
        className="flex items-center gap-0.5 rounded-[8px] bg-surface-hover p-[3px]"
      >
        {ordered.map((m) => (
          <Tabs.Trigger
            key={m.id}
            value={m.slug}
            aria-controls={undefined}
            data-testid={`calendar-owner-${m.slug}`}
            className={cn(
              'flex h-7 shrink-0 cursor-default select-none items-center rounded-control px-3',
              'text-sm font-medium whitespace-nowrap text-secondary',
              'transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-out',
              'hover:bg-bg/60 hover:text-text',
              'data-[state=active]:bg-bg data-[state=active]:font-semibold data-[state=active]:text-text',
              'data-[state=active]:shadow-[0_1px_2px_var(--shadow),0_0_0_1px_var(--border)]',
            )}
          >
            {m.id === actorId ? `${m.name} (you)` : m.name}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  )
}

export function CalendarPage() {
  const actor = useActor()
  const now = useNow()
  const { data: members, isPending } = useMembers()
  const member = members?.find((m) => m.id === actor?.id)
  const [params, setParams] = useSearchParams()
  // Yours, or another member's week, view only (D-054).
  const owner = members?.find((m) => m.slug === params.get('member')) ?? member
  const own = owner !== undefined && owner.id === member?.id
  const { data: connection } = useCalendarConnection(owner?.id)
  const thisWeek = weekStartOf(todayIst(now))
  const asked = params.get('week')
  const start = isIsoDate(asked) ? weekStartOf(asked) : thisWeek

  useEffect(() => {
    if (connection) document.documentElement.dataset.appReady = 'true'
  }, [connection])

  const show = (week: IsoDate, slug: string | undefined) => {
    const next: Record<string, string> = {}
    if (slug && slug !== member?.slug) next.member = slug
    if (week !== thisWeek) next.week = week
    setParams(next, { replace: true })
  }
  const go = (week: IsoDate) => show(week, owner?.slug)
  const goRef = useRef(go)
  goRef.current = go
  const startRef = useRef(start)
  startRef.current = start

  // Left and right move a week, wherever focus is, except where arrows already mean something.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (isTypingTarget(event.target)) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[role="tablist"], [role="menu"], [role="dialog"], [role="grid"]')) return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      goRef.current(addDaysIso(startRef.current, event.key === 'ArrowLeft' ? -7 : 7))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (isPending || !members || !member || !owner) return <ShellSkeleton />

  const connected = connection?.state === 'active' || connection?.state === 'needs_reconnect'

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <Header members={members} member={member} view="calendar" />
      <main
        className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-[18px] pb-5"
        data-testid="calendar-page"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-text">
            {`${owner.name}’s calendar`}
          </h1>
          {members.length > 1 ? (
            <OwnerSwitch
              members={members}
              actorId={member.id}
              value={owner.slug}
              onChange={(slug) => show(start, slug)}
            />
          ) : null}
          <p className="font-mono text-xs font-medium tracking-[0.06em] text-muted uppercase tabular-nums">
            {weekRangeLabel(start, addDaysIso(start, 6), now)}
          </p>
          {connected ? (
            <div className="flex items-center gap-1">
              <IconButton
                aria-label="Previous week"
                tooltip="Previous week"
                shortcut={['ArrowLeft']}
                onClick={() => go(addDaysIso(start, -7))}
              >
                <ChevronLeft />
              </IconButton>
              <Button size="sm" onClick={() => go(thisWeek)} disabled={start === thisWeek}>
                This week
              </Button>
              <IconButton
                aria-label="Next week"
                tooltip="Next week"
                shortcut={['ArrowRight']}
                onClick={() => go(addDaysIso(start, 7))}
              >
                <ChevronRight />
              </IconButton>
            </div>
          ) : null}
          <span className="flex-1" />
          {connection && (connection.state === 'active' || (!own && connected)) ? (
            <SyncStatus
              connection={connection}
              now={now}
              owner={own ? undefined : owner}
              className="justify-end gap-3"
            />
          ) : null}
        </div>
        {own && connection?.state === 'needs_reconnect' ? <ReconnectBanner /> : null}
        {!connection ? null : connected ? (
          <WeekGrid key={owner.id} start={start} memberId={owner.id} now={now} />
        ) : (
          <div className="grid flex-1 place-items-center">
            {own ? <ConnectCalendarCard /> : <NotConnectedYet member={owner} />}
          </div>
        )}
      </main>
    </div>
  )
}
