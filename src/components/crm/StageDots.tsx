import { TooltipDelegate } from '@/components/ui/Tooltip'
import { exactDate, formatFuzzyDate } from '@/domain/dates'
import { stageRampStep } from '@/domain/stages'
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
 * How a stage position is drawn, in the grid bar and the expanded row's tracker:
 * - done and current: the open-stage ramp (`--stage1` light … `--stage6` deep);
 * - skipped: a done stage with no date, striped;
 * - won: the last stage of a won row, green;
 * - lost-done: a stage the row reached before it was lost, grey;
 * - lost: the position after the stage it was lost at, brick;
 * - future: not reached, the plain track.
 */
export type StageBlockKind =
  | 'done'
  | 'current'
  | 'skipped'
  | 'won'
  | 'lost-done'
  | 'lost'
  | 'future'

function hasLostMarker(stages: readonly StageViewItem[]): boolean {
  return stages.some((s) => s.state === 'lost-marker')
}

/** The stage a lost row stopped at: its current stage, or the one before the lost marker. */
function stoppedAt(stages: readonly StageViewItem[]): StageViewItem | undefined {
  const current = stages.find((s) => s.state === 'current')
  if (current) return current
  const marker = stages.findIndex((s) => s.state === 'lost-marker')
  return marker > 0 ? stages[marker - 1] : undefined
}

/**
 * Accessible summary of a stage list: "Stage 4 of 7: Plant visit", "Won: Paid",
 * "Lost after Plant visit" or "Not started". `lost` defaults to whether a lost marker is shown;
 * pass it for a row lost at the final stage, which has no marker position.
 */
export function stageSummary(
  stages: readonly StageViewItem[],
  lost: boolean = hasLostMarker(stages),
): string {
  const won = stages.find((s) => s.state === 'won')
  if (won) return `Won: ${won.name}`
  if (lost) {
    const at = stoppedAt(stages)
    return at ? `Lost after ${at.name}` : 'Lost'
  }
  const current = stages.find((s) => s.state === 'current')
  if (current) return `Stage ${current.index + 1} of ${stages.length}: ${current.name}`
  return 'Not started'
}

export type StageLabelTone = 'current' | 'won' | 'lost' | 'none'

/**
 * The words beside the bar, so colour is never the only signal: the current stage ("Plant
 * visit"), the won stage ("Paid"), "Lost · First call", or "Not started".
 */
export function stageLabel(
  stages: readonly StageViewItem[],
  lost: boolean = hasLostMarker(stages),
): { text: string; tone: StageLabelTone } {
  const won = stages.find((s) => s.state === 'won')
  if (won) return { text: won.name, tone: 'won' }
  if (lost) {
    const at = stoppedAt(stages)
    return { text: at ? `Lost · ${at.name}` : 'Lost', tone: 'lost' }
  }
  const current = stages.find((s) => s.state === 'current')
  if (current) return { text: current.name, tone: 'current' }
  return { text: 'Not started', tone: 'none' }
}

/** How position `stage` is drawn; `lost` is whether the row is lost. */
export function stageBlockKind(stage: StageViewItem, lost: boolean): StageBlockKind {
  switch (stage.state) {
    case 'won':
      return 'won'
    case 'lost-marker':
      return 'lost'
    case 'future':
      return 'future'
    case 'current':
      return lost ? 'lost-done' : 'current'
    case 'done':
      if (lost) return 'lost-done'
      return stage.date === null ? 'skipped' : 'done'
  }
}

/** The tracker's pencil hatching for a stage passed: stripes of its ramp colour over a tint of it. */
export function stageHatch(step: number): string {
  const stripe = `color-mix(in srgb, var(--stage${step}) ${HATCH_STRIPE}%, var(--bg))`
  const ground = `color-mix(in srgb, var(--stage${step}) ${HATCH_GROUND}%, var(--bg))`
  return `repeating-linear-gradient(135deg, ${stripe} 0 1.5px, ${ground} 1.5px 5px)`
}

/** Mix percentages of the hatching (tests/unit/tokens.contrast.test.ts checks --text on both). */
export const HATCH_STRIPE = 45
export const HATCH_GROUND = 18

/**
 * CSS background for a stage block. `step` is the ramp step from `stageRampStep`. The grid bar
 * fills stages passed with the ramp colour and stripes skipped ones. The tracker (`soft`, D-048)
 * draws stages passed as pencil hatching in their ramp colour, the current stage solid, and
 * skipped stages as faint grey hatching, so each reads at a glance.
 */
export function stageFill(kind: StageBlockKind, step: number, soft = false): string {
  switch (kind) {
    case 'done':
      return soft ? stageHatch(step) : `var(--stage${step})`
    case 'current':
      return `var(--stage${step})`
    case 'skipped': {
      if (soft) {
        return 'repeating-linear-gradient(135deg, var(--grid-line) 0 1px, var(--stage-track) 1px 6px)'
      }
      return `repeating-linear-gradient(135deg, var(--stage${step}) 0 2px, var(--stage-track) 2px 4px)`
    }
    case 'won':
      return 'var(--stage-won)'
    case 'lost-done':
      return 'var(--stage-lost-done)'
    case 'lost':
      return 'var(--stage-lost)'
    case 'future':
      return 'var(--stage-track)'
  }
}

