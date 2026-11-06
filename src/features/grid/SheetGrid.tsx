import {
  createSortedRowModel,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { defaultRangeExtractor, type Range, useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ChevronDown, EyeOff, Plus, Settings2 } from 'lucide-react'
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useUiStore } from '@/app/uiStore'
import { useActor } from '@/auth/AuthContext'
import { Kbd } from '@/components/ui/Kbd'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import {
  type PastedRow,
  useCreateRow,
  useDeleteRows,
  useMoveStage,
  usePasteRows,
  useReorderColumns,
  useSetWarmth,
  useTagMap,
  useUpdateColumn,
  useUpdateRow,
} from '@/data/hooks'
import { useRepository } from '@/data/RepositoryContext'
import {
  type CellTextContext,
  cellPatch,
  cellText,
  editorKind,
  parseClipboardGrid,
  parsePastedCell,
  toClipboardGrid,
} from '@/domain/cellInput'
import { pluralise } from '@/domain/format'
import { isContactText } from '@/domain/quickadd/smartPaste'
import type { NewRowValues, RowPatch } from '@/domain/rows'
import { nextStageIndex, previousStageIndex } from '@/domain/stages'
import type { ColumnDef, Member, Row, Sheet, Warmth } from '@/domain/types'
import { nextWarmth } from '@/domain/warmth'
import { reviewNewRows } from '@/features/quick-add/DuplicateReview'
import { cn } from '@/lib/cn'
import { isModKey } from '@/lib/platform'
import { readJson, storageKeys, writeJson } from '@/lib/storage'
import { useNow } from '@/lib/useNow'
import { layout } from '@/styles/tokens'
import { CellEditor, type EditMove, type EditOutcome } from './CellEditor'
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

/** Row height in px (the --row-height token). */
export const ROW_HEIGHT = layout.rowHeight
const HEADER_HEIGHT = 32
/** First guess at the expanded details' height; the virtualizer measures the real one. */
const EXPANDED_ESTIMATE = 480
/** Single keys that are shortcuts, not the start of typing (CLAUDE.md §3.1). */
const SHORTCUT_KEYS = new Set(['w', 'W', 'n', 'N', '[', ']', '/', '?'])

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
  /** The member whose tab is open. */
  member: Member
  expandedRowId: string | null
  onExpandedChange: (rowId: string | null) => void
  flashRowId: string | null
  renderExpanded: (row: Row, collapse: () => void) => ReactNode
  /** The signed-in member may change this tab (their own, and online). */
  editable: boolean
  /** An edit was attempted where it is not allowed: says why. */
  onRefuse: () => void
  /** Opens the column manager (your own tab). */
  onManageColumns?: () => void
}

interface ActiveCell {
  /** -1 is the header row; rowCount is the "add a contact" line (own tab only). */
  row: number
  col: number
}

/** A cell being edited: a row's cell, or the Name of a new row (rowId null). */
interface Editing {
  rowId: string | null
  col: number
  initial: string | null
}

const EMPTY_ROWS: Row[] = []

/** A blank row for the add line's Name editor. */
function blankRow(sheet: Sheet): Row {
  return {
    id: '',
    sheetId: sheet.id,
    memberId: sheet.memberId,
    position: 0,
    name: '',
    company: '',
    title: '',
    phone: '',
    email: '',
    linkedin: '',
    links: [],
    warmth: null,
    stageIndex: null,
    stageDates: {},
    lost: null,
    tagIds: [],
    nextAction: null,
    introducedBy: null,
    connectsTo: [],
    notes: '',
    files: [],
    fields: {},
    lastTouchAt: null,
    createdAt: '',
    updatedAt: '',
    createdBy: '',
    updatedBy: '',
    deletedAt: null,
  }
}

