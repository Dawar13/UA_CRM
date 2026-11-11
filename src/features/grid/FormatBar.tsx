/**
 * The format bar at the right end of the quick-add line (your own tab only): fill colour, wrap
 * text and row height for the active cell, or for that column in every selected row. The same
 * actions stay on the grid's right-click menu.
 */
import { ChevronDown, MoveVertical, WrapText } from 'lucide-react'
import { type FormatTarget, useUiStore } from '@/app/uiStore'
import { Button } from '@/components/ui/Button'
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSwatch,
  MenuTrigger,
} from '@/components/ui/Menu'
import { useRows } from '@/data/hooks'
import type { Row, Sheet } from '@/domain/types'
import { cn } from '@/lib/cn'
import type { TagColour } from '@/styles/tokens'
import { cellFill, cellFillColours, colourName } from './cellFormat'
import { ROW_HEIGHT_CHOICES, useCellFormat } from './useCellFormat'

/** Back to the grid after a format action, as in a spreadsheet. */
function focusGrid() {
  document.querySelector<HTMLElement>('[data-testid="sheet-grid"]')?.focus({ preventScroll: true })
}

function NoFillSquare() {
  return (
    <span className="relative size-4 overflow-hidden rounded-[4px] border border-border-strong bg-bg">
      <span className="absolute top-1/2 left-[-2px] h-px w-[22px] -rotate-45 bg-border-strong" />
    </span>
  )
}

function FillSquare({ colour }: { colour: TagColour }) {
  return (
    <span
      className="size-4 rounded-[4px]"
      style={{
        background: cellFill(colour),
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--tag-${colour}) 60%, transparent)`,
      }}
    />
  )
}

/** The value every target shares, or undefined when they differ. */
function shared<T>(rows: readonly Row[], read: (row: Row) => T): T | undefined {
  const first = rows[0]
  if (!first) return undefined
  const value = read(first)
  return rows.every((r) => read(r) === value) ? value : undefined
}

export function FormatBar({ sheet }: { sheet: Sheet }) {
  const target = useUiStore((s) => s.formatTarget)
  const { data: rows } = useRows(sheet.id)
  const format = useCellFormat(sheet)
  return (
    <FormatControls
      sheet={sheet}
      target={target?.sheetId === sheet.id ? target : null}
      rows={rows ?? []}
      format={format}
    />
  )
}

function FormatControls({
  sheet,
  target,
  rows,
  format,
}: {
  sheet: Sheet
  target: FormatTarget | null
  rows: readonly Row[]
  format: ReturnType<typeof useCellFormat>
}) {
  const def = target ? sheet.columns.find((c) => c.key === target.columnKey) : undefined
  const ids = new Set(target?.rowIds ?? [])
  const targets = rows.filter((r) => ids.has(r.id))
  if (!def || targets.length === 0) return null

  const fill = shared(targets, (r) => r.cellColours?.[def.key] ?? null)
  const height = shared(targets, (r) => r.height ?? null)
  const many = targets.length > 1
  const where = many ? `${def.label} in ${targets.length} rows` : def.label

  return (
    <div className="flex shrink-0 items-center gap-0.5" data-testid="format-bar">
      <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-border" />
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Fill colour for ${where}`}>
            {fill ? <FillSquare colour={fill} /> : <NoFillSquare />}
            <span className="max-md:hidden">Fill</span>
            <ChevronDown aria-hidden className="text-muted max-md:hidden" />
          </Button>
        </MenuTrigger>
        <MenuContent
          align="end"
          className="w-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            focusGrid()
          }}
        >
          <MenuLabel>{many ? `Fill ${targets.length} cells` : `Fill ${def.label}`}</MenuLabel>
          <div className="grid grid-cols-9 gap-0.5 px-1 pb-1">
            <MenuSwatch
              aria-label="No fill"
              data-current={fill === null || undefined}
              onSelect={() => format.fill(targets, def.key, null)}
              className="data-[current]:ring-2 data-[current]:ring-border-strong"
            >
              <NoFillSquare />
            </MenuSwatch>
            {cellFillColours.map((colour) => (
              <MenuSwatch
                key={colour}
                aria-label={`Fill ${colourName(colour)}`}
                data-current={fill === colour || undefined}
                onSelect={() => format.fill(targets, def.key, colour)}
                className="data-[current]:ring-2 data-[current]:ring-border-strong"
              >
                <FillSquare colour={colour} />
              </MenuSwatch>
            ))}
          </div>
        </MenuContent>
      </Menu>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Wrap text in ${def.label}`}
        aria-pressed={Boolean(def.wrap)}
        onClick={() => {
          format.toggleWrap(def)
          focusGrid()
        }}
        className={cn(def.wrap && 'bg-surface-hover text-text')}
      >
        <WrapText aria-hidden />
        <span className="max-md:hidden">Wrap</span>
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={many ? `Row height for ${targets.length} rows` : 'Row height'}
          >
            <MoveVertical aria-hidden />
            <span className="max-md:hidden">Height</span>
            <ChevronDown aria-hidden className="text-muted max-md:hidden" />
          </Button>
        </MenuTrigger>
        <MenuContent
          align="end"
          className="w-44"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            focusGrid()
          }}
        >
          <MenuLabel>{many ? `${targets.length} rows` : 'Row height'}</MenuLabel>
          <MenuRadioGroup
            value={String(height === undefined ? 'mixed' : height)}
            onValueChange={(value) =>
              format.setHeight(targets, value === 'null' ? null : Number(value))
            }
          >
            {ROW_HEIGHT_CHOICES.map((choice) => (
              <MenuRadioItem key={choice.label} value={String(choice.height)}>
                {choice.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          <MenuSeparator />
          <p className="px-2 py-1 text-xs text-muted">Or drag the edge under a name.</p>
        </MenuContent>
      </Menu>
    </div>
  )
}
