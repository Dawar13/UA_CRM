import { DateText } from '@/components/crm/DateText'
import type { HistoryEntry, Member } from '@/domain/types'
import { cn } from '@/lib/cn'
import { HistoryKindIcon, historyKindLabels } from './historyIcons'

export function HistoryList({
  entries,
  members,
  className,
}: {
  entries: readonly HistoryEntry[]
  members: ReadonlyMap<string, Member>
  className?: string
}) {
  return (
    <ol className={cn('flex flex-col', className)}>
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 py-1.5" data-testid="history-entry">
          <span
            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border bg-bg text-secondary"
            title={historyKindLabels[entry.kind]}
          >
            <HistoryKindIcon kind={entry.kind} />
            <span className="sr-only">{historyKindLabels[entry.kind]}: </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm text-text">{entry.text}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <DateText date={entry.fuzzyDate ?? entry.at} />
              <span aria-hidden>·</span>
              <span>{members.get(entry.memberId)?.name ?? 'Someone'}</span>
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
