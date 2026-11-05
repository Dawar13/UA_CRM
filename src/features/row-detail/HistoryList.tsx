import { DateText } from '@/components/crm/DateText'
import type { HistoryEntry, Member } from '@/domain/types'
import { cn } from '@/lib/cn'
import {
  HistoryKindIcon,
  historyKindLabels,
  historyTone,
  historyToneClassName,
} from './historyIcons'

/**
 * Dated touches, newest first: a 28px tinted icon tile, the entry text, and a mono meta line
 * ("2 NOV · DAWAR").
 */
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
      {entries.map((entry) => {
        const tone = historyTone(entry)
        const label = tone === 'lost' ? 'Marked lost' : historyKindLabels[entry.kind]
        return (
          <li
            key={entry.id}
            className="flex gap-3 border-b border-tile py-[9px]"
            data-testid="history-entry"
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-[7px]',
                historyToneClassName[tone],
              )}
              title={label}
            >
              <HistoryKindIcon kind={entry.kind} lost={tone === 'lost'} />
              <span className="sr-only">{label}: </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] leading-[1.4] text-text">{entry.text}</span>
              <span className="flex items-center gap-1.5 font-mono text-[10.5px] leading-[1.4] tracking-[0.06em] text-muted uppercase">
                <DateText date={entry.fuzzyDate ?? entry.at} />
                <span aria-hidden>·</span>
                <span>{members.get(entry.memberId)?.name ?? 'Someone'}</span>
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
