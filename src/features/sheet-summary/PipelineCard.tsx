import { type CSSProperties, useMemo } from 'react'
import { exactDate, formatFuzzyDate, istDateOf } from '@/domain/dates'
import { formatNumber, pluralise } from '@/domain/format'
import { conversion, recencyOf, type SheetSummary, type SummaryPerson } from '@/domain/summary'
import type { ColumnDef, Row, Warmth } from '@/domain/types'
import { cn } from '@/lib/cn'
import { lastReachedIndex, warmthShade } from './folder'
import { PipelineCapsule } from './PipelineCapsule'

/** Mono caps labels on the folder front and the pipeline card. */
export const capsLabel = 'font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]'

/** More people than this in one column show as "+N" after the squares. */
const MAX_SQUARES = 18
const MAX_LOST_DOTS = 6

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

function StagePipeline({ summary, titleOf }: { summary: SheetSummary; titleOf: TitleOf }) {
  const { stages, lostPeople } = summary
  const count = stages.length
  const reached = useMemo(() => stages.map((s) => s.reached), [stages])
  const last = lastReachedIndex(reached)
  const lostShown = lostPeople.slice(0, MAX_LOST_DOTS)
  const lostMore = lostPeople.length - lostShown.length

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
          <div className="relative mb-2 mt-1.5">
            <PipelineCapsule reached={reached} />
            {stages.slice(0, Math.max(0, last)).map((stage, i) => {
              const pct = conversion(stages, i)
              if (pct === null) return null
              return (
                <span
                  key={stage.id}
                  data-testid="conversion-pill"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-chip bg-bg px-[5px] py-px font-mono text-[10px] font-medium text-secondary shadow-[0_0_0_1px_var(--border)]"
                  style={{ left: `${((i + 1) / count) * 100}%` }}
                >
                  {pct}%
                </span>
              )
            })}
          </div>
          <div className="grid" style={columns(count)}>
            {stages.map((stage) => (
              <div key={stage.id} className="min-w-0 pr-1.5" data-stage-people={stage.index}>
                <Squares people={stage.here} titleOf={titleOf} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex w-[54px] flex-none flex-col border-l border-border pl-3">
          <div className="text-[10.5px] text-lost">Lost</div>
          <div className="mt-0.5 font-mono text-[17px] font-medium tracking-[-0.02em] tabular-nums">
            {formatNumber(lostPeople.length)}
          </div>
          <div className="flex-1" />
          <div className="flex flex-wrap items-center gap-0.5" data-testid="lost-people">
            {lostShown.map((person) => (
              <span
                key={person.id}
                title={titleOf(person)}
                className="inline-block size-[13px] rounded-full bg-lost-dot"
              />
            ))}
            {lostMore > 0 ? (
              <span className="font-mono text-[10px] text-secondary">
                +{formatNumber(lostMore)}
              </span>
            ) : null}
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
      <p className="mt-2.5 text-[10.5px] text-secondary">
        The band is everyone who reached a stage. Squares are who is there now; deeper means touched
        more recently.
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
 * The frosted card on the folder front. Sheets with stages show the pipeline capsule with the
 * people at each stage; sheets without stages show people grouped by their first dropdown
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
