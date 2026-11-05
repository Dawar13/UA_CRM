import {
  createSortedRowModel,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { defaultRangeExtractor, type Range, useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useMoveStage, useSetWarmth, useTagMap } from '@/data/hooks'
import { nextStageIndex, previousStageIndex } from '@/domain/stages'
import type { ColumnDef, Member, Row, Sheet, Warmth } from '@/domain/types'
import { nextWarmth } from '@/domain/warmth'
import { cn } from '@/lib/cn'
import { isModKey } from '@/lib/platform'
import { readJson, storageKeys, writeJson } from '@/lib/storage'
import type { CellContext } from './cells'
import {
  columnAlign,
  compareSortValues,
  type SortContext,
  type SortValue,
  sortValue,
  visibleColumns,
} from './columnModel'
import { GridRow, type GridRowHandlers } from './GridRow'

export const ROW_HEIGHT = 40
const HEADER_HEIGHT = 40
const EXPANDED_ESTIMATE = 300

interface GridColumnMeta {
  def: ColumnDef
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as GridColumnMeta,
})

function isSortingState(value: unknown): value is SortingState {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as { id?: unknown }).id === 'string' &&
        typeof (s as { desc?: unknown }).desc === 'boolean',
    )
  )
}

function usePersistedSorting(sheetId: string) {
  const [sorting, setSortingState] = useState<SortingState>(
    () => readJson(storageKeys.sort(sheetId), isSortingState) ?? [],
  )
  // Reset when the sheet changes.
  const [forSheet, setForSheet] = useState(sheetId)
  if (forSheet !== sheetId) {
    setForSheet(sheetId)
    setSortingState(readJson(storageKeys.sort(sheetId), isSortingState) ?? [])
  }
  const setSorting = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSortingState((old) => {
        const next = typeof updater === 'function' ? updater(old) : updater
        writeJson(storageKeys.sort(sheetId), next)
        return next
      })
    },
    [sheetId],
  )
  return [sorting, setSorting] as const
}

export interface SheetGridProps {
  sheet: Sheet
  rows: readonly Row[]
  /** The member whose tab is open; acts as the editor in Phase 0. */
  member: Member
  expandedRowId: string | null
  onExpandedChange: (rowId: string | null) => void
  flashRowId: string | null
  renderExpanded: (row: Row, collapse: () => void) => ReactNode
}

interface ActiveCell {
  /** -1 is the header row. */
  row: number
  col: number
}

const EMPTY_ROWS: Row[] = []