export function SheetGrid({
  sheet,
  rows,
  member,
  expandedRowId,
  onExpandedChange,
  flashRowId,
  renderExpanded,
  editable,
  onRefuse,
  onManageColumns,
}: SheetGridProps) {
  const gridId = useId().replace(/:/g, '')
  const scrollRef = useRef<HTMLDivElement>(null)
  const tagMap = useTagMap()
  const now = useNow()
  const actorId = useActor()?.id ?? member.id
  // `mutate` is stable, so passing it down does not re-render every row.
  const { mutate: setWarmth } = useSetWarmth()
  const { mutate: moveStage } = useMoveStage()
  const updateRow = useUpdateRow()
  const createRow = useCreateRow()
  const deleteRows = useDeleteRows()
  const pasteRows = usePasteRows()
  const repo = useRepository()
  const updateColumn = useUpdateColumn()
  const reorderColumns = useReorderColumns()
  /** A column being resized: its id and the width so far. */
  const [resizing, setResizing] = useState<{ id: string; width: number } | null>(null)
  const [draggingCol, setDraggingCol] = useState<string | null>(null)
  const [sorting, setSorting] = usePersistedSorting(sheet.id)
  const [active, setActive] = useState<ActiveCell>({ row: 0, col: 0 })
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)

  const defs = useMemo(() => visibleColumns(sheet), [sheet])
  const stageNames = useMemo(() => sheet.stages.map((s) => s.name), [sheet])
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  const sortCtx = useMemo<SortContext>(
    () => ({ sheet, tagMap, rowName: () => undefined }),
    [sheet, tagMap],
  )
  const textCtx = useMemo<CellTextContext>(
    () => ({ now, tagMap, rowName: (id) => rowById.get(id)?.name, stageNames }),
    [now, tagMap, rowById, stageNames],
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
  /** The last row index the cursor can reach: the add line in your own tab. */
  const lastRow = editable ? rowCount : rowCount - 1
  const expandedIndex = expandedRowId
    ? tableRows.findIndex((r) => r.original.id === expandedRowId)
    : -1

  // Keep the active cell in range when rows or columns change.
  useEffect(() => {
    setActive((a) => ({
      row: Math.min(a.row, Math.max(lastRow, -1)),
      col: Math.min(a.col, Math.max(colCount - 1, 0)),
    }))
  }, [lastRow, colCount])

  // Quick add logs a touch with > on the active row.
  const setActiveRowId = useUiStore((s) => s.setActiveRowId)
  const activeRowIdForQuickAdd =
    active.row >= 0 ? (tableRows[active.row]?.original.id ?? null) : null
  useEffect(() => setActiveRowId(activeRowIdForQuickAdd), [activeRowIdForQuickAdd, setActiveRowId])

  // Selected rows that are gone (moved to Trash) leave the selection.
  useEffect(() => {
    setSelected((s) => {
      if (s.size === 0) return s
      const kept = new Set([...s].filter((id) => rowById.has(id)))
      return kept.size === s.size ? s : kept
    })
  }, [rowById])

  const activeRowIndex = active.row
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range)
      if (activeRowIndex >= 0 && activeRowIndex < rowCount && !indexes.includes(activeRowIndex)) {
        indexes.push(activeRowIndex)
        indexes.sort((a, b) => a - b)
      }
      return indexes
    },
    [activeRowIndex, rowCount],
  )

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      tableRows[index]?.original.id === expandedRowId ? ROW_HEIGHT + EXPANDED_ESTIMATE : ROW_HEIGHT,
    getItemKey: (index) => tableRows[index]?.original.id ?? index,
    // Rows are 36px, so 6 rows each way already cover a fast scroll; more costs long tasks on jumps.
    overscan: 6,
    rangeExtractor,
    scrollPaddingStart: HEADER_HEIGHT,
    // Render a first screen before the scroll element is measured (replaced on measurement).
    initialRect: { width: 1200, height: 800 },
  })

  // A deep link, a search jump or expanding a row makes it the active one and puts it at the top
  // of the grid, just under the header, with its details below. When the row is already in
  // place, no scroll is issued at all (a no-op scroll races with focus returning from the search
  // dialog in WebKit).
  useEffect(() => {
    if (expandedIndex < 0) return
    setActive((a) => ({ ...a, row: expandedIndex }))
    const target = virtualizer.getOffsetForIndex(expandedIndex, 'start')?.[0]
    const current = scrollRef.current?.scrollTop
    if (target !== undefined && current !== undefined && Math.abs(current - target) < 1) return
    virtualizer.scrollToIndex(expandedIndex, { align: 'start' })
  }, [expandedIndex, virtualizer])

  // A jump (search, a link chip, a calendar chip) also brings keyboard focus to the grid.
  const jumpTarget =
    flashRowId !== null && flashRowId === expandedRowId && expandedIndex >= 0 ? flashRowId : null
  useEffect(() => {
    if (jumpTarget) scrollRef.current?.focus({ preventScroll: true })
  }, [jumpTarget])

  const widthOf = (d: ColumnDef) => (resizing?.id === d.id ? resizing.width : d.width)
  const gridTemplateColumns = defs.map((d) => `${widthOf(d)}px`).join(' ')
  const totalWidth = defs.reduce((sum, d) => sum + widthOf(d), 0)

  // ---------- Columns: resize, reorder, hide (your own tab) ----------

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, def: ColumnDef) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = def.width
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    let width = startWidth
    const onMove = (e: PointerEvent) => {
      width = Math.max(48, Math.round(startWidth + e.clientX - startX))
      setResizing({ id: def.id, width })
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      setResizing(null)
      if (width !== startWidth) {
        updateColumn.mutate({ sheet, column: def, patch: { width }, actorId })
      }
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  const dropColumn = (targetId: string) => {
    const dragged = draggingCol
    setDraggingCol(null)
    if (!dragged || dragged === targetId) return
    const ordered = sheet.columns
      .filter((c) => !c.deletedAt)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.id)
    const ids = ordered.filter((id) => id !== dragged)
    ids.splice(ids.indexOf(targetId), 0, dragged)
    reorderColumns.mutate({ sheet, ids, actorId })
  }

  const cellId = useCallback(
    (rowIndex: number, colIndex: number) =>
      rowIndex < 0 ? `${gridId}-h-${colIndex}` : `${gridId}-r${rowIndex}-c${colIndex}`,
    [gridId],
  )
  const addLineCellId = `${gridId}-add-c0`

  const activeDescendant =
    colCount === 0
      ? undefined
      : active.row === rowCount && editable
        ? addLineCellId
        : active.row < rowCount
          ? cellId(active.row, active.col)
          : undefined

  const focusGrid = useCallback(() => scrollRef.current?.focus({ preventScroll: true }), [])

  // Scroll the active cell into view after keyboard moves.
  const scrollActiveIntoView = useCallback(
    (next: ActiveCell) => {
      if (next.row >= 0 && next.row < rowCount) {
        virtualizer.scrollToIndex(next.row, { align: 'auto' })
      }
      requestAnimationFrame(() => {
        const id = next.row === rowCount ? addLineCellId : cellId(next.row, next.col)
        document.getElementById(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    },
    [virtualizer, cellId, rowCount, addLineCellId],
  )

  const moveTo = useCallback(
    (next: ActiveCell) => {
      const clamped = {
        row: Math.max(-1, Math.min(next.row, lastRow)),
        col: Math.max(0, Math.min(next.col, colCount - 1)),
      }
      setActive(clamped)
      scrollActiveIntoView(clamped)
    },
    [lastRow, colCount, scrollActiveIntoView],
  )

  const cellCtx = useMemo<CellContext>(
    () => ({
      sheet,
      tagMap,
      onWarmthChange: editable
        ? (row: Row, warmth: Warmth | null) => setWarmth({ row, warmth, actorId })
        : undefined,
    }),
    [sheet, tagMap, setWarmth, actorId, editable],
  )

  const toggleExpand = useCallback(
    (rowId: string) => onExpandedChange(expandedRowId === rowId ? null : rowId),
    [expandedRowId, onExpandedChange],
  )

  // ---------- Editing ----------

  const startEdit = (rowIndex: number, colIndex: number, initial: string | null) => {
    if (!editable) {
      onRefuse()
      return
    }
    if (rowIndex === rowCount) {
      setEditing({ rowId: null, col: 0, initial })
      return
    }
    const row = tableRows[rowIndex]?.original
    const def = defs[colIndex]
    if (!row || !def || editorKind(def) === 'readOnly') return
    if (editorKind(def) === 'checkbox') {
      const value = row.fields[def.key] === true
      updateRow.mutate({
        row,
        sheet,
        patch: cellPatch(def, row, !value),
        actorId,
        label: `Edit ${def.label}`,
      })
      return
    }
    setEditing({ rowId: row.id, col: colIndex, initial })
  }

  const finishEdit = (outcome: EditOutcome, move: EditMove) => {
    const current = editing
    setEditing(null)
    focusGrid()
    if (!current) return
    if (current.rowId === null) {
      // A new row: the outcome carries its name.
      if (outcome.kind === 'patch' && typeof outcome.patch.name === 'string') {
        createRow.mutate(
          {
            sheet,
            values: { name: outcome.patch.name },
            actorId,
            position: rows.reduce((max, r) => Math.max(max, r.position + 1), 0),
            id: crypto.randomUUID(),
          },
          // The duplicate check runs for new rows too (CLAUDE.md §2.7).
          { onSuccess: (result) => void reviewNewRows(repo, [result.row]) },
        )
      }
      return
    }
    const row = rowById.get(current.rowId)
    if (row) {
      if (outcome.kind === 'patch') {
        updateRow.mutate({ row, sheet, patch: outcome.patch, actorId, label: outcome.label })
      } else if (outcome.kind === 'warmth' && outcome.warmth !== row.warmth) {
        setWarmth({ row, warmth: outcome.warmth, actorId })
      } else if (outcome.kind === 'stage' && outcome.index !== row.stageIndex) {
        moveStage({ row, sheet, stageIndex: outcome.index, actorId })
      }
    }
    const rowIndex = tableRows.findIndex((r) => r.original.id === current.rowId)
    if (move === 'down') moveTo({ row: rowIndex + 1, col: current.col })
    else if (move === 'right') moveTo({ row: rowIndex, col: current.col + 1 })
    else if (move === 'left') moveTo({ row: rowIndex, col: current.col - 1 })
  }

  const cancelEdit = () => {
    setEditing(null)
    focusGrid()
  }

  /** Empties the active cell (Delete without a row selection). */
  const clearCell = (row: Row, def: ColumnDef) => {
    if (def.system && def.key === 'name') {
      toast('A row needs a name', { id: 'clear-cell' })
      return
    }
    if (def.system && def.key === 'warmth') {
      if (row.warmth !== null) setWarmth({ row, warmth: null, actorId })
      return
    }
    const kind = editorKind(def)
    if (kind === 'readOnly' || (def.system && def.key === 'stage')) return
    let value: unknown = null
    if (kind === 'tags' || kind === 'people' || (def.system && def.key === 'links')) value = []
    else if (def.system && !['nextAction', 'nextDate', 'introducedBy'].includes(def.key)) value = ''
    updateRow.mutate({
      row,
      sheet,
      patch: cellPatch(def, row, value),
      actorId,
      label: `Clear ${def.label}`,
    })
  }

  const selectedRows = (): Row[] =>
    tableRows.map((r) => r.original).filter((r) => selected.has(r.id))

  const trashRows = (targets: Row[]) => {
    if (targets.length === 0) return
    deleteRows.mutate({ sheet, rows: targets, actorId })
    setSelected(new Set())
    setSelectionAnchor(null)
  }

  // ---------- Selection ----------

  const selectRange = (from: number, to: number) => {
    const [a, b] = from <= to ? [from, to] : [to, from]
    setSelected(new Set(tableRows.slice(a, b + 1).map((r) => r.original.id)))
  }

  // ---------- Copy and paste ----------

  const onCopy = (event: ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || editing) return
    const chosen = selectedRows()
    let text = ''
    if (chosen.length > 0) {
      text = toClipboardGrid([
        defs.map((d) => d.label),
        ...chosen.map((row) => defs.map((def) => cellText(def, row, textCtx))),
      ])
    } else {
      const row = tableRows[active.row]?.original
      const def = defs[active.col]
      if (!row || !def) return
      text = cellText(def, row, textCtx)
    }
    event.preventDefault()
    event.clipboardData.setData('text/plain', text)
    toast(chosen.length > 0 ? `Copied ${pluralise(chosen.length, 'row')}` : 'Copied', {
      id: 'copied',
    })
  }

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || editing) return
    event.preventDefault()
    if (!editable) {
      onRefuse()
      return
    }
    const pasted = event.clipboardData.getData('text/plain')
    // Smart paste: a signature or profile goes to quick add; a spreadsheet block fills cells.
    if (isContactText(pasted, event.clipboardData.getData('text/html'))) {
      useUiStore.getState().pasteIntoQuickAdd(pasted)
      return
    }
    const block = parseClipboardGrid(pasted)
    if (block.length === 0) return
    const startRow = Math.max(0, active.row)
    const startCol = active.row === rowCount ? 0 : active.col
    const items: PastedRow[] = []
    let skipped = 0
    block.forEach((cells, i) => {
      const existing = tableRows[startRow + i]?.original
      // Each cell's change builds on the ones before it in the same row.
      let draft: Row = existing ?? blankRow(sheet)
      const patch: RowPatch = {}
      const values: NewRowValues = {}
      let warmth: Warmth | null | undefined
      let stageIndex: number | undefined
      const tagNames: string[] = []
      cells.forEach((text, j) => {
        const def = defs[startCol + j]
        if (!def) return
        const parsed = parsePastedCell(def, text, now, stageNames)
        if (!parsed.ok) {
          if (text.trim() !== '') skipped += 1
          return
        }
        if (parsed.kind === 'warmth') warmth = parsed.value
        else if (parsed.kind === 'stage') stageIndex = parsed.value ?? undefined
        else if (parsed.kind === 'tags') tagNames.push(...parsed.names)
        else {
          const change = cellPatch(def, draft, parsed.value)
          Object.assign(existing ? patch : values, change)
          draft = { ...draft, ...change }
        }
      })
      if (existing) {
        items.push({ kind: 'update', row: existing, patch, warmth, stageIndex, tagNames })
      } else if (typeof values.name === 'string' && values.name.trim() !== '') {
        items.push({
          kind: 'create',
          values: stageIndex !== undefined ? { ...values, stageIndex } : values,
          tagNames,
          warmth,
        })
      } else {
        skipped += cells.filter((c) => c.trim() !== '').length
      }
    })
    if (items.length === 0) {
      toast('Nothing in the paste fits these columns', { id: 'paste' })
      return
    }
    pasteRows.mutate(
      { sheet, rows: items, actorId, skipped },
      {
        // Pasted rows go through the duplicate check as one review.
        onSuccess: async (done) => {
          const added = await Promise.all(done.created.map((id) => repo.getRow(id)))
          await reviewNewRows(
            repo,
            added.filter((r): r is Row => r !== undefined),
          )
        },
      },
    )
  }

  // ---------- Mouse ----------

  // Row handlers stay referentially stable; they read the latest state through a ref.
  const latest = useRef({
    toggleExpand,
    startEdit,
    editable,
    defs,
    tableRows,
    active,
    selectionAnchor,
    selectRange,
  })
  latest.current = {
    toggleExpand,
    startEdit,
    editable,
    defs,
    tableRows,
    active,
    selectionAnchor,
    selectRange,
  }
  const rowHandlers = useMemo<GridRowHandlers>(
    () => ({
      onRowClick: (event, row, colIndex) => {
        // Clicks on controls inside cells (warmth menu, tooltips) do not toggle the row. Clicks in
        // portalled content bubble here through React but are not inside the row's DOM.
        const target = event.target as HTMLElement
        if (!event.currentTarget.contains(target)) return
        if (target.closest('button, a, [role="menuitem"], input, textarea')) return
        const l = latest.current
        const index = l.tableRows.findIndex((r) => r.original.id === row.id)
        if (event.shiftKey) {
          const anchor = l.selectionAnchor ?? l.active.row
          setSelectionAnchor(anchor)
          l.selectRange(anchor, index)
          return
        }
        if (isModKey(event)) {
          setSelectionAnchor(index)
          setSelected((s) => {
            const next = new Set(s)
            if (next.has(row.id)) next.delete(row.id)
            else next.add(row.id)
            return next
          })
          return
        }
        setSelected((s) => (s.size === 0 ? s : new Set()))
        setSelectionAnchor(null)
        // In your own tab a click picks the cell, and the Name opens the row; elsewhere any click
        // opens it (there is nothing to edit).
        const def = l.defs[colIndex]
        if (!l.editable || (def?.system && def.key === 'name')) l.toggleExpand(row.id)
        scrollRef.current?.focus({ preventScroll: true })
      },
      onCellMouseDown: (rowIndex, colIndex) => setActive({ row: rowIndex, col: colIndex }),
      onCellDoubleClick: (rowIndex, colIndex) => {
        const l = latest.current
        if (l.editable) l.startEdit(rowIndex, colIndex, null)
      },
    }),
    [],
  )

  const collapse = useCallback(() => {
    onExpandedChange(null)
    focusGrid()
  }, [onExpandedChange, focusGrid])

  // ---------- Keyboard ----------

  const extendSelection = (to: number) => {
    const anchor = selectionAnchor ?? active.row
    setSelectionAnchor(anchor)
    selectRange(anchor, to)
    moveTo({ ...active, row: to })
  }

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
    const onAddLine = active.row === rowCount
    const activeRow = active.row >= 0 && !onAddLine ? tableRows[active.row]?.original : undefined
    const activeDef = defs[active.col]
    switch (event.key) {
      case 'ArrowDown':
        if (event.shiftKey && activeRow) extendSelection(Math.min(active.row + 1, rowCount - 1))
        else moveTo({ ...active, row: active.row + 1 })
        break
      case 'ArrowUp':
        if (event.shiftKey && activeRow) extendSelection(Math.max(active.row - 1, 0))
        else moveTo({ ...active, row: active.row - 1 })
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
        } else if (onAddLine) {
          startEdit(rowCount, 0, null)
        } else if (activeRow) {
          // Enter opens the row from its Name (and anywhere in a tab you can only read); on any
          // other cell of your own row it edits.
          const isName = activeDef?.system && activeDef.key === 'name'
          const readOnly = !activeDef || editorKind(activeDef) === 'readOnly'
          if (isName || !editable || readOnly) toggleExpand(activeRow.id)
          else startEdit(active.row, active.col, null)
        }
        break
      case 'F2':
        if (activeRow || onAddLine) startEdit(active.row, active.col, null)
        break
      case 'Delete':
      case 'Backspace': {
        if (!editable) {
          onRefuse()
          break
        }
        const chosen = selectedRows()
        if (chosen.length > 0) trashRows(chosen)
        else if (mod && activeRow) trashRows([activeRow])
        else if (activeRow && activeDef) clearCell(activeRow, activeDef)
        break
      }
      case 'Escape':
        if (selected.size > 0) {
          setSelected(new Set())
          setSelectionAnchor(null)
          break
        }
        if (!expandedRowId) return
        onExpandedChange(null)
        break
      case 'w':
      case 'W':
        if (mod || event.altKey || !activeRow) return
        if (!editable) {
          onRefuse()
          break
        }
        setWarmth({ row: activeRow, warmth: nextWarmth(activeRow.warmth), actorId })
        break
      case 'n':
      case 'N':
        if (mod || event.altKey) return
        if (!editable) {
          onRefuse()
          break
        }
        moveTo({ row: rowCount, col: 0 })
        startEdit(rowCount, 0, null)
        break
      case '/':
        if (mod || event.altKey) return
        if (!editable) {
          onRefuse()
          break
        }
        useUiStore.getState().requestQuickAdd()
        break
      case ']':
      case '[': {
        if (!activeRow || sheet.stages.length === 0) return
        if (!editable) {
          onRefuse()
          break
        }
        const target =
          event.key === ']'
            ? nextStageIndex(activeRow, sheet)
            : previousStageIndex(activeRow, sheet)
        if (target !== null) {
          moveStage({ row: activeRow, sheet, stageIndex: target, actorId })
        }
        break
      }
      default: {
        if (mod && event.key.toLowerCase() === 'a') {
          setSelected(new Set(tableRows.map((r) => r.original.id)))
          break
        }
        // Typing starts an edit with that character; single-key shortcuts are not typing.
        const typed =
          event.key.length === 1 &&
          event.key !== ' ' &&
          !mod &&
          !event.altKey &&
          !SHORTCUT_KEYS.has(event.key)
        if (!typed || !(activeRow || onAddLine)) return
        startEdit(active.row, onAddLine ? 0 : active.col, event.key)
        break
      }
    }
    event.preventDefault()
  }

  const headerGroup = table.getHeaderGroups()[0]
  const virtualItems = virtualizer.getVirtualItems()
  const ariaRowCount = rowCount + 1 + (expandedIndex >= 0 ? 1 : 0) + (editable ? 1 : 0)

  // The cell being edited, and where it is on screen.
  const editingRow = editing?.rowId ? rowById.get(editing.rowId) : undefined
  const editingIndex = editing?.rowId
    ? tableRows.findIndex((r) => r.original.id === editing.rowId)
    : rowCount
  const editingAnchor = editing
    ? document.getElementById(
        editing.rowId === null ? addLineCellId : cellId(editingIndex, editing.col),
      )
    : null
  const nameDef = defs.find((d) => d.system && d.key === 'name')
  const editingDef = editing ? (editing.rowId === null ? nameDef : defs[editing.col]) : undefined

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={sheet.name}
      aria-rowcount={ariaRowCount}
      aria-colcount={colCount}
      aria-multiselectable={editable || undefined}
      aria-activedescendant={editing ? undefined : activeDescendant}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onPaste={onPaste}
      data-testid="sheet-grid"
      className="group/grid relative h-full overflow-auto overscroll-contain bg-bg outline-none"
      style={{ scrollPaddingTop: HEADER_HEIGHT, scrollPaddingLeft: defs[0]?.width ?? 0 }}
    >
      <div style={{ width: totalWidth, minWidth: '100%' }}>
        {/* Header */}
        <div role="rowgroup" className="sticky top-0 z-20 bg-grid-header">
          <div
            role="row"
            aria-rowindex={1}
            className="grid border-y border-grid-line"
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
                  data-dragging={draggingCol === def?.id || undefined}
                  onMouseDown={() => rowHandlers.onCellMouseDown(-1, colIndex)}
                  draggable={editable && def ? true : undefined}
                  onDragStart={
                    editable && def
                      ? (e) => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', def.label)
                          setDraggingCol(def.id)
                        }
                      : undefined
                  }
                  onDragOver={editable && draggingCol ? (e) => e.preventDefault() : undefined}
                  onDrop={
                    editable && def && draggingCol
                      ? (e) => {
                          e.preventDefault()
                          dropColumn(def.id)
                        }
                      : undefined
                  }
                  onDragEnd={() => setDraggingCol(null)}
                  className={cn(
                    'group/header relative flex items-center border-r border-grid-line bg-grid-header data-[dragging]:opacity-50',
                    // Labels start where the cells' content starts; start-aligned ones may use
                    // the right padding so "Last touch" fits its narrow default column.
                    def && columnAlign(def) === 'end' ? 'justify-end px-2.5' : 'pr-0 pl-2.5',
                    colIndex === 0 && 'sticky left-0 z-10',
                    'group-focus/grid:data-[active]:focus-ring-inset',
                  )}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => header.column.toggleSorting(undefined, false)}
                    className={cn(
                      'inline-flex min-w-0 items-center gap-1 rounded-control py-1',
                      'font-mono text-[10.5px] leading-[1.3] font-semibold tracking-[0.08em] text-muted uppercase hover:text-text',
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
                  {editable && def ? (
                    <>
                      <Menu>
                        <MenuTrigger asChild>
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`${def.label} column options`}
                            className="mr-1 ml-auto grid size-5 shrink-0 place-items-center rounded-chip text-muted opacity-0 hover:bg-surface-hover hover:text-text group-hover/header:opacity-100 data-[state=open]:opacity-100"
                          >
                            <ChevronDown aria-hidden className="size-3" />
                          </button>
                        </MenuTrigger>
                        <MenuContent align="start" className="w-48">
                          <MenuItem
                            disabled={def.system && def.key === 'name'}
                            onSelect={() =>
                              updateColumn.mutate({
                                sheet,
                                column: def,
                                patch: { hidden: true },
                                actorId,
                              })
                            }
                          >
                            <EyeOff aria-hidden />
                            Hide column
                          </MenuItem>
                          {onManageColumns ? (
                            <MenuItem onSelect={onManageColumns}>
                              <Settings2 aria-hidden />
                              Columns
                            </MenuItem>
                          ) : null}
                        </MenuContent>
                      </Menu>
                      {/* Drag the edge to resize. */}
                      <span
                        aria-hidden="true"
                        onPointerDown={(e) => startResize(e, def)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-0 -right-[3px] z-10 h-full w-[6px] cursor-col-resize hover:bg-focus/40"
                        data-testid="column-resize"
                      />
                    </>
                  ) : null}
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
                  isSelected={selected.has(row.id)}
                  isFlashing={flashRowId === row.id}
                  cellId={cellId}
                  ctx={cellCtx}
                  handlers={rowHandlers}
                />
                {isExpanded ? (
                  <div
                    role="row"
                    aria-rowindex={rowIndexAria + 1}
                    className="border-b border-border bg-surface-subtle"
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

        {/* The add line: a new row's Name, in your own tab. */}
        {editable ? (
          <div role="rowgroup">
            <div
              role="row"
              aria-rowindex={ariaRowCount}
              className="grid border-b border-grid-line bg-bg"
              style={{ gridTemplateColumns, height: ROW_HEIGHT }}
              data-testid="add-row"
            >
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the grid owns the keyboard (N, Enter). */}
              <div
                id={addLineCellId}
                role="gridcell"
                aria-colindex={1}
                data-active={active.row === rowCount || undefined}
                onMouseDown={() => setActive({ row: rowCount, col: 0 })}
                onClick={() => startEdit(rowCount, 0, null)}
                className={cn(
                  'sticky left-0 z-10 flex min-w-0 cursor-default items-center gap-1.5 overflow-hidden border-r border-grid-line bg-bg px-2.5 text-sm text-muted hover:text-text',
                  'group-focus/grid:data-[active]:focus-ring-inset',
                )}
              >
                <Plus aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">Add a contact</span>
                <Kbd keys={['N']} className="ml-auto" />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {editing && editingAnchor && editingDef ? (
        <CellEditor
          key={`${editing.rowId ?? 'new'}-${editing.col}`}
          anchor={editingAnchor}
          def={editingDef}
          row={editingRow ?? blankRow(sheet)}
          sheet={sheet}
          initial={editing.initial}
          ctx={textCtx}
          actorId={actorId}
          onDone={finishEdit}
          onCancel={cancelEdit}
        />
      ) : null}
    </div>
  )
}
