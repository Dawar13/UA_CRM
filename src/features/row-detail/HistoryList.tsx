import { PenLine, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { DateText } from '@/components/crm/DateText'
import { IconButton } from '@/components/ui/IconButton'
import type { HistoryEntry, Member } from '@/domain/types'
import { cn } from '@/lib/cn'
import {
  HistoryKindIcon,
  historyKindLabels,
  historyTone,
  historyToneClassName,
} from './historyIcons'

/** Entries the app writes itself: never edited by hand. */
const AUTOMATIC = new Set<HistoryEntry['kind']>(['stage', 'warmth', 'created'])

/**
 * Dated touches, newest first: a 28px tinted icon tile, the entry text, and a mono meta line
 * ("2 NOV · DAWAR").
 */
export function HistoryList({
  entries,
  members,
  className,
  onEdit,
  onDelete,
  editingId,
  renderEditor,
}: {
  entries: readonly HistoryEntry[]
  members: ReadonlyMap<string, Member>
  className?: string
  /** Your own hand-logged entries can be edited and deleted. */
  onEdit?: (entry: HistoryEntry) => void
  onDelete?: (entry: HistoryEntry) => void
  /** The entry being edited, shown by `renderEditor` in its place. */
  editingId?: string | null
  renderEditor?: (entry: HistoryEntry) => ReactNode
}) {
  return (
    <ol className={cn('flex flex-col', className)}>
      {entries.map((entry) => {
        const tone = historyTone(entry)
        const label = tone === 'lost' ? 'Marked lost' : historyKindLabels[entry.kind]
        const manual = entry.source !== 'system' && !AUTOMATIC.has(entry.kind)
        if (editingId === entry.id && renderEditor) {
          return (
            <li key={entry.id} className="border-b border-tile py-[9px]">
              {renderEditor(entry)}
            </li>
          )
        }
        return (
          <li
            key={entry.id}
            className="group/entry flex gap-3 border-b border-tile py-[9px]"
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
            {manual && (onEdit || onDelete) ? (
              <span className="flex shrink-0 items-start gap-0.5 opacity-0 group-focus-within/entry:opacity-100 group-hover/entry:opacity-100">
                {onEdit ? (
                  <IconButton
                    aria-label="Edit this touch"
                    tooltip="Edit"
                    onClick={() => onEdit(entry)}
                  >
                    <PenLine className="size-3.5" />
                  </IconButton>
                ) : null}
                {onDelete ? (
                  <IconButton
                    aria-label="Delete this touch"
                    tooltip="Delete"
                    onClick={() => onDelete(entry)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                ) : null}
              </span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
