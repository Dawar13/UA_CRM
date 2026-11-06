import { type MouseEvent, memo } from 'react'
import type { ColumnDef, Row } from '@/domain/types'
import { cn } from '@/lib/cn'
import { type CellContext, GridCellContent } from './cells'
import { columnAlign } from './columnModel'

export interface GridRowHandlers {
  /** `colIndex` is the clicked cell's column. */
  onRowClick: (event: MouseEvent<HTMLDivElement>, row: Row, colIndex: number) => void
  onCellMouseDown: (rowIndex: number, colIndex: number) => void
  onCellDoubleClick: (rowIndex: number, colIndex: number) => void
}

/** The column of the cell an event happened in, or 0. */
function columnOf(target: EventTarget): number {
  const cell = (target as HTMLElement).closest?.('[role="gridcell"]')
  const index = Number(cell?.getAttribute('aria-colindex') ?? '1')
  return Number.isFinite(index) ? index - 1 : 0
}

interface GridRowProps {
  row: Row
  rowIndex: number
  ariaRowIndex: number
  defs: readonly ColumnDef[]
  gridTemplateColumns: string
  height: number
  /** The active column when this row is the active one, otherwise null. */
  activeCol: number | null
  isExpanded: boolean
  /** Part of a multi-row selection (Shift or Ctrl/Cmd). */
  isSelected?: boolean
  isFlashing: boolean
  cellId: (rowIndex: number, colIndex: number) => string
  ctx: CellContext
  handlers: GridRowHandlers
}

/**
 * One data row. Memoised so moving the active cell or scrolling only re-renders the rows whose
 * props changed (CLAUDE.md §3.1: smooth at 2,000 rows).
 */
export const GridRow = memo(function GridRow({
  row,
  rowIndex,
  ariaRowIndex,
  defs,
  gridTemplateColumns,
  height,
  activeCol,
  isExpanded,
  isSelected = false,
  isFlashing,
  cellId,
  ctx,
  handlers,
}: GridRowProps) {
  const isActiveRow = activeCol !== null
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the grid owns keyboard handling (Enter expands).
    <div
      role="row"
      aria-rowindex={ariaRowIndex}
      aria-selected={isActiveRow || isSelected}
      data-row-id={row.id}
      data-active={isActiveRow || undefined}
      data-expanded={isExpanded || undefined}
      data-selected={isSelected || undefined}
      data-flash={isFlashing || undefined}
      onClick={(e) => handlers.onRowClick(e, row, columnOf(e.target))}
      className={cn(
        // Fixed-height rows: contain their layout and paint so mounting a screenful stays cheap.
        'group/row grid cursor-default border-b border-grid-line bg-bg transition-colors duration-[var(--duration-fast)] [contain:layout_paint_style]',
        'hover:bg-row-hover',
        (isExpanded || isSelected) && 'bg-row-selected hover:bg-row-selected',
        'data-[flash]:animate-[row-flash_1.2s_var(--motion-ease-out)]',
      )}
      style={{ gridTemplateColumns, height }}
    >
      {defs.map((def, colIndex) => (
        <div
          key={def.id}
          id={cellId(rowIndex, colIndex)}
          role="gridcell"
          aria-colindex={colIndex + 1}
          data-col={def.key}
          // A plain grid's rows cannot carry aria-expanded; the row's first cell does.
          aria-expanded={colIndex === 0 ? isExpanded : undefined}
          data-active={activeCol === colIndex || undefined}
          onMouseDown={() => handlers.onCellMouseDown(rowIndex, colIndex)}
          onDoubleClick={() => handlers.onCellDoubleClick(rowIndex, colIndex)}
          className={cn(
            // Spreadsheet cells: a gridline on the right of every cell, compact 13px text.
            'flex min-w-0 items-center overflow-hidden border-r border-grid-line bg-inherit px-2.5 text-sm',
            colIndex === 0 && 'sticky left-0 z-10',
            columnAlign(def) === 'end' && 'justify-end',
            'group-focus/grid:data-[active]:focus-ring-inset',
          )}
        >
          <GridCellContent def={def} row={row} ctx={ctx} />
        </div>
      ))}
    </div>
  )
})
