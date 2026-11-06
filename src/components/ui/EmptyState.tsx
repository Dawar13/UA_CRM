import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const CELL = 18
const GAP = 4
const COLUMNS = 7
const ROWS = 4
const LABEL_GAP = 8
const LABEL_WIDTH = 14

export interface HeatmapArtProps {
  /**
   * The row of the first column drawn in deep blue ("now"); earlier rows are spent, later ones
   * fade lighter. -1 for none. Defaults to the top row.
   */
  nowRow?: number
  /** Labels down the right side, one per row (the side panel's hours). */
  rowLabels?: readonly string[]
  className?: string
  'data-testid'?: string
}

function cellFill(column: number, row: number, nowRow: number): string {
  if (column === 0) {
    if (row === nowRow) return 'var(--stage6)'
    if (row < nowRow) return 'var(--stage-track)'
    return row - nowRow === 1 ? 'var(--stage2)' : 'var(--stage1)'
  }
  // A quiet, fixed diagonal texture of two greys.
  return (column * 3 + row * 2) % 5 === 1 ? 'var(--grid-line)' : 'var(--stage-track)'
}

/**
 * The empty-state mark: a small heatmap of rounded cells, 7 across and 4 down, quiet greys with
 * the first column in stage blues and one deep-blue cell. The cells pop in with a short ripple,
 * skipped under reduced motion. Drawn from tokens, so it follows the theme. Purely decorative.
 */
export function HeatmapArt({
  nowRow = 0,
  rowLabels,
  className,
  'data-testid': testId = 'empty-state-art',
}: HeatmapArtProps) {
  const gridWidth = COLUMNS * CELL + (COLUMNS - 1) * GAP
  const height = ROWS * CELL + (ROWS - 1) * GAP
  const width = rowLabels ? gridWidth + LABEL_GAP + LABEL_WIDTH : gridWidth
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      data-testid={testId}
      className={cn('shrink-0 font-mono', className)}
    >
      {Array.from({ length: COLUMNS }, (_, column) =>
        Array.from({ length: ROWS }, (_, row) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed grid.
            key={`${column}-${row}`}
            x={column * (CELL + GAP)}
            y={row * (CELL + GAP)}
            width={CELL}
            height={CELL}
            rx="4"
            className="origin-center [transform-box:fill-box] motion-safe:animate-pop-in"
            style={{
              fill: cellFill(column, row, nowRow),
              animationDelay: `${column * 28 + row * 14}ms`,
              animationFillMode: 'both',
            }}
          />
        )),
      )}
      {rowLabels?.map((label, row) => (
        <text
          key={label}
          x={gridWidth + LABEL_GAP}
          y={row * (CELL + GAP) + CELL / 2 + 3}
          fontSize="8.5"
          fontWeight={500}
          style={{ fill: 'var(--text-muted)' }}
        >
          {label}
        </text>
      ))}
    </svg>
  )
}

/** The default art of every empty state. */
export function EmptyStateArt({ className }: { className?: string }) {
  return <HeatmapArt className={className} />
}

export interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  /** Usually one Button that does the obvious next thing. */
  action?: ReactNode
  /** The default mark, none (false, for tight spaces), or art of the surface's own. */
  art?: boolean | ReactNode
  className?: string
}

/** Empty states invite action: say what goes here and how to add it. */
export function EmptyState({ title, description, action, art = true, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}
    >
      {art === true ? (
        <EmptyStateArt className="mb-4" />
      ) : art ? (
        <div className="mb-4">{art}</div>
      ) : null}
      <p className="text-md font-semibold tracking-[-0.01em] text-text">{title}</p>
      {description !== undefined ? (
        <p className="mt-1 max-w-xs text-sm text-secondary">{description}</p>
      ) : null}
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
