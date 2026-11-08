import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { exactDate, formatFuzzyDate, istDateOf } from '@/domain/dates'
import { formatNumber, pluralise } from '@/domain/format'
import { conversion, recencyOf, type SheetSummary, type SummaryPerson } from '@/domain/summary'
import type { ColumnDef, Row, Warmth } from '@/domain/types'
import { cn } from '@/lib/cn'
import {
  lastReachedIndex,
  type PixelCell,
  type PixelPipeline,
  type PixelStage,
  pixelPipeline,
  warmthShade,
} from './folder'

/** Mono caps labels on the folder front and the pipeline card. */
export const capsLabel = 'font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]'

/** More people than this in one column show as "+N" after the squares. */
const MAX_SQUARES = 18

const WARMTH_GROUPS: readonly { warmth: Warmth | null; label: string }[] = [
  { warmth: 'warm', label: 'Warm' },
  { warmth: 'waiting', label: 'Waiting' },
  { warmth: 'cold', label: 'Cold' },
  { warmth: null, label: 'Not set' },
]

const SAND = 'bg-sand-cell shadow-[inset_0_0_0_1px_var(--sand-line)]'

function Swatch({ warmth }: { warmth: Warmth | null }) {
  return (
    <span
      className={cn(
        'inline-block size-2 shrink-0 rounded-[2px]',
        warmth === 'warm' && 'bg-warm-cell',
        warmth === 'waiting' && 'bg-waiting-cell',
        warmth === 'cold' && 'bg-cold-cell',
        warmth === null && SAND,
      )}
    />
  )
}

function Legend() {
  return (
    <span aria-hidden="true" className="flex flex-wrap items-center gap-3 text-2xs text-secondary">
      {WARMTH_GROUPS.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-[5px]">
          <Swatch warmth={item.warmth} />
          {item.label}
        </span>
      ))}
    </span>
  )
}

type TitleOf = (person: SummaryPerson) => string

/** A person as a 13px square: their warmth, deeper when touched more recently; sand when unset. */
function PersonSquare({ person, title }: { person: SummaryPerson; title: string }) {
  return (
    <span
      title={title}
      data-person={person.id}
      className={cn('inline-block size-[13px] shrink-0 rounded-[2px]', !person.warmth && SAND)}
      style={
        person.warmth ? { backgroundColor: warmthShade(person.warmth, person.recency) } : undefined
      }
    />
  )
}

function Squares({ people, titleOf }: { people: readonly SummaryPerson[]; titleOf: TitleOf }) {
  const shown = people.slice(0, MAX_SQUARES)
  const more = people.length - shown.length
  return (
    <div className="flex min-h-[13px] flex-wrap content-start items-center gap-0.5">
      {shown.map((person) => (
        <PersonSquare key={person.id} person={person} title={titleOf(person)} />
      ))}
      {more > 0 ? (
        <span className="pl-0.5 font-mono text-[10px] leading-[13px] text-secondary">
          +{formatNumber(more)}
        </span>
      ) : null}
    </div>
  )
}

function columns(count: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }
}

/** A square is 9px with 2px between, so seven rows stand 75px tall. */
const CELL = 9
const GAP = 2

function stackStyle(cols: number, rows: number): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
    gridTemplateRows: `repeat(${rows}, ${CELL}px)`,
    gap: `${GAP}px`,
  }
}

const CELL_BASE = 'block rounded-[2.5px] origin-bottom motion-safe:animate-pop-in'

/** One square: a person here (warmth, deeper when recent), lost here, went on (blue), or empty. */
function Cell({
  cell,
  step,
  delay,
  titleOf,
  unit,
}: {
  cell: PixelCell | undefined
  step: number
  delay: number
  titleOf: TitleOf
  unit: number
}) {
  const motion: CSSProperties = { animationDelay: `${delay}ms`, animationFillMode: 'both' }
  if (!cell) return <span className={cn(CELL_BASE, 'bg-stage-track')} style={motion} />
  if (cell.kind === 'went-on') {
    return (
      <span
        data-cell="went-on"
        className={CELL_BASE}
        style={{ ...motion, backgroundColor: `var(--capsule${step})` }}
      />
    )
  }
  if (cell.kind === 'stopped') {
    return (
      <span
        data-cell="stopped"
        title={unit > 1 ? `About ${formatNumber(unit)} lost at this stage` : 'Lost at this stage'}
        className={CELL_BASE}
        style={{
          ...motion,
          backgroundColor: 'color-mix(in srgb, var(--lost-dot) 55%, transparent)',
        }}
      />
    )
  }
  return (
    <span
      data-cell="here"
      data-person={cell.person?.id}
      title={cell.person ? titleOf(cell.person) : `About ${formatNumber(unit)} people here now`}
      className={cn(CELL_BASE, !cell.warmth && SAND)}
      style={
        cell.warmth
          ? { ...motion, backgroundColor: warmthShade(cell.warmth, cell.recency) }
          : motion
      }
    />
  )
}

