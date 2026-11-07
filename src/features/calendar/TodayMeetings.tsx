/** Today's meetings on the Today view (CLAUDE.md §2.9, Phase 2): the member's own calendar. */
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useJumpToRow } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { useCalendarEvents } from '@/data/hooks'
import { addDaysIso, istInstant, todayIst } from '@/domain/dates'
import { formatNumber } from '@/domain/format'
import { eventTimeLabel } from '@/features/calendar-panel/CalendarPanel'
import { useEventContacts } from '@/features/calendar-panel/useEventContacts'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { useCalendarConnection } from './useCalendar'

export function TodayMeetings() {
  const actor = useActor()
  const now = useNow()
  const today = todayIst(now)
  const jump = useJumpToRow()
  const [folded, setFolded] = useState(false)
  const { data: connection } = useCalendarConnection()
  const range = useMemo(
    () => ({
      from: istInstant(today).toISOString(),
      to: istInstant(addDaysIso(today, 1)).toISOString(),
    }),
    [today],
  )
  const active = connection?.state === 'active' || connection?.state === 'needs_reconnect'
  const { data: events = [] } = useCalendarEvents(active ? actor?.id : undefined, range)
  const meetings = events.filter((e) => !e.uaRowId)
  const { data: matches } = useEventContacts(meetings)
  if (meetings.length === 0) return null

  return (
    <section
      aria-labelledby="today-meetings"
      className="overflow-hidden rounded-card border border-border bg-bg"
      data-testid="today-meetings"
    >
      <h2 id="today-meetings">
        <button
          type="button"
          aria-expanded={!folded}
          onClick={() => setFolded((f) => !f)}
          className="flex w-full items-center gap-2 bg-grid-header px-4 py-2 text-left"
        >
          {folded ? (
            <ChevronRight aria-hidden className="size-3.5" />
          ) : (
            <ChevronDown aria-hidden className="size-3.5" />
          )}
          <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-secondary uppercase">
            Today’s meetings
          </span>
          <span className="font-mono text-[11px] text-muted tabular-nums">
            {formatNumber(meetings.length)}
          </span>
        </button>
      </h2>
      {folded ? null : (
        <ul>
          {meetings.map((event) => {
            const done = Date.parse(event.end) <= now.getTime()
            const contacts = matches?.contacts.get(event.id) ?? []
            return (
              <li
                key={event.id}
                className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-4 border-b border-grid-line px-4 py-2.5 last:border-b-0"
                data-testid="today-meeting"
              >
                <span
                  className={cn(
                    'font-mono text-xs font-medium tabular-nums',
                    done ? 'text-muted' : 'text-secondary',
                  )}
                >
                  {eventTimeLabel(event)}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={cn('truncate text-[13.5px]', done ? 'text-secondary' : 'text-text')}
                  >
                    {event.title || 'Busy'}
                  </span>
                  {contacts.map((c) => (
                    <button
                      key={c.row.id}
                      type="button"
                      onClick={() => jump({ member: c.member, sheet: c.sheet, rowId: c.row.id })}
                      className="inline-flex h-6 items-center rounded-control bg-bg px-2 text-xs text-text shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--border-strong)]"
                    >
                      {c.row.name}
                    </button>
                  ))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
