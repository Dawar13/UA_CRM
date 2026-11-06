/**
 * What to do about a possible duplicate (CLAUDE.md §2.7). The choices depend on whose tab the
 * match is in:
 *
 * - your tab: Merge (fills empty fields only), Keep both, linked, Different person;
 * - another member's tab: Open their row, Keep both, linked, Different person. Never Merge.
 */
import { ExternalLink } from 'lucide-react'
import { useJumpToRow } from '@/app/navigation'
import type { DuplicateCandidate } from '@/data/repository'
import { matchReasonText } from '@/domain/dedupe/score'
import { cn } from '@/lib/cn'

export type DuplicateChoice = 'merge' | 'link' | 'different'

const choiceLabel: Record<DuplicateChoice, string> = {
  merge: 'Merge',
  link: 'Keep both, linked',
  different: 'Different person',
}

export function DuplicateChoices({
  candidate,
  actorId,
  choice,
  onChoose,
}: {
  candidate: DuplicateCandidate
  actorId: string
  choice: DuplicateChoice | undefined
  onChoose: (choice: DuplicateChoice) => void
}) {
  const jump = useJumpToRow()
  const { row, sheet, member } = candidate.location
  const mine = member.id === actorId
  const choices: DuplicateChoice[] = mine ? ['merge', 'link', 'different'] : ['link', 'different']
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-control border px-3 py-2',
        candidate.level === 'hard'
          ? 'border-cold-border bg-cold-bg'
          : 'border-waiting-border bg-waiting-bg',
      )}
      data-testid="duplicate"
      data-level={candidate.level}
    >
      <p className={cn('text-sm', candidate.level === 'hard' ? 'text-cold' : 'text-waiting')}>
        <strong className="font-semibold">{matchReasonText[candidate.reason]}</strong> as{' '}
        <span className="font-medium">{row.name}</span>
        {row.company ? `, ${row.company}` : ''} · {mine ? 'your' : `${member.name}'s`} {sheet.name}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={choice === c}
            onClick={() => onChoose(c)}
            className={cn(
              'h-7 rounded-control border px-2.5 text-sm font-medium',
              choice === c
                ? 'border-focus bg-surface-raised text-text shadow-[0_0_0_1px_var(--focus)]'
                : 'border-border bg-surface-raised text-secondary hover:text-text',
            )}
          >
            {choiceLabel[c]}
          </button>
        ))}
        {mine ? null : (
          <button
            type="button"
            onClick={() => jump({ member, sheet, rowId: row.id })}
            className="inline-flex h-7 items-center gap-1 rounded-control px-2 text-sm font-medium text-link hover:underline"
          >
            Open their row
            <ExternalLink aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