/** A stage's stack, drawn top-down so the squares fill from the bottom row up. Past the bar's own
 * width the row continues as empty cells, so the stages read as one dot matrix. */
function Stack({
  stage,
  grid,
  slotsPerRow,
  titleOf,
}: {
  stage: PixelStage
  grid: PixelPipeline
  slotsPerRow: number
  titleOf: TitleOf
}) {
  const { columns: cols, rows } = grid
  const slots: ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - 1 - r
    for (let c = 0; c < slotsPerRow; c++) {
      slots.push(
        <Cell
          key={`${r}-${c}`}
          cell={c < cols ? stage.cells[fromBottom * cols + c] : undefined}
          step={stage.step}
          delay={stage.index * 45 + fromBottom * 22 + c * 6}
          titleOf={titleOf}
          unit={grid.unit}
        />,
      )
    }
  }
  return (
    <div
      data-stage-people={stage.index}
      style={stackStyle(slotsPerRow, rows)}
      className="transition-opacity duration-(--duration-fast) ease-out group-hover/pixels:opacity-45 hover:opacity-100!"
    >
      {slots}
    </div>
  )
}

function LostStack({
  people,
  grid,
  titleOf,
}: {
  people: readonly SummaryPerson[]
  grid: PixelPipeline
  titleOf: TitleOf
}) {
  const { columns: cols, rows, unit } = grid
  // Like the stages: one dot per person, or per `unit` people on a big sheet.
  const dots =
    unit === 1
      ? people.slice(0, cols * rows).map((person) => titleOf(person))
      : Array.from(
          {
            length: Math.min(
              cols * rows,
              people.length > 0 ? Math.max(1, Math.round(people.length / unit)) : 0,
            ),
          },
          () => `About ${formatNumber(unit)} people lost`,
        )
  const slots: ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - 1 - r
    for (let c = 0; c < cols; c++) {
      const title = dots[fromBottom * cols + c]
      slots.push(
        title ? (
          <span key={`${r}-${c}`} title={title} className="block rounded-full bg-lost-dot" />
        ) : (
          <span key={`${r}-${c}`} className="block rounded-full bg-stage-track" />
        ),
      )
    }
  }
  return (
    <div data-testid="lost-people" style={stackStyle(cols, rows)}>
      {slots}
    </div>
  )
}

/** How many cells fit across one stage's column, measured so the matrix fills the card. */
function useSlotsPerRow(count: number, minimum: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState(minimum)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || count === 0) return
    const measure = () => {
      const fit = Math.floor((el.clientWidth / count - 6 + GAP) / (CELL + GAP))
      const next = Math.max(minimum, fit)
      setSlots((prev) => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [count, minimum])
  return { ref, slots }
}

