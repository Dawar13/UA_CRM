/** Google Calendar in the header's More menu: connect, sync now, open, disconnect (Phase 2). */
import { CalendarDays, CalendarPlus, CalendarX2, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { MenuGroup, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu'
import {
  useCalendarConnection,
  useConnectCalendar,
  useDisconnectCalendar,
  useSyncCalendar,
} from './useCalendar'

export function CalendarMenuItems({ onDisconnect }: { onDisconnect: () => void }) {
  const { data: connection } = useCalendarConnection()
  const connect = useConnectCalendar()
  const sync = useSyncCalendar()
  const navigate = useNavigate()
  if (!connection) return null
  const connected = connection.state !== 'not_connected'
  return (
    <>
      <MenuGroup>
        <MenuLabel className="truncate">
          {connected && connection.googleEmail
            ? `Google Calendar · ${connection.googleEmail}`
            : 'Google Calendar'}
        </MenuLabel>
        {!connected ? (
          <MenuItem
            onSelect={() => connect.mutate()}
            icon={<CalendarPlus aria-hidden className="size-4" />}
          >
            Connect Google Calendar
          </MenuItem>
        ) : (
          <>
            {connection.state === 'needs_reconnect' ? (
              <MenuItem
                onSelect={() => connect.mutate()}
                icon={<CalendarPlus aria-hidden className="size-4" />}
              >
                Reconnect Google Calendar
              </MenuItem>
            ) : (
              <MenuItem
                onSelect={() => sync.mutate('manual')}
                icon={<RefreshCw aria-hidden className="size-4" />}
              >
                Sync calendar now
              </MenuItem>
            )}
            <MenuItem
              onSelect={() => navigate('/calendar')}
              icon={<CalendarDays aria-hidden className="size-4" />}
            >
              Open the calendar
            </MenuItem>
            <MenuItem onSelect={onDisconnect} icon={<CalendarX2 aria-hidden className="size-4" />}>
              Disconnect calendar
            </MenuItem>
          </>
        )}
      </MenuGroup>
      <MenuSeparator />
    </>
  )
}

export function DisconnectCalendarDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const disconnect = useDisconnectCalendar()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Disconnect Google Calendar?"
        description="Sync stops and the CRM forgets your calendar events. Meetings already in history stay, and so do events the CRM added to Google Calendar."
      >
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate(undefined, { onSettled: () => onOpenChange(false) })}
          >
            {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
