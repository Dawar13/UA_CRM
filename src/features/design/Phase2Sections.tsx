/**
 * Phase 2 surfaces on /design: Google Calendar's states in the side panel, a suggested contact,
 * and a next action in the calendar. Sample data comes from the seed (its calendars start
 * connected), so the specimens match what the app shows.
 */
import { useMemo } from 'react'
import { buildSeed, seedIds } from '@/data/local/seed'
import type { CalendarConnection, RowLocation } from '@/data/repository'
import type { CalendarEvent, Member, Row, Sheet } from '@/domain/types'
import {
  ConnectCalendarCard,
  PrivateCalendar,
  ReconnectBanner,
  SyncStatus,
} from '@/features/calendar/CalendarStatus'
import { NextActionCalendar } from '@/features/calendar/NextActionCalendar'
import { SuggestionChip } from '@/features/calendar-panel/CalendarPanel'
import { Section, Specimen } from './layout'

const NOW = new Date('2026-11-05T10:00:00+05:30')

const synced: CalendarConnection = {
  state: 'active',
  googleEmail: 'dawar@example.com',
  connectedAt: '2026-11-05T03:30:00.000Z',
  lastSyncedAt: '2026-11-05T04:40:00.000Z',
  lastErrorCode: null,
}

export function CalendarSection() {
  const sample = useMemo(() => {
    const seed = buildSeed()
    const rohan = seed.rows.find((r) => r.id === seedIds.rows.rohanMehta) as Row
    const location: RowLocation = {
      row: rohan,
      sheet: seed.sheets.find((s) => s.id === rohan.sheetId) as Sheet,
      member: seed.members.find((m) => m.id === rohan.memberId) as Member,
    }
    const event: CalendarEvent = {
      id: 'design-quote',
      memberId: rohan.memberId,
      title: 'Quote review with Rohan Mehta',
      start: '2026-11-07T05:30:00.000Z',
      end: '2026-11-07T06:00:00.000Z',
      attendees: [],
      source: 'sample',
    }
    const dhruv = seed.members.find((m) => m.id === seedIds.members.dhruv) as Member
    const linked = (state: 'linked' | 'removed_in_google', time: string | null): Row => ({
      ...rohan,
      nextActionEvent: { id: 'design-event', time, state },
    })
    return { rohan, location, event, dhruv, linked }
  }, [])

  return (
    <Section
      id="calendar"
      title="Calendar"
      caption="Google Calendar in the side panel and the row (Phase 2): connect, synced, a failed sync, access ended, another member's calendar, a contact the title suggests, and a next action in the calendar."
    >
      <div className="grid grid-cols-2 gap-6">
        <Specimen title="Not connected">
          <ConnectCalendarCard />
        </Specimen>
        <Specimen title="Another member's calendar">
          <PrivateCalendar member={sample.dhruv} />
        </Specimen>
        <Specimen title="Synced, and a failed sync">
          <div className="flex flex-col gap-3">
            <SyncStatus connection={synced} now={NOW} />
            <SyncStatus connection={{ ...synced, lastErrorCode: 'network' }} now={NOW} />
          </div>
        </Specimen>
        <Specimen title="Google access ended">
          <ReconnectBanner />
        </Specimen>
        <Specimen title="A contact the title suggests">
          <SuggestionChip event={sample.event} location={sample.location} />
        </Specimen>
        <Specimen title="Next action in the calendar">
          <div className="flex flex-col gap-3">
            <NextActionCalendar row={sample.rohan} />
            <NextActionCalendar row={sample.linked('linked', '16:00')} />
            <NextActionCalendar row={sample.linked('removed_in_google', null)} />
          </div>
        </Specimen>
      </div>
    </Section>
  )
}