function StagePipeline({ summary, titleOf }: { summary: SheetSummary; titleOf: TitleOf }) {
  const { stages, lostPeople } = summary
  const count = stages.length
  const grid = useMemo(() => pixelPipeline(stages), [stages])
  const last = lastReachedIndex(stages.map((s) => s.reached))
  const { ref, slots } = useSlotsPerRow(count, grid.columns)

  return (
    <>
      <div aria-hidden="true" className="flex items-stretch gap-3.5">
        <div className="min-w-0 flex-auto">
          <div className="grid" style={columns(count)}>
            {stages.map((stage) => (
              <div key={stage.id} className="min-w-0 pr-1.5">
                <div
                  className={cn(
                    'truncate text-[10.5px]',
                    stage.isWin ? 'text-won-fg' : 'text-secondary',
                  )}
                >
                  {stage.name}
                </div>
                <div className="mt-0.5 font-mono text-[17px] font-medium tracking-[-0.02em] tabular-nums">
                  {formatNumber(stage.reached)}
                </div>
              </div>
            ))}
          </div>
          <div
            ref={ref}
            className="group/pixels mt-2 grid items-end"
            style={columns(count)}
            data-testid="pipeline-pixels"
          >
            {grid.stages.map((stage) => (
              <div key={stage.index} className="min-w-0 overflow-hidden">
                <Stack stage={stage} grid={grid} slotsPerRow={slots} titleOf={titleOf} />
              </div>
            ))}
          </div>
          <div className="relative mt-1.5 h-[18px]">
            <span className="absolute inset-x-0 top-0 h-px bg-sand-line" />
            {stages.slice(0, Math.max(0, last)).map((stage, i) => {
              const pct = conversion(stages, i)
              if (pct === null) return null
              return (
                <span
                  key={stage.id}
                  data-testid="conversion-pill"
                  className="absolute top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-chip bg-bg px-[5px] py-px font-mono text-[10px] font-medium text-secondary shadow-[0_0_0_1px_var(--border)]"
                  style={{ left: `calc(${((i + 1) / count) * 100}% - 8px)` }}
                >
                  {pct}%
                </span>
              )
            })}
          </div>
        </div>
        <div className="flex flex-none flex-col border-l border-border pl-3">
          <div className="text-[10.5px] text-lost">Lost</div>
          <div className="mt-0.5 font-mono text-[17px] font-medium tracking-[-0.02em] tabular-nums">
            {formatNumber(lostPeople.length)}
          </div>
          <div className="mt-2">
            <LostStack people={lostPeople} grid={grid} titleOf={titleOf} />
          </div>
        </div>
      </div>
      <ul className="sr-only" aria-label="Pipeline by stage">
        {stages.map((stage) => (
          <li key={stage.id}>
            {`${stage.name}: ${formatNumber(stage.reached)} reached, ${formatNumber(stage.here.length)} at this stage now`}
          </li>
        ))}
        <li>{`Lost: ${formatNumber(lostPeople.length)}`}</li>
      </ul>
      <p className="mt-1 text-[10.5px] text-secondary">
        {grid.unit > 1
          ? `Each square is ${formatNumber(grid.unit)} people. `
          : 'Each square is a person who reached the stage. '}
        Who is there now in their warmth (deeper is more recent); blue went further; charcoal was
        lost there.
      </p>
    </>
  )
}

interface Group {
  label: string
  people: readonly SummaryPerson[]
}

function GroupedPeople({ groups, titleOf }: { groups: readonly Group[]; titleOf: TitleOf }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="grid gap-x-3 gap-y-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))' }}
      >
        {groups.map((group) => (
          <div key={group.label} className="flex min-w-0 flex-col gap-1.5" data-group={group.label}>
            <span className="truncate text-2xs text-secondary">{group.label}</span>
            <span className="font-mono text-[20px] font-medium leading-none tracking-[-0.02em] tabular-nums">
              {formatNumber(group.people.length)}
            </span>
            <Squares people={group.people} titleOf={titleOf} />
          </div>
        ))}
      </div>
      <ul className="sr-only" aria-label="People by group">
        {groups.map((group) => (
          <li key={group.label}>
            {`${group.label}: ${pluralise(group.people.length, 'person', 'people')}`}
          </li>
        ))}
      </ul>
    </>
  )
}

function warmthGroups(rows: readonly Row[], now: Date): Group[] {
  const people: SummaryPerson[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    warmth: row.warmth,
    recency: recencyOf(row.lastTouchAt, now),
  }))
  return WARMTH_GROUPS.map((item) => ({
    label: item.label,
    people: people.filter((p) => p.warmth === item.warmth),
  })).filter((group) => group.label !== 'Not set' || group.people.length > 0)
}

function groupHeading(column: ColumnDef | null): string {
  return column ? `By ${column.label.toLowerCase()}` : 'By warmth'
}

/**
 * The frosted card on the folder front. Sheets with stages show the pixel pipeline (D-053): a
 * stack of squares per stage, the people there now at the bottom; sheets without stages show people grouped by their first dropdown
 * column (or by warmth when there is none).
 */
export function PipelineCard({
  summary,
  rows,
  now,
}: {
  summary: SheetSummary
  rows: readonly Row[]
  now: Date
}) {
  const lastTouch = useMemo(() => new Map(rows.map((row) => [row.id, row.lastTouchAt])), [rows])
  const titleOf: TitleOf = (person) => {
    const at = lastTouch.get(person.id)
    const when = at
      ? `last touch ${formatFuzzyDate(exactDate(istDateOf(at)), now)}`
      : 'no touch yet'
    return `${person.name} · ${when}`
  }
  const hasStages = summary.stages.length > 0
  const groups: Group[] = hasStages ? [] : (summary.groups?.groups ?? warmthGroups(rows, now))

  return (
    <div data-testid="pipeline-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className={cn(capsLabel, 'text-text')}>
          {hasStages ? 'Pipeline' : groupHeading(summary.groups?.column ?? null)}
        </h3>
        <Legend />
      </div>
      {hasStages ? (
        <StagePipeline summary={summary} titleOf={titleOf} />
      ) : (
        <GroupedPeople groups={groups} titleOf={titleOf} />
      )}
    </div>
  )
}