export function SheetGrid({
  sheet,
  rows,
  member,
  expandedRowId,
  onExpandedChange,
  flashRowId,
  renderExpanded,
}: SheetGridProps) {
  const gridId = useId().replace(/:/g, '')
  const scrollRef = useRef<HTMLDivElement>(null)
  const tagMap = useTagMap()
  // `mutate` is stable, so passing it down does not re-render every row.
  const { mutate: setWarmth } = useSetWarmth()
  const { mutate: moveStage } = useMoveStage()
  const [sorting, setSorting] = usePersistedSorting(sheet.id)
  const [active, setActive] = useState<ActiveCell>({ row: 0, col: 0 })

  const defs = useMemo(() => visibleColumns(sheet), [sheet])

  const sortCtx = useMemo<SortContext>(
    () => ({ sheet, tagMap, rowName: () => undefined }),
    [sheet, tagMap],
  )

  const columns = useMemo(
    () =>
      defs.map((def) => ({
        id: def.id,
        header: def.label,
        accessorFn: (row: Row): SortValue => sortValue(def, row, sortCtx),
        sortFn: (
          a: { getValue: (id: string) => unknown },
          b: { getValue: (id: string) => unknown },
          id: string,
        ) => compareSortValues(a.getValue(id) as SortValue, b.getValue(id) as SortValue),
        sortUndefined: 'last' as const,
        sortDescFirst: false,
        meta: { def },
      })),
    [defs, sortCtx],
  )

  const data = rows.length > 0 ? (rows as Row[]) : EMPTY_ROWS
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row: Row) => row.id,
    state: { sorting },
    onSortingChange: setSorting,
    enableSortingRemoval: true,
    enableMultiSort: false,
  })

  const tableRows = table.getRowModel().rows
  const rowCount = tableRows.length
  const colCount = defs.length
  const expandedIndex = expandedRowId
    ? tableRows.findIndex((r) => r.original.id === expandedRowId)
    : -1

  // Keep the active cell in range when rows or columns change.
  useEffect(() => {
    setActive((a) => ({
      row: Math.min(a.row, Math.max(rowCount - 1, -1)),
      col: Math.min(a.col, Math.max(colCount - 1, 0)),
    }))
  }, [rowCount, colCount])

  const activeRowIndex = active.row
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range)
      if (activeRowIndex >= 0 && !indexes.includes(activeRowIndex)) {
        indexes.push(activeRowIndex)
        indexes.sort((a, b) => a - b)
      }
      return indexes
    },
    [activeRowIndex],
  )

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      tableRows[index]?.original.id === expandedRowId ? ROW_HEIGHT + EXPANDED_ESTIMATE : ROW_HEIGHT,
    getItemKey: (index) => tableRows[index]?.original.id ?? index,
    overscan: 12,
    rangeExtractor,
    scrollPaddingStart: HEADER_HEIGHT,
    // Render a first screen before the scroll element is measured (replaced on measurement).
    initialRect: { width: 1200, height: 800 },
  })

  // A deep link or search jump makes the expanded row the active one and brings it into view.
  useEffect(() => {
    if (expandedIndex < 0) return
    setActive((a) => ({ ...a, row: expandedIndex }))
    virtualizer.scrollToIndex(expandedIndex, { align: 'auto' })
  }, [expandedIndex, virtualizer])

  // A jump (search, a link chip, a calendar chip) also brings keyboard focus to the grid, so the
  // keyboard carries on from the row it landed on. A plain deep link leaves focus alone.
  const jumpTarget =
    flashRowId !== null && flashRowId === expandedRowId && expandedIndex >= 0 ? flashRowId : null
  useEffect(() => {
    if (jumpTarget) scrollRef.current?.focus({ preventScroll: true })
  }, [jumpTarget])

  const gridTemplateColumns = defs.map((d) => `${d.width}px`).join(' ')
  const totalWidth = defs.reduce((sum, d) => sum + d.width, 0)

  const cellId = useCallback(
    (rowIndex: number, colIndex: number) =>
      rowIndex < 0 ? `${gridId}-h-${colIndex}` : `${gridId}-r${rowIndex}-c${colIndex}`,
    [gridId],
  )

  const activeDescendant =
    colCount > 0 && (active.row >= 0 ? active.row < rowCount : true)
      ? cellId(active.row, active.col)
      : undefined

  // Scroll the active cell into view after keyboard moves.
  const scrollActiveIntoView = useCallback(
    (next: ActiveCell) => {
      if (next.row >= 0) virtualizer.scrollToIndex(next.row, { align: 'auto' })
      requestAnimationFrame(() => {
        const el = document.getElementById(cellId(next.row, next.col))
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    },
    [virtualizer, cellId],
  )

  const moveTo = useCallback(
    (next: ActiveCell) => {
      const clamped = {
        row: Math.max(-1, Math.min(next.row, rowCount - 1)),
        col: Math.max(0, Math.min(next.col, colCount - 1)),
      }
      setActive(clamped)
      scrollActiveIntoView(clamped)
    },
    [rowCount, colCount, scrollActiveIntoView],
  )

  const cellCtx = useMemo<CellContext>(
    () => ({
      sheet,
      tagMap,
      onWarmthChange: (row: Row, warmth: Warmth | null) =>
        setWarmth({ row, warmth, actorId: member.id }),
    }),
    [sheet, tagMap, setWarmth, member.id],
  )

  const toggleExpand = useCallback(
    (rowId: string) => onExpandedChange(expandedRowId === rowId ? null : rowId),
    [expandedRowId, onExpandedChange],
  )

  // Row handlers stay referentially stable; they read the latest state through a ref.
  const latest = useRef({ toggleExpand })
  latest.current = { toggleExpand }
  const rowHandlers = useMemo<GridRowHandlers>(
    () => ({
      onRowClick: (event, row) => {
        // Clicks on controls inside cells (warmth menu, tooltips) do not toggle the row. Clicks in
        // portalled content (the warmth menu's items) bubble here through React but are not
        // inside the row's DOM, so they are ignored too.
        const target = event.target as HTMLElement
        if (!event.currentTarget.contains(target)) return
        if (target.closest('button, a, [role="menuitem"], input, textarea')) return
        latest.current.toggleExpand(row.id)
        scrollRef.current?.focus({ preventScroll: true })
      },
      onCellMouseDown: (rowIndex, colIndex) => setActive({ row: rowIndex, col: colIndex }),
    }),
    [],
  )

  const collapse = useCallback(() => {
    onExpandedChange(null)
    scrollRef.current?.focus({ preventScroll: true })
  }, [onExpandedChange])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Events from portalled menus and tooltips bubble through React but are not ours.
    if (!event.currentTarget.contains(event.target as Node)) return
    // Keys inside the expanded row's controls belong to those controls.
    if (event.target !== event.currentTarget) {
      if (event.key === 'Escape' && expandedRowId) {
        event.preventDefault()
        collapse()
      }
      return
    }
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / ROW_HEIGHT) - 2)
    const mod = isModKey(event)
    const activeRow = active.row >= 0 ? tableRows[active.row]?.original : undefined
    switch (event.key) {
      case 'ArrowDown':
        moveTo({ ...active, row: active.row + 1 })
        break
      case 'ArrowUp':
        moveTo({ ...active, row: active.row - 1 })
        break
      case 'ArrowRight':
        moveTo({ ...active, col: active.col + 1 })
        break
      case 'ArrowLeft':
        moveTo({ ...active, col: active.col - 1 })
        break
      case 'Home':
        moveTo(mod ? { row: 0, col: 0 } : { ...active, col: 0 })
        break
      case 'End':
        moveTo(mod ? { row: rowCount - 1, col: colCount - 1 } : { ...active, col: colCount - 1 })
        break
      case 'PageDown':
        moveTo({ ...active, row: Math.max(active.row, 0) + page })
        break
      case 'PageUp':
        moveTo({ ...active, row: Math.max(active.row - page, 0) })
        break
      case 'Enter':
        if (active.row < 0) {
          table.getAllLeafColumns()[active.col]?.toggleSorting(undefined, false)
        } else if (activeRow) {
          toggleExpand(activeRow.id)
        }
        break
      case 'Escape':
        if (!expandedRowId) return
        onExpandedChange(null)
        break
      case 'w':
      case 'W':
        if (mod || event.altKey || !activeRow) return
        setWarmth({ row: activeRow, warmth: nextWarmth(activeRow.warmth), actorId: member.id })
        break
      case ']':
      case '[': {
        if (!activeRow || sheet.stages.length === 0) return
        const target =
          event.key === ']'
            ? nextStageIndex(activeRow, sheet)
            : previousStageIndex(activeRow, sheet)
        if (target !== null) {
          moveStage({ row: activeRow, sheet, stageIndex: target, actorId: member.id })
        }
        break
      }
      default:
        return
    }
    event.preventDefault()
  }

  const headerGroup = table.getHeaderGroups()[0]
  const virtualItems = virtualizer.getVirtualItems()
  const ariaRowCount = rowCount + 1 + (expandedIndex >= 0 ? 1 : 0)

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={sheet.name}
      aria-rowcount={ariaRowCount}
      aria-colcount={colCount}
      aria-activedescendant={activeDescendant}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="sheet-grid"
      className="group/grid relative h-full overflow-auto overscroll-contain bg-bg outline-none"
      style={{ scrollPaddingTop: HEADER_HEIGHT, scrollPaddingLeft: defs[0]?.width ?? 0 }}
    >
      <div style={{ width: totalWidth, minWidth: '100%' }}>
        {/* Header */}
        <div role="rowgroup" className="sticky top-0 z-20 bg-bg">
          <div
            role="row"
            aria-rowindex={1}
            className="grid border-b border-border"
            style={{ gridTemplateColumns, height: HEADER_HEIGHT }}
          >
            {headerGroup?.headers.map((header, colIndex) => {
              const def = header.column.columnDef.meta?.def
              const sorted = header.column.getIsSorted()
              const isActive = active.row === -1 && active.col === colIndex
              return (
                <div
                  key={header.id}
                  id={cellId(-1, colIndex)}
                  role="columnheader"
                  aria-colindex={colIndex + 1}
                  aria-sort={
                    sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                  }
                  data-active={isActive || undefined}
                  onMouseDown={() => rowHandlers.onCellMouseDown(-1, colIndex)}
                  className={cn(
                    'relative flex items-center bg-bg px-3 text-xs font-medium text-muted',
                    colIndex === 0 && 'sticky left-0 z-10',
                    def && columnAlign(def) === 'end' && 'justify-end',
                    'group-focus/grid:data-[active]:focus-ring-inset',
                  )}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => header.column.toggleSorting(undefined, false)}
                    className={cn(
                      'inline-flex min-w-0 items-center gap-1 rounded-control py-1 hover:text-text',
                      sorted && 'text-text',
                    )}
                  >
                    <span className="truncate">{def?.label}</span>
                    {sorted === 'asc' ? (
                      <ArrowUp aria-hidden className="size-3 shrink-0" />
                    ) : sorted === 'desc' ? (
                      <ArrowDown aria-hidden className="size-3 shrink-0" />
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((item) => {
            const tableRow = tableRows[item.index]
            if (!tableRow) return null
            const row = tableRow.original
            const isExpanded = row.id === expandedRowId
            const rowIndexAria =
              2 + item.index + (expandedIndex >= 0 && item.index > expandedIndex ? 1 : 0)
            return (
              <div
                key={item.key}
                role="presentation"
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <GridRow
                  row={row}
                  rowIndex={item.index}
                  ariaRowIndex={rowIndexAria}
                  defs={defs}
                  gridTemplateColumns={gridTemplateColumns}
                  height={ROW_HEIGHT}
                  activeCol={active.row === item.index ? active.col : null}
                  isExpanded={isExpanded}
                  isFlashing={flashRowId === row.id}
                  cellId={cellId}
                  ctx={cellCtx}
                  handlers={rowHandlers}
                />
                {isExpanded ? (
                  <div
                    role="row"
                    aria-rowindex={rowIndexAria + 1}
                    className="border-b border-border bg-row-selected"
                  >
                    <div
                      role="gridcell"
                      aria-colindex={1}
                      aria-colspan={colCount}
                      className="sticky left-0"
                      style={{ width: scrollRef.current?.clientWidth ?? '100%' }}
                    >
                      {renderExpanded(row, collapse)}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
