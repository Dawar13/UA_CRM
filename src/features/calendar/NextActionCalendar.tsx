/**
 * A next action in the member's Google Calendar (Phase 2, C5): add it (an exact day, a time or
 * all day, the contact invited only when asked), see that it is there, change or remove it, and
 * add it again after it was deleted in Google. Shown on the member's own rows while connected.
 */
import { CalendarCheck2, CalendarClock, CalendarPlus, TriangleAlert } from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useActor } from '@/auth/AuthContext'
import { trackerTitleClassName } from '@/components/crm/StageTracker'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { UNDO_TOAST_DURATION, useCalendarEvents } from '@/data/hooks'
import { hasExactDay } from '@/domain/calendar/followUp'
import { addDaysIso, formatDate, formatTime, istInstant, todayIst } from '@/domain/dates'
import type { Row } from '@/domain/types'
import { eventKey } from '@/features/calendar-panel/useEventContacts'
import { useNow } from '@/lib/useNow'
import {
  useCalendarConnection,
  useEventLinks,
  useRemoveNextActionEvent,
  useSaveNextActionEvent,
} from './useCalendar'

/** "16:00" → "4:00 pm". */
export function clockLabel(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

function EventForm({
  row,
  submitLabel,
  onDone,
}: {
  row: Row
  submitLabel: string
  onDone: () => void
}) {
  const save = useSaveNextActionEvent()
  const dateId = useId()
  const timeId = useId()
  const allDayId = useId()
  const inviteId = useId()
  const own = row.nextAction?.date
  const [date, setDate] = useState(own?.precision === 'day' ? own.date : '')
  const [allDay, setAllDay] = useState(
    row.nextActionEvent ? row.nextActionEvent.time === null : true,
  )
  const [time, setTime] = useState(row.nextActionEvent?.time ?? '10:00')
  const [invite, setInvite] = useState(false)
  const email = row.email.trim()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!date) return
    // Awaited rather than a mutate callback: the form unmounts once the row shows the event.
    save
      .mutateAsync({
        rowId: row.id,
        input: {
          ...(date !== own?.date || own?.precision !== 'day' ? { date } : {}),
          time: allDay ? null : time,
          invite,
        },
      })
      .then(() => {
        toast(
          invite ? `Added to your calendar, and ${row.name} is invited` : 'Added to your calendar',
        )
        onDone()
      })
      // The hook has already said what went wrong.
      .catch(() => undefined)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="next-action-event-form">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={dateId} className="text-xs font-medium text-secondary">
            Day
          </label>
          <Input
            id={dateId}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={timeId} className="text-xs font-medium text-secondary">
            Time (IST)
          </label>
          <Input
            id={timeId}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={allDay}
            className="h-8"
          />
        </div>
      </div>
      <label htmlFor={allDayId} className="flex items-center gap-2 text-sm text-text">
        <input
          id={allDayId}
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4 accent-(--primary)"
        />
        All day
      </label>
      {email ? (
        <label htmlFor={inviteId} className="flex items-start gap-2 text-sm text-text">
          <input
            id={inviteId}
            type="checkbox"
            checked={invite}
            onChange={(e) => setInvite(e.target.checked)}
            className="mt-0.5 size-4 accent-(--primary)"
          />
          <span className="min-w-0">
            Invite {row.name}
            <span className="block truncate text-xs text-muted">Google emails {email}</span>
          </span>
        </label>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" disabled={save.isPending || !date}>
          {save.isPending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

function EventPopover({
  row,
  trigger,
  submitLabel,
}: {
  row: Row
  trigger: React.ReactNode
  submitLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" aria-label="Add to calendar">
        <EventForm row={row} submitLabel={submitLabel} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

export function NextActionCalendar({ row }: { row: Row }) {
  const { data: connection } = useCalendarConnection()
  const remove = useRemoveNextActionEvent()
  const save = useSaveNextActionEvent()
  if (connection?.state !== 'active' || !row.nextAction) return null
  const linked = row.nextActionEvent

  if (linked?.state === 'linked') {
    const when = linked.time ? clockLabel(linked.time) : 'all day'
    return (
      <div className="flex flex-wrap items-center gap-1.5" data-testid="next-action-event">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-secondary">
          <CalendarCheck2 aria-hidden className="size-4 text-warm" />
          In your calendar · {when}
        </span>
        <EventPopover
          row={row}
          submitLabel="Save"
          trigger={
            <Button size="sm" variant="ghost">
              Change
            </Button>
          }
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() =>
            remove
              .mutateAsync(row.id)
              .then(() =>
                toast('Removed from your calendar', {
                  duration: UNDO_TOAST_DURATION,
                  action: {
                    label: 'Undo',
                    onClick: () =>
                      save.mutate({ rowId: row.id, input: { time: linked.time, invite: false } }),
                  },
                }),
              )
              .catch(() => undefined)
          }
        >
          Remove
        </Button>
      </div>
    )
  }

  if (linked?.state === 'removed_in_google') {
    return (
      <div className="flex flex-wrap items-center gap-1.5" data-testid="next-action-event">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-secondary">
          <TriangleAlert aria-hidden className="size-4 text-waiting" />
          Removed in Google Calendar
        </span>
        {hasExactDay(row) ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={save.isPending}
            onClick={() =>
              save
                .mutateAsync({ rowId: row.id, input: { time: linked.time, invite: false } })
                .then(() => toast('Added to your calendar'))
                .catch(() => undefined)
            }
          >
            Add again
          </Button>
        ) : null}
      </div>
    )
  }

  if (!hasExactDay(row)) {
    return (
      <p className="text-xs text-muted" data-testid="next-action-event">
        Give it an exact day to add it to your calendar.
      </p>
    )
  }
  return (
    <div data-testid="next-action-event">
      <EventPopover
        row={row}
        submitLabel="Add to calendar"
        trigger={
          <Button size="sm" variant="ghost" className="-ml-2.5">
            <CalendarPlus aria-hidden />
            Add to calendar
          </Button>
        }
      />
    </div>
  )
}

/** The next meeting with this contact in the member's own calendar (guest email or a link). */
export function UpcomingMeeting({ row }: { row: Row }) {
  const actor = useActor()
  const now = useNow()
  const today = todayIst(now)
  const { data: connection } = useCalendarConnection()
  const range = useMemo(
    () => ({
      from: istInstant(today).toISOString(),
      to: istInstant(addDaysIso(today, 30)).toISOString(),
    }),
    [today],
  )
  const active = connection?.state === 'active'
  const { data: events } = useCalendarEvents(active ? actor?.id : undefined, range)
  const { data: links } = useEventLinks()
  const email = row.email.trim().toLowerCase()
  const next = (events ?? []).find((event) => {
    if (Date.parse(event.end) <= now.getTime() || event.uaRowId) return false
    if (email && event.attendees.some((a) => !a.self && a.email.trim().toLowerCase() === email)) {
      return true
    }
    return (links ?? []).some(
      (l) =>
        l.kind === 'confirmed' &&
        l.rowId === row.id &&
        (l.googleEventId === eventKey(event) ||
          (l.recurringEventId !== null && l.recurringEventId === event.recurringEventId)),
    )
  })
  if (!next) return null
  const day = formatDate(next.start, now, { weekday: true })
  return (
    <section className="flex flex-col gap-2" data-testid="upcoming-meeting">
      <h3 className={trackerTitleClassName}>Next meeting</h3>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-text">
        <CalendarClock aria-hidden className="size-4 text-link" />
        <span className="font-mono text-xs font-medium text-secondary tabular-nums">
          {next.allDay ? day : `${day}, ${formatTime(next.start)}`}
        </span>
        <span>{next.title || 'Meeting'}</span>
      </p>
    </section>
  )
}
