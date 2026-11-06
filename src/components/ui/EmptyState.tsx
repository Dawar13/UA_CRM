import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const CELL = 14
const GAP = 4
const COLUMNS = 4
const ROWS = 3
/** Filled cells rise like a stage bar: [row, column, stage colour]. */
const FILLED: readonly (readonly [number, number, string])[] = [
  [0, 0, 'var(--stage4)'],
  [1, 0, 'var(--stage3)'],
  [1, 1, 'var(--stage4)'],
  [2, 0, 'var(--stage2)'],
  [2, 1, 'var(--stage3)'],
  [2, 2, 'var(--stage4)'],
]

/**
 * The empty-state mark: a small grid of spreadsheet cells, hairline and light, with a staircase
 * of stage blues rising through it. Flat and geometric; purely decorative.
 */
export function EmptyStateArt({ className }: { className?: string }) {
  const width = COLUMNS * CELL + (COLUMNS - 1) * GAP
  const height = ROWS * CELL + (ROWS - 1) * GAP
  const fillAt = (row: number, column: number) =>
    FILLED.find(([r, c]) => r === row && c === column)?.[2]
  return (
    <svg
      viewBox={`-1 -1 ${width + 2} ${height + 2}`}
      width={width + 2}
      height={height + 2}
      aria-hidden="true"
      focusable="false"
      data-testid="empty-state-art"
      className={cn('shrink-0', className)}
    >
      {Array.from({ length: ROWS }, (_, row) =>
        Array.from({ length: COLUMNS }, (_, column) => {
          const fill = fillAt(row, column)
          return (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed grid.
              key={`${row}-${column}`}
              x={column * (CELL + GAP)}
              y={row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx="3"
              style={
                fill
                  ? { fill }
                  : { fill: 'var(--stage-track)', stroke: 'var(--grid-line)', strokeWidth: 1 }
              }
            />
          )
        }),
      )}
    </svg>
  )
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