/** Text colour on a stage block in the tracker (each pair is contrast-tested in the tokens). */
export function stageInk(kind: StageBlockKind, step: number): string {
  switch (kind) {
    case 'done':
      // On the hatching, ink reads on both the stripe and the ground.
      return 'var(--text)'
    case 'current':
      return `var(--stage-fg${step})`
    case 'won':
      return 'var(--stage-won-fg)'
    case 'lost':
      return 'var(--stage-lost-fg)'
    case 'skipped':
      return 'var(--text-secondary)'
    case 'lost-done':
      return 'var(--text-secondary)'
    case 'future':
      return 'var(--text-muted)'
  }
}

/** The grid bar is about 100px wide whatever the number of stages. */
const STAGE_BAR_WIDTH = 100

/** Width of one bar cell: 13px for 7 stages, wider for fewer (at most 28px), at least 4px. */
export function stageBarCellWidth(count: number): number {
  if (count <= 0) return 0
  const fit = Math.floor((STAGE_BAR_WIDTH - (count - 1)) / count)
  return Math.max(4, Math.min(28, fit))
}

/** "3 Nov", or "no date" for a stage reached without a date. */
export function formatStageDate(date: string | null, now: Date): string {
  return date ? formatFuzzyDate(exactDate(date), now) : 'no date'
}

function cellTooltip(stage: StageViewItem, stages: readonly StageViewItem[], now: Date): string {
  if (stage.state === 'future') return stage.name
  if (stage.state === 'lost-marker') {
    const before = stages[stage.index - 1]
    return before ? `Lost after ${before.name}` : 'Lost'
  }
  if (stage.state === 'done' && stage.date === null) return `${stage.name} · skipped`
  return `${stage.name} · ${formatStageDate(stage.date, now)}`
}

/** Tooltip text, rendered only while a tooltip is open (so cells never subscribe to the clock). */
function CellTooltip({
  stage,
  stages,
}: {
  stage: StageViewItem
  stages: readonly StageViewItem[]
}) {
  const now = useNow()
  return <>{cellTooltip(stage, stages, now)}</>
}

const labelToneClassName: Record<StageLabelTone, string> = {
  current: 'text-secondary',
  won: 'font-semibold text-won-fg',
  lost: 'font-medium text-lost',
  none: 'text-muted',
}

export interface StageDotsProps {
  stages: readonly StageViewItem[]
  /**
   * Whether the row is lost. Defaults to whether a lost marker is shown; pass it for a row lost
   * at the final stage, which has no marker position.
   */
  lost?: boolean
  className?: string
}

/**
 * Compact stage progress for the grid: one joined bar (a 10px cell per stage, 1px gaps, about
 * 100px wide) and the stage label beside it. Reached stages step from light to deep blue, the
 * won stage is green, a lost row greys what it reached and marks the next position brick,
 * and skipped stages are striped. The label always names the state in words, and the whole
 * strip is one image named by `stageSummary`. Hover a cell for its name and date.
 */
export function StageDots({ stages, lost, className }: StageDotsProps) {
  if (stages.length === 0) return null
  const isLost = lost ?? hasLostMarker(stages)
  const count = stages.length
  const cellWidth = stageBarCellWidth(count)
  const label = stageLabel(stages, isLost)
  // One delegated tooltip for the whole bar; each cell still gets its own text and anchor.
  return (
    <TooltipDelegate
      selector="[data-stage-index]"
      content={(cell) => {
        const stage = stages[Number(cell.dataset.stageIndex)]
        return stage ? <CellTooltip stage={stage} stages={stages} /> : null
      }}
    >
      <span
        role="img"
        aria-label={stageSummary(stages, isLost)}
        className={cn('flex min-w-0 items-center gap-2.5', className)}
      >
        <span className="flex shrink-0 gap-px py-1">
          {stages.map((stage, i) => {
            const kind = stageBlockKind(stage, isLost)
            return (
              <span
                key={stage.id}
                data-state={stage.state}
                data-kind={kind}
                data-stage={stage.name}
                data-stage-index={i}
                className="block h-2.5 shrink-0 first:rounded-l-[3px] last:rounded-r-[3px]"
                style={{ width: cellWidth, background: stageFill(kind, stageRampStep(i, count)) }}
              />
            )
          })}
        </span>
        <span
          data-stage-label=""
          className={cn(
            'min-w-0 truncate text-[12.5px] leading-[1.3]',
            labelToneClassName[label.tone],
          )}
        >
          {label.text}
        </span>
      </span>
    </TooltipDelegate>
  )
}
