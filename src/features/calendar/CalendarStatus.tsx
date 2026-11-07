/**
 * The calendar's states on screen (Phase 2): connect, reconnect, when it last synced, and the
 * note in another member's tab that their calendar is private.
 */
import { CalendarPlus, Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import type { CalendarConnection } from '@/data/repository'
import { formatDate, formatTime, todayIst } from '@/domain/dates'
import type { Member } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useConnectCalendar, useSyncCalendar } from './useCalendar'

/** "4:10 pm" today, "Thu 5 Nov, 4:10 pm" before. */
export function syncedLabel(at: string, now: Date): string {
  const time = formatTime(at)
  return todayIst(new Date(at)) === todayIst(now)
    ? time
    : `${formatDate(at, now, { weekday: true })}, ${time}`
}

export function ConnectCalendarCard({ className }: { className?: string }) {
  const connect = useConnectCalendar()
  return (
    <div className={cn('flex flex-col items-center', className)} data-testid="calendar-connect">
      <EmptyState
        title="Connect Google Calendar"
        description="See your week here. Meetings with your contacts then log themselves in their history."
        action={
          <Button variant="primary" onClick={() => connect.mutate()} disabled={connect.isPending}>
            <CalendarPlus aria-hidden />
            {connect.isPending ? 'Opening Google…' : 'Connect Google Calendar'}
          </Button>
        }
        className="py-6"
      />
      <p className="max-w-xs px-6 text-center text-xs text-muted">
        Google says once that it has not verified this app. Choose Advanced, then continue to UA
        Internal CRM.
      </p>
    </div>
  )
}

export function ReconnectBanner() {
  const connect = useConnectCalendar()
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-card border border-waiting-border bg-waiting-bg px-3 py-2.5"
      data-testid="calendar-reconnect"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-waiting" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p className="text-[13px] text-text">
          Google access ended. Reconnect to keep your calendar in step.
        </p>
        <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
          Reconnect
        </Button>
      </div>
    </div>
  )
}

/** "Synced 4:10 pm" with Sync now; after a failed sync, says what is shown. */
export function SyncStatus({
  connection,
  now,
  className,
}: {
  connection: CalendarConnection
  now: Date
  className?: string
}) {
  const sync = useSyncCalendar()
  const at = connection.lastSyncedAt
  const failed = connection.lastErrorCode !== null
  const label = sync.isPending
    ? 'Syncing…'
    : failed
      ? at
        ? `Last sync failed · showing ${syncedLabel(at, now)}`
        : 'Last sync failed'
      : at
        ? `Synced ${syncedLabel(at, now)}`
        : 'Not synced yet'
  return (
    <div
      className={cn('flex items-center justify-between gap-2', className)}
      data-testid="calendar-sync-status"
    >
      <span
        className={cn('font-mono text-[11px] tabular-nums', failed ? 'text-waiting' : 'text-muted')}
        aria-live="polite"
      >
        {label}
      </span>
      <IconButton
        aria-label="Sync now"
        tooltip="Sync now"
        size="sm"
        variant="ghost"
        onClick={() => sync.mutate('manual')}
        disabled={sync.isPending}
      >
        <RefreshCw className={cn(sync.isPending && 'motion-safe:animate-spin')} />
      </IconButton>
    </div>
  )
}

export function PrivateCalendar({ member }: { member: Member }) {
  return (
    <EmptyState
      art={
        <span className="grid size-10 place-items-center rounded-card bg-surface-hover text-muted">
          <Lock aria-hidden className="size-4" />
        </span>
      }
      title={`${member.name}’s calendar is private`}
      description={`Only ${member.name} sees their meetings.`}
      className="py-6"
    />
  )
}
