import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tooltip } from '@/components/ui/Tooltip'
import { pluralise } from '@/domain/format'
import { summariseSheet } from '@/domain/summary'
import type { Member, Row, Sheet } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { type Figure, sheetFigures } from './figures'
import { type FolderNumber, faceBackground, folderNumber, sheetNumber } from './folder'
import { capsLabel, PipelineCard } from './PipelineCard'

export interface SheetSummaryProps {
  member: Member
  sheet: Sheet
  rows: readonly Row[]
  /** The sheet's position in its member's list: sets its number and folder colour. */
  index: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

const RULE = 'border-[var(--folder-rule)]'

function FoldButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? 'Collapse the sheet summary' : 'Expand the sheet summary'
  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-control bg-[var(--glass)] text-folder-fg',
          'shadow-[inset_0_0_0_1px_var(--glass-border)] transition-[filter] duration-(--duration-fast) ease-out',
          'hover:brightness-105 active:brightness-95',
        )}
      >
        {open ? (
          <ChevronUp aria-hidden className="size-[15px]" />
        ) : (
          <ChevronDown aria-hidden className="size-[15px]" />
        )}
      </button>
    </Tooltip>
  )
}

function Title({ number, name }: { number: string; name: string }) {
  return (
    <h2 className="whitespace-nowrap font-mono text-[11.5px] font-semibold uppercase leading-7 tracking-[0.1em]">
      <span aria-hidden="true">{number} — </span>
      {name}
    </h2>
  )
}

function FigureCell({ figure, index }: { figure: Figure; index: number }) {
  const right = index % 2 === 1
  const lower = index >= 2
  return (
    <div
      data-figure={figure.key}
      className={cn(
        'min-w-0 pr-4',
        right && cn('border-l pl-5', RULE),
        lower ? cn('border-t pt-4', RULE) : 'pb-4',
      )}
    >
      <dt className={cn(capsLabel, 'truncate')}>{figure.label}</dt>
      <dd
        className={cn(
          'mt-3 flex h-10 items-end whitespace-nowrap font-normal leading-none tracking-[-0.035em] tabular-nums',
          figure.value.length > 7 ? 'text-[27px]' : 'text-[40px]',
        )}
      >
        {figure.value}
      </dd>
      <dd className="mt-2 truncate text-[12.5px] leading-[1.35]">{figure.sub}</dd>
    </div>
  )
}

/**
 * The folder front above the grid: the sheet's number and name, who owns it, four figures and
 * the frosted pipeline card. It continues the active tab's colour and fades to the page. Folded,
 * it is one 50px line with the first three figures inline.
 */
export function SheetSummary({
  member,
  sheet,
  rows,
  index,
  open,
  onOpenChange,
}: SheetSummaryProps) {
  const now = useNow()
  const summary = useMemo(() => summariseSheet(sheet, rows, now), [sheet, rows, now])
  const figures = useMemo(() => sheetFigures(sheet, rows, summary), [sheet, rows, summary])
  const folder = folderNumber(index)
  const number = sheetNumber(index)
  const toggle = () => onOpenChange(!open)
  const common = {
    'aria-label': `${sheet.name} summary`,
    'data-testid': 'sheet-summary',
    'data-folder': folder,
    'data-state': open ? 'open' : 'closed',
  } as const

  if (!open) {
    return (
      <section
        {...common}
        className="shrink-0 rounded-tr-card py-[11px] pl-6 pr-5 text-folder-fg"
        style={{ background: faceBackground(folder, false) }}
      >
        <div className="flex flex-wrap items-center gap-x-[22px] gap-y-1">
          <Title number={number} name={sheet.name} />
          {figures.slice(0, 3).map((figure) => (
            <span key={figure.key} data-figure={figure.key} className="whitespace-nowrap text-sm">
              <span className="font-semibold tabular-nums">{figure.value}</span> {figure.inline}
            </span>
          ))}
          <span className="flex-1" />
          <FoldButton open={false} onToggle={toggle} />
        </div>
      </section>
    )
  }

  const stagesText = sheet.stages.length > 0 ? pluralise(sheet.stages.length, 'stage') : 'no stages'
  return (
    <section
      {...common}
      className="shrink-0 rounded-tr-card px-6 pb-6 pt-[18px] text-folder-fg"
      style={{ background: faceBackground(folder, true) }}
    >
      <div className="flex items-center justify-between gap-4">
        <Title number={number} name={sheet.name} />
        <div className="flex min-w-0 items-center gap-3.5">
          <p className="truncate font-mono text-2xs font-medium uppercase tracking-[0.08em]">
            Owned by {member.name} · {stagesText}
          </p>
          <FoldButton open onToggle={toggle} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-stretch gap-x-7 gap-y-[22px]">
        <dl className="grid min-w-0 flex-[1_1_340px] grid-cols-2 content-start">
          {figures.map((figure, i) => (
            <FigureCell key={figure.key} figure={figure} index={i} />
          ))}
        </dl>
        <div
          className="min-w-0 flex-[1.45_1_480px] rounded-card bg-[var(--glass)] px-4 py-3.5 text-text backdrop-blur-[16px] backdrop-saturate-[1.3]"
          style={{ boxShadow: 'var(--glass-shadow), inset 0 0 0 1px var(--glass-border)' }}
        >
          <PipelineCard summary={summary} rows={rows} now={now} />
        </div>
      </div>
    </section>
  )
}

/** Placeholder with the folder front's shape while rows load. */
export function SheetSummarySkeleton({ index, open }: { index: number; open: boolean }) {
  const folder: FolderNumber = folderNumber(index)
  return (
    <div
      aria-hidden="true"
      data-testid="sheet-summary-skeleton"
      className={cn(
        'shrink-0 rounded-tr-card',
        open ? 'px-6 pb-6 pt-[18px]' : 'py-[11px] pl-6 pr-5',
      )}
      style={{ background: faceBackground(folder, open) }}
    >
      <div className="flex h-7 items-center justify-between gap-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="size-7" />
      </div>
      {open ? (
        <div className="mt-5 flex flex-wrap items-stretch gap-x-7 gap-y-[22px]">
          <div className="grid min-w-0 flex-[1_1_340px] grid-cols-2 gap-6">
            {Array.from({ length: 4 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
              <div key={i} className="flex flex-col gap-3">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-2.5 w-32" />
              </div>
            ))}
          </div>
          <Skeleton className="h-44 min-w-0 flex-[1.45_1_480px] rounded-card" />
        </div>
      ) : null}
    </div>
  )
}
