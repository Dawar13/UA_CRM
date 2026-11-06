/**
 * The column manager: every column of a sheet, in order. Rename, show or hide, reorder (drag, or
 * the arrow buttons), delete custom columns to Trash, change a custom column's type with a
 * preview of how values convert, and add a column. System columns can be hidden but not deleted
 * or retyped; Name is always shown.
 */
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import {
  useAddColumn,
  useConvertColumn,
  useDeleteColumn,
  useReorderColumns,
  useRows,
  useTagMap,
  useUpdateColumn,
} from '@/data/hooks'
import { pluralise } from '@/domain/format'
import { convertColumn } from '@/domain/sheetEdits'
import type { ColumnDef, Sheet } from '@/domain/types'
import { cn } from '@/lib/cn'

/** Column types a person can pick, with plain names. */
export const columnTypeOptions: { type: ColumnDef['type']; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'longText', label: 'Long text' },
  { type: 'number', label: 'Number' },
  { type: 'currency', label: 'Amount (₹)' },
  { type: 'date', label: 'Date' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'multiSelect', label: 'Multi-select' },
  { type: 'personLink', label: 'Person' },
  { type: 'url', label: 'Link' },
  { type: 'phone', label: 'Phone' },
  { type: 'email', label: 'Email' },
  { type: 'checkbox', label: 'Checkbox' },
]

const typeLabel = (type: ColumnDef['type']) =>
  columnTypeOptions.find((t) => t.type === type)?.label ?? 'Built in'

const selectClass = 'h-8 rounded-control border border-border bg-surface-raised px-2 text-sm'

