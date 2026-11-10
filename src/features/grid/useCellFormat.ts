/**
 * Cell formatting, shared by the format bar on the quick-add line and the grid's right-click
 * menu: a fill colour per cell, text wrapping per column and a height per row. Your own tab
 * only; the callers show these controls only where `editable` is true.
 */
import { useActor } from '@/auth/AuthContext'
import { useUpdateColumn, useUpdateRow } from '@/data/hooks'
import type { ColumnDef, Row, Sheet } from '@/domain/types'
import type { TagColour } from '@/styles/tokens'
import { colourName } from './cellFormat'

/** The heights the format bar offers. Dragging a row's edge still sets any height. */
export const ROW_HEIGHT_CHOICES = [
  { label: 'Normal', height: null },
  { label: 'Tall', height: 56 },
  { label: 'Taller', height: 96 },
] as const

export function useCellFormat(sheet: Sheet) {
  const actorId = useActor()?.id ?? sheet.memberId
  const updateRow = useUpdateRow()
  const updateColumn = useUpdateColumn()

  const fill = (rows: readonly Row[], key: string, colour: TagColour | null) => {
    for (const row of rows) {
      const next = { ...(row.cellColours ?? {}) }
      if (colour) next[key] = colour
      else delete next[key]
      updateRow.mutate({
        row,
        sheet,
        patch: { cellColours: next },
        actorId,
        label: colour ? `Fill ${colourName(colour)}` : 'No fill',
      })
    }
  }

  const toggleWrap = (def: ColumnDef) =>
    updateColumn.mutate({ sheet, column: def, patch: { wrap: !def.wrap }, actorId })

  const setHeight = (rows: readonly Row[], height: number | null) => {
    for (const row of rows) {
      if ((row.height ?? null) === height) continue
      updateRow.mutate({ row, sheet, patch: { height }, actorId, label: 'Row height' })
    }
  }

  return { fill, toggleWrap, setHeight }
}
