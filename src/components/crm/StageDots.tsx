import { TooltipDelegate } from '@/components/ui/Tooltip'
import { exactDate, formatFuzzyDate } from '@/domain/dates'
import type { StageState } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'

/** One stage position as returned by `stageView(row, sheet)`. */
export interface StageViewItem {
  id: string
  name: string
  index: number
  state: StageState
  /** IST calendar date the stage was reached; null when skipped or not reached. */
  date: string | null
}

/**
 * Accessible summary of a stage list: "Stage 4 of 7: Plant visit", "Won: Paid",
 * "Lost after Plant visit" or "Not started".
 */
export function stageSummary(stages: readonly StageViewItem[]): string {
  const won = stages.find((s) => s.state === 'won')
  if (won) return `Won: ${won.name}`
  const lostAt = stages.findIndex((s) => s.state === 'lost-marker')
  const before = lostAt > 0 ? stages[lostAt - 1] : undefined
  if (before) return `Lost after ${before.name}`
  const current = stages.find((s) => s.state === 'current')
  if (current) return `Stage ${current.index + 1} of ${stages.length}: ${current.name}`
  return 'Not started'
}

/** "3 Nov", or "no date" for a stage reached without a date. */
export function formatStageDate(date: string | null, now: Date): string {
  return date ? formatFuzzyDate(exactDate(date), now) : 'no date'
}

const dotClassName: Record<StageState, string> = {
  done: 'bg-stage-done',
  current: 'bg-stage-done ring-[3px] ring-stage-current-ring',
  future: 'border-[1.5px] border-stage-future',
  'lost-marker': 'bg-stage-lost',
  won: 'bg-stage-won',
}

function dotTooltip(stage: StageViewItem, stages: readonly StageViewItem[], now: Date): string {
  if (stage.state === 'future') return stage.name
  if (stage.state === 'lost-marker') {
    const before = stages[stage.index - 1]
    return before ? `Lost after ${before.name}` : 'Lost'
  }
  return `${stage.name} · ${formatStageDate(stage.date, now)}`
}

/** Tooltip text, rendered only while a tooltip is open (so dots never subscribe to the clock). */
function DotTooltip({ stage, stages }: { stage: StageViewItem; stages: readonly StageViewItem[] }) {
  const now = useNow()
  return <>{dotTooltip(stage, stages, now)}</>
}

export interface StageDotsProps {
  stages: readonly StageViewItem[]
  className?: string
}

/**
 * Compact stage progress for the grid: 8px dots with a 4px gap. Done is filled, current is
 * filled with a ring, future is hollow, won is green and lost is a red dot at the next position.
 * Shape carries the state as well as colour.
 */
export function StageDots({ stages, className }: StageDotsProps) {
  if (stages.length === 0) return null
  // One delegated tooltip for the whole strip; each dot still gets its own text and anchor.
  return (
    <TooltipDelegate
      selector="[data-stage-index]"
      content={(dot) => {
        const stage = stages[Number(dot.dataset.stageIndex)]
        return stage ? <DotTooltip stage={stage} stages={stages} /> : null
      }}
    >
      <span
        role="img"
        aria-label={stageSummary(stages)}
        className={cn('inline-flex shrink-0 items-center gap-1 py-1', className)}
      >
        {stages.map((stage, i) => (
          <span
            key={stage.id}
            data-state={stage.state}
            data-stage={stage.name}
            data-stage-index={i}
            className={cn(
              'box-border block size-2 shrink-0 rounded-full',
              stage.state === 'current' && 'mx-0.5',
              dotClassName[stage.state],
            )}
          />
        ))}
      </span>
    </TooltipDelegate>
  )
}
