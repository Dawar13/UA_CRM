/**
 * Did these happen? (D-059) On Today: your meetings with a contact that ended in the last week and
 * have no answer yet, each with Held and Missed. Google Calendar cannot say whether anyone
 * joined, so an unanswered meeting counts as held, and leaves the list after a week.
 */
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useJumpToRow } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { useCan } from '@/auth/useCan'
import { Button } from '@/components/ui/Button'
import { useCalendarEvents } from '@/data/hooks'
import {
  CONFIRM_DAYS,
  calendarEventKey,
  type MeetingOutcome,
  meetingsToConfirm,
} from '@/domain/calendar/meetings'
import { addDaysIso, formatDate, formatTime, istInstant, todayIst } from '@/domain/dates'
import { formatNumber } from '@/domain/format'
import type { CalendarEvent } from '@/domain/types'
import { useEventContacts } from '@/features/calendar-panel/useEventContacts'
import { useNow } from '@/lib/useNow'
import { useCalendarConnection, useMarkMeetings, useMeetingMarks } from './useCalendar'

export function MeetingsToConfirm() {
  const actor = useActor()
  const now = useNow()
  const today = todayIst(now)
  const jump = useJumpToRow()
  const [folded, setFolded] = useState(false)
  const { data: connection } = useCalendarConnection()
  const range = useMemo(
    () => ({
      from: istInstant(addDaysIso(today, -CONFIRM_DAYS)).toISOString(),
      to: istInstant(addDaysIso(today, 1)).toISOString(),
    }),
    [today],
  )
  const active = connection?.state === 'active' || connection?.state === 'needs_reconnect'
  const { data: events } = useCalendarEvents(active ? actor?.id : undefined, range)
  const { data: matches } = useEventContacts(events)
  const { data: marks } = useMeetingMarks()
  const canMark = useCan('markMeeting', { memberId: actor?.id ?? '' })
  const mark = useMarkMeetings()
  const pending = useMemo(
    () =>
      events && matches && marks
        ? meetingsToConfirm(events, new Set(matches.contacts.keys()), marks, now)
        : [],
    [events, matches, marks, now],
  )
  if (!canMark || pending.length === 0) return null

  const answer = (list: readonly CalendarEvent[], outcome: MeetingOutcome) => {
    const one = list.length === 1 ? list[0]?.title || 'the meeting' : null
    mark.mutate({
      changes: list.map((e) => ({ eventKey: calendarEventKey(e), outcome })),
      label: one
        ? `Mark ${one} ${outcome}`
        : `Mark ${formatNumber(list.length)} meetings ${outcome}`,
      done: one
        ? `Marked ${outcome}: ${one}`
        : `Marked ${formatNumber(list.length)} meetings ${outcome}`,
    })
  }

  return (
    <section
      aria-labelledby="today-confirm"
      className="overflow-hidden rounded-card border border-border bg-bg"
      data-testid="today-confirm"
    >
      <div className="flex items-center gap-2 bg-grid-header pr-2">
        <h2 id="today-confirm" className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!folded}
            onClick={() => setFolded((f) => !f)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left"
          >
            {folded ? (
              <ChevronRight aria-hidden className="size-3.5" />
            ) : (
              <ChevronDown aria-hidden className="size-3.5" />
            )}
            <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-secondary uppercase">
              Did these happen?
            </span>
            <span className="font-mono text-[11px] text-muted tabular-nums">
              {formatNumber(pending.length)}
            </span>
          </button>
        </h2>
        {pending.length > 1 && !folded ? (
          <Button size="sm" variant="ghost" onClick={() => answer(pending, 'held')}>
            All held
          </Button>
        ) : null}
      </div>
      {folded ? null : (
        <ul>
          {pending.map((event) => {
            const contacts = matches?.contacts.get(event.id) ?? []
            const title = event.title || 'Busy'
            return (
              <li
                key={event.id}
                className="grid grid-cols-[168px_minmax(0,1fr)_auto] items-center gap-4 border-b border-grid-line px-4 py-2.5 last:border-b-0 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-3"
                data-testid="today-confirm-meeting"
              >
                <span className="font-mono text-xs font-medium whitespace-nowrap text-secondary tabular-nums">
                  {formatDate(event.start, now, { weekday: true })} · {formatTime(event.start)}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 max-md:col-span-2 max-md:row-start-2">
                  <span className="truncate text-[13.5px] text-text">{title}</span>
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
                <span className="flex items-center gap-1.5 max-md:col-start-2 max-md:row-start-1">
                  <Button
                    size="sm"
                    aria-label={`Held: ${title}`}
                    onClick={() => answer([event], 'held')}
                  >
                    Held
                  </Button>
                  <Button
                    size="sm"
                    aria-label={`Missed: ${title}`}
                    onClick={() => answer([event], 'missed')}
                  >
                    Missed
                  </Button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
