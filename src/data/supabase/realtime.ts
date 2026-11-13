/**
 * Other members' changes appear live. Database changes arrive through Realtime (row-level security
 * decides who hears about what) and refresh the open queries in one batch, without moving focus
 * or scroll. A move to Trash is invisible to others by design, so the member who made it also
 * sends a bare "changed" broadcast (no data) to prompt everyone's refresh.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueryClient } from '@tanstack/react-query'

const TABLES = [
  'members',
  'sheets',
  'columns',
  'stages',
  'rows',
  'tags',
  'row_tags',
  'history',
  'row_links',
  'files',
  // Phase 2: the member's own calendar (policies send each member only theirs).
  'calendar_connections',
  'calendar_events',
  'calendar_event_links',
  'calendar_meeting_outcomes',
] as const

/** Changes within this window are refreshed together. */
const BATCH_MS = 300

export interface LiveChanges {
  /** Tells every other open app to refresh. */
  notify(): void
  stop(): void
}

export function subscribeToChanges(client: SupabaseClient, queryClient: QueryClient): LiveChanges {
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    // Wait for our own edits to settle, so a refresh never overwrites an optimistic change.
    if (queryClient.isMutating() > 0) {
      schedule()
      return
    }
    void queryClient.invalidateQueries()
  }
  const schedule = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(flush, BATCH_MS)
  }

  const channel = client.channel('ua-crm-changes')
  for (const table of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
  }
  channel.on('broadcast', { event: 'changed' }, schedule)
  channel.subscribe()

  return {
    notify: () => {
      void channel.send({ type: 'broadcast', event: 'changed', payload: {} })
    },
    stop: () => {
      if (timer !== null) clearTimeout(timer)
      void client.removeChannel(channel)
    },
  }
}
