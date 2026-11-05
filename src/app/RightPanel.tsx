import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { useHistory, useMembers, useRow } from '@/data/hooks'
import type { Member } from '@/domain/types'
import { CalendarPanel } from '@/features/calendar-panel/CalendarPanel'
import { HistoryList } from '@/features/row-detail/HistoryList'
import { useUiStore } from './uiStore'

function HistoryPanel({ rowId }: { rowId: string }) {
  const showCalendar = useUiStore((s) => s.showCalendar)
  const { data: row } = useRow(rowId)
  const { data: history, isPending } = useHistory(rowId)
  const { data: members = [] } = useMembers()
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  return (
    <section aria-labelledby="history-panel-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 px-2">
        <IconButton
          aria-label="Back to this week"
          tooltip="Back to this week"
          onClick={() => {
            showCalendar()
            // The back button unmounts with this view; keep keyboard users in the panel.
            requestAnimationFrame(() => document.getElementById('calendar-panel-title')?.focus())
          }}
        >
          <ArrowLeft className="size-4" />
        </IconButton>
        <h2 id="history-panel-title" className="min-w-0 truncate text-sm font-semibold text-text">
          History{row ? ` · ${row.name}` : ''}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="history-panel">
        {isPending ? (
          <div className="flex flex-col gap-3 pt-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <HistoryList entries={history ?? []} members={memberMap} className="pt-1" />
        )}
      </div>
    </section>
  )
}

export function RightPanel({ member }: { member: Member }) {
  const view = useUiStore((s) => s.panelView)
  return (
    <aside
      aria-label="Side panel"
      className="flex w-[var(--panel-width)] shrink-0 flex-col border-l border-border bg-bg"
      data-testid="right-panel"
    >
      {view.kind === 'history' ? (
        <HistoryPanel rowId={view.rowId} />
      ) : (
        <CalendarPanel member={member} />
      )}
    </aside>
  )
}