function ColumnRow({
  sheet,
  column,
  index,
  count,
  onMove,
  onRetype,
  dragging,
  onDragStart,
  onDrop,
}: {
  sheet: Sheet
  column: ColumnDef
  index: number
  count: number
  onMove: (from: number, to: number) => void
  onRetype: (column: ColumnDef, type: ColumnDef['type']) => void
  dragging: boolean
  onDragStart: () => void
  onDrop: () => void
}) {
  const actor = useActor()
  const update = useUpdateColumn()
  const remove = useDeleteColumn()
  const [label, setLabel] = useState(column.label)
  const isName = column.system && column.key === 'name'
  const actorId = actor?.id ?? ''

  const rename = () => {
    if (label.trim() === '' || label.trim() === column.label) {
      setLabel(column.label)
      return
    }
    update.mutate({ sheet, column, patch: { label }, actorId })
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: dragging is a pointer shortcut; the arrow buttons reorder by keyboard.
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', column.label)
        onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      className={cn(
        'flex items-center gap-1.5 rounded-control border border-border bg-surface-raised px-1.5 py-1',
        dragging && 'opacity-50',
      )}
      data-testid="column-item"
    >
      <GripVertical aria-hidden className="size-4 shrink-0 cursor-grab text-muted" />
      <Input
        aria-label={`Name of ${column.label}`}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            rename()
          }
        }}
        className="h-7 min-w-0 flex-1"
      />
      {column.system ? (
        <span className="w-[112px] shrink-0 px-2 text-xs text-muted">Built in</span>
      ) : (
        <select
          aria-label={`Type of ${column.label}`}
          value={column.type}
          onChange={(e) => onRetype(column, e.target.value as ColumnDef['type'])}
          className={cn(selectClass, 'h-7 w-[112px] shrink-0')}
        >
          {columnTypeOptions.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
          {columnTypeOptions.some((t) => t.type === column.type) ? null : (
            <option value={column.type}>{typeLabel(column.type)}</option>
          )}
        </select>
      )}
      <label className="flex shrink-0 items-center gap-1 px-1 text-xs text-secondary">
        <input
          type="checkbox"
          checked={!column.hidden}
          disabled={isName}
          onChange={(e) =>
            update.mutate({ sheet, column, patch: { hidden: !e.target.checked }, actorId })
          }
          className="accent-[var(--primary)]"
        />
        Shown
      </label>
      <IconButton
        aria-label={`Move ${column.label} up`}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
      >
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton
        aria-label={`Move ${column.label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDown className="size-4" />
      </IconButton>
      {column.system ? (
        <span className="w-8 shrink-0" />
      ) : (
        <IconButton
          aria-label={`Delete ${column.label}`}
          tooltip="Move to Trash"
          onClick={() => remove.mutate({ sheet, column, actorId })}
        >
          <Trash2 className="size-4" />
        </IconButton>
      )}
    </li>
  )
}

function AddColumnForm({ sheet }: { sheet: Sheet }) {
  const actor = useActor()
  const add = useAddColumn()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<ColumnDef['type']>('text')
  const [options, setOptions] = useState('')
  const labelId = useId()
  const typeId = useId()
  const optionsId = useId()
  const choice = type === 'dropdown' || type === 'multiSelect'

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!actor || label.trim() === '') return
    add.mutate(
      {
        sheet,
        column: {
          label,
          type,
          ...(choice
            ? {
                options: options
                  .split(/\n|,/)
                  .map((o) => o.trim())
                  .filter(Boolean),
              }
            : {}),
        },
        actorId: actor.id,
      },
      {
        onSuccess: () => {
          setLabel('')
          setOptions('')
        },
      },
    )
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-card border border-dashed border-border p-3"
      aria-label="Add a column"
    >
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={labelId} className="text-xs font-medium text-secondary">
            New column
          </label>
          <Input
            id={labelId}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Plant size, Board seat…"
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={typeId} className="text-xs font-medium text-secondary">
            Type
          </label>
          <select
            id={typeId}
            value={type}
            onChange={(e) => setType(e.target.value as ColumnDef['type'])}
            className={cn(selectClass, 'w-[132px]')}
          >
            {columnTypeOptions.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="primary" disabled={label.trim() === '' || add.isPending}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>
      {choice ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={optionsId} className="text-xs font-medium text-secondary">
            Options, one per line
          </label>
          <Textarea
            id={optionsId}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            rows={3}
          />
        </div>
      ) : null}
    </form>
  )
}

/** Second step of a type change: how the values convert, and which do not. */
function ConvertPreview({
  sheet,
  column,
  type,
  onBack,
  onDone,
}: {
  sheet: Sheet
  column: ColumnDef
  type: ColumnDef['type']
  onBack: () => void
  onDone: () => void
}) {
  const actor = useActor()
  const { data: rows = [] } = useRows(sheet.id)
  const tagMap = useTagMap()
  const convert = useConvertColumn()
  const preview = useMemo(
    () => convertColumn(sheet, column.id, type, rows, { now: new Date(), tagMap }),
    [sheet, column.id, type, rows, tagMap],
  )
  const failing = preview.values.filter((v) => v.after === undefined)
  return (
    <div className="flex flex-col gap-3" data-testid="convert-preview">
      <p className="text-sm text-secondary">
        {preview.values.length === 0
          ? `${column.label} has no values yet, so nothing changes but the type.`
          : `${pluralise(preview.values.length - failing.length, 'value')} convert to ${typeLabel(type).toLowerCase()}.`}
      </p>
      {failing.length > 0 ? (
        <div className="rounded-control border border-cold-border bg-cold-bg px-3 py-2">
          <p className="text-sm font-medium text-cold">
            {pluralise(failing.length, 'value')} will not convert and will be cleared:
          </p>
          <ul className="mt-1 max-h-32 overflow-y-auto text-sm text-cold">
            {failing.map((v) => (
              <li key={v.rowId}>
                {v.rowName}: “{v.before}”
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <DialogFooter>
        <Button onClick={onBack}>Back</Button>
        <Button
          variant="primary"
          disabled={!actor || convert.isPending}
          onClick={() =>
            actor &&
            convert.mutate({ sheet, column, type, actorId: actor.id }, { onSuccess: onDone })
          }
        >
          Change to {typeLabel(type).toLowerCase()}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function ColumnsDialog({
  sheet,
  open,
  onOpenChange,
}: {
  sheet: Sheet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actor = useActor()
  const reorder = useReorderColumns()
  const [dragging, setDragging] = useState<string | null>(null)
  const [retype, setRetype] = useState<{ column: ColumnDef; type: ColumnDef['type'] } | null>(null)
  const columns = useMemo(
    () => sheet.columns.filter((c) => !c.deletedAt).sort((a, b) => a.position - b.position),
    [sheet],
  )

  const moveTo = (from: number, to: number) => {
    if (!actor || to < 0 || to >= columns.length || from === to) return
    const ids = columns.map((c) => c.id)
    const [id] = ids.splice(from, 1)
    if (id) ids.splice(to, 0, id)
    reorder.mutate({ sheet, ids, actorId: actor.id })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setRetype(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        title={
          retype
            ? `Change ${retype.column.label} to ${typeLabel(retype.type).toLowerCase()}`
            : `Columns of ${sheet.name}`
        }
        description={
          retype
            ? 'Each value is read again as the new type.'
            : 'Drag or use the arrows to reorder. Built-in columns can be hidden but not deleted.'
        }
        className="max-w-[640px]"
      >
        {retype ? (
          <ConvertPreview
            sheet={sheet}
            column={retype.column}
            type={retype.type}
            onBack={() => setRetype(null)}
            onDone={() => setRetype(null)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <ol
              aria-label="Columns"
              className="flex max-h-[52vh] flex-col gap-1 overflow-y-auto pr-1"
            >
              {columns.map((column, index) => (
                <ColumnRow
                  key={column.id}
                  sheet={sheet}
                  column={column}
                  index={index}
                  count={columns.length}
                  onMove={moveTo}
                  onRetype={(c, type) => setRetype({ column: c, type })}
                  dragging={dragging === column.id}
                  onDragStart={() => setDragging(column.id)}
                  onDrop={() => {
                    const from = columns.findIndex((c) => c.id === dragging)
                    setDragging(null)
                    if (from >= 0) moveTo(from, index)
                  }}
                />
              ))}
            </ol>
            <AddColumnForm sheet={sheet} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
