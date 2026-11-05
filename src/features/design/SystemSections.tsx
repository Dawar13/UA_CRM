import { Search } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTheme } from '@/app/theme'
import { StageDots, stageSummary } from '@/components/crm/StageDots'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Kbd'
import type { Activity } from '@/domain/activity'
import { addDaysIso, weekdayOf } from '@/domain/dates'
import { stageRampStep } from '@/domain/stages'
import {
  ActivityFieldView,
  HELD_SHADES,
  MISSED_SHADES,
} from '@/features/calendar-panel/ActivityField'
import { WeekStrip, weekRangeLabel } from '@/features/calendar-panel/CalendarPanel'
import { cn } from '@/lib/cn'
import { type ThemeColours, themes } from '@/styles/tokens'
import { folderEar } from './ColoursSection'
import { Mono, Section, Specimen, StateLabel } from './layout'
import { buildStages, customerStages } from './sampleStages'

/** "Now" in the examples: Thu 5 Nov 2026, 10:00 IST, the frozen reference of the tests. */
const SAMPLE_NOW = new Date('2026-11-05T10:00:00+05:30')
const SAMPLE_TODAY = '2026-11-05'

/* Stage progress -------------------------------------------------------------------------- */

function stageHex(t: ThemeColours, step: number): string {
  const ramp = [t.stage1, t.stage2, t.stage3, t.stage4, t.stage5, t.stage6]
  return ramp[step - 1] ?? ''
}

const stateSwatches: { label: string; cssVar: keyof ThemeColours; style: CSSProperties }[] = [
  { label: 'Not reached', cssVar: 'stageTrack', style: { background: 'var(--stage-track)' } },
  {
    label: 'Skipped',
    cssVar: 'stage3',
    style: {
      background:
        'repeating-linear-gradient(135deg, var(--stage3) 0 2px, var(--stage-track) 2px 4px)',
    },
  },
  {
    label: 'Reached, then lost',
    cssVar: 'stageLostDone',
    style: { background: 'var(--stage-lost-done)' },
  },
  { label: 'Lost', cssVar: 'stageLost', style: { background: 'var(--stage-lost)' } },
  { label: 'Won', cssVar: 'stageWon', style: { background: 'var(--stage-won)' } },
]

const progressRows = [
  { name: 'Rohan Mehta', stages: buildStages(customerStages, { current: 2 }) },
  {
    name: 'Lakshmi Iyer',
    stages: buildStages(customerStages, {
      current: 3,
      dates: [null, null, null, '2026-10-23'],
    }),
  },
  { name: 'Karthik Subramanian', stages: buildStages(customerStages, { current: 4 }) },
  { name: 'Anil Reddy', stages: buildStages(customerStages, { current: 5 }) },
  { name: 'Vikram Joshi', stages: buildStages(customerStages, { current: 6, won: true }) },
  { name: 'Priya Nair', stages: buildStages(customerStages, { current: 2, lost: true }) },
]

export function StagesSection() {
  const { resolved } = useTheme()
  const t = themes[resolved]
  return (
    <Section
      id="stages"
      title="Stage progress"
      caption="Open stages step from light (early) to deep (far along) on the blue palette; the win is olive and a loss is brick. Text on each step uses its own ink."
    >
      <Specimen title="Ramp" caption="Customers: six open stages and the win">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-7 gap-0.5">
            {customerStages.map((name, i) => {
              const won = i === customerStages.length - 1
              const step = stageRampStep(i, customerStages.length)
              return (
                <div
                  key={name}
                  className={cn(
                    'flex h-16 min-w-0 flex-col justify-between px-[11px] py-2.5',
                    i === 0 && 'rounded-l-[8px]',
                    won && 'rounded-r-[8px]',
                  )}
                  style={{
                    background: won ? 'var(--stage-won)' : `var(--stage${step})`,
                    color: won ? 'var(--stage-won-fg)' : `var(--stage-fg${step})`,
                  }}
                >
                  <span className="truncate text-xs font-semibold">{name}</span>
                  <span className="font-mono text-[10.5px]">
                    {won ? t.stageWon : stageHex(t, step)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between font-mono text-[10.5px] text-muted">
            <span>Light: early</span>
            <span>Deep: far along</span>
            <span>Olive: won</span>
          </div>
        </div>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Specimen title="In the grid" caption="The real bars, on sample rows" bodyClassName="p-0">
          <div className="divide-y divide-border">
            {progressRows.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-4 px-5 py-2.5"
              >
                <span className="truncate text-[13.5px] font-[550] text-text">{row.name}</span>
                <StageDots stages={row.stages} />
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen title="States" caption="Shape and words carry the state, not colour alone">
          <ul className="flex flex-col gap-3">
            {stateSwatches.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-10 shrink-0 rounded-[3px]"
                  style={s.style}
                />
                <span className="flex-1 text-sm text-text">{s.label}</span>
                <Mono className="text-muted">{t[s.cssVar]}</Mono>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Each bar is one image named in words, such as “
            {stageSummary(progressRows[1]?.stages ?? [])}”.
          </p>
        </Specimen>
      </div>
    </Section>
  )
}

/* Field palette --------------------------------------------------------------------------- */

const fieldGradient = [
  'linear-gradient(90deg,',
  'var(--field-down4) 0%, var(--field-down3) 13%, var(--field-down2) 26%, var(--field-down1) 38%,',
  'var(--field-zero) 50%,',
  'var(--field-up1) 60%, var(--field-up3) 73%, var(--field-up5) 87%,',
  'var(--field-moved) 100%)',
].join(' ')

/** One square per person in the pipeline card; deeper means touched more recently. */
const peopleSequence = 'WwwaWcwWaAcwnwAwwCaawWcwnaWw'.split('')
const personCell: Record<string, string | null> = {
  W: 'var(--warm-shade3)',
  w: 'var(--warm-shade2)',
  A: 'var(--waiting-shade3)',
  a: 'var(--waiting-shade2)',
  C: 'var(--cold-shade3)',
  c: 'var(--cold-shade2)',
  n: null,
}

function SandCell({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'rounded-[2px] bg-sand-cell shadow-[inset_0_0_0_1px_var(--sand-line)]',
        className,
      )}
    />
  )
}

const warmthShades = [
  { label: 'Warm', key: 'warm' },
  { label: 'Waiting', key: 'waiting' },
  { label: 'Cold', key: 'cold' },
] as const

function fieldDots(t: ThemeColours) {
  return [
    {
      label: 'Held, 1 to 5',
      vars: ['--field-up1', '--field-up2', '--field-up3', '--field-up4', '--field-up5'],
      hex: `${t.fieldUp1} → ${t.fieldUp5}`,
    },
    {
      label: 'Missed, 1 to 4',
      vars: ['--field-down1', '--field-down2', '--field-down3', '--field-down4'],
      hex: `${t.fieldDown1} → ${t.fieldDown4}`,
    },
    { label: 'Stage moved', vars: ['--field-moved'], hex: t.fieldMoved },
  ]
}

export function FieldSection() {
  const { resolved } = useTheme()
  const t = themes[resolved]
  return (
    <Section
      id="field"
      title="Field palette"
      caption="Olive and sage for warmth and touches held, ochre to brick for cold and missed, sand at zero, and blue as the rare accent for a stage that moved."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Scale">
          <div className="flex flex-col gap-4">
            <div
              aria-hidden="true"
              className="h-3.5 rounded-full"
              style={{ background: fieldGradient }}
            />
            <div className="flex justify-between gap-2 font-mono text-[10.5px] text-muted">
              <span>Brick · cold, missed</span>
              <span>Sand · zero</span>
              <span>Olive · warm, held</span>
              <span>Blue · moved</span>
            </div>
            <ul className="mt-2 flex flex-col gap-2.5">
              {fieldDots(t).map((row) => (
                <li key={row.label} className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex w-24 shrink-0 gap-[3px]">
                    {row.vars.map((v) => (
                      <span
                        key={v}
                        className="size-2.5 rounded-full"
                        style={{ background: `var(${v})` }}
                      />
                    ))}
                  </span>
                  <span className="flex-1 text-sm text-text">{row.label}</span>
                  <Mono className="text-muted">{row.hex}</Mono>
                </li>
              ))}
              <li className="flex items-center gap-3">
                <span aria-hidden="true" className="flex w-24 shrink-0 items-center">
                  <span className="h-[3px] w-full bg-field-zero" />
                </span>
                <span className="flex-1 text-sm text-text">Zero line</span>
                <Mono className="text-muted">{t.fieldZero}</Mono>
              </li>
            </ul>
          </div>
        </Specimen>
        <Specimen title="Warmth" caption="Chips in the grid, squares in the pipeline card">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <WarmthChip value="warm" size="md" />
              <WarmthChip value="waiting" size="md" />
              <WarmthChip value="cold" size="md" />
            </div>
            <div className="flex items-end gap-4">
              <div aria-hidden="true" className="grid grid-cols-[repeat(14,12px)] gap-0.5">
                {peopleSequence.map((k, i) => {
                  const colour = personCell[k] ?? null
                  return colour ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sample sequence.
                    <span key={i} className="size-3 rounded-[2px]" style={{ background: colour }} />
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed sample sequence.
                    <SandCell key={i} className="size-3" />
                  )
                })}
              </div>
              <span className="font-mono text-[10.5px] leading-[1.5] text-muted">
                One square per person
                <br />
                deeper = touched recently
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {warmthShades.map(({ label, key }) => (
                <li key={key} className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex gap-0.5">
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className="size-3 rounded-[2px]"
                        style={{ background: `var(--${key}-shade${n})` }}
                      />
                    ))}
                  </span>
                  <span className="w-16 text-sm text-text">{label}</span>
                  <StateLabel>older → recent</StateLabel>
                </li>
              ))}
              <li className="flex items-center gap-3">
                <span aria-hidden="true" className="flex w-[40px]">
                  <SandCell className="size-3" />
                </span>
                <span className="w-16 text-sm text-text">Not set</span>
                <StateLabel>sand, outlined</StateLabel>
              </li>
            </ul>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* This week card -------------------------------------------------------------------------- */

const SAMPLE_START = '2026-10-07'
const sampleHeld = [
  2, 3, 2, 0, 1, 3, 4, 2, 3, 4, 1, 1, 3, 2, 4, 2, 3, 0, 0, 4, 5, 3, 2, 4, 1, 0, 5, 3, 4, 1,
]
const sampleMoved = [
  0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0,
]
const sampleMissed = [
  0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 1, 0, 3, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 2, 0, 0,
]

const sum = (list: readonly number[]) => list.reduce((n, v) => n + v, 0)

/** Thirty days of sample activity ending on Thu 5 Nov 2026. */
export const sampleActivity: Activity = {
  days: sampleHeld.map((held, k) => {
    const date = addDaysIso(SAMPLE_START, k)
    const weekday = weekdayOf(date)
    return {
      date,
      held,
      moved: sampleMoved[k] ?? 0,
      missed: sampleMissed[k] ?? 0,
      weekend: weekday === 0 || weekday === 6,
      isToday: date === SAMPLE_TODAY,
    }
  }),
  held: sum(sampleHeld),
  moved: sum(sampleMoved),
  missed: sum(sampleMissed),
}

const sampleWeek = [2, 1, 0, 0, 1, 1, 0].map((count, i) => ({
  date: addDaysIso(SAMPLE_TODAY, i),
  count,
}))

export function ActivitySection() {
  return (
    <Section
      id="activity"
      title="This week"
      caption="The side panel's card: the next seven days with a bar per meeting, then the last 30 days as a field of dots. Busy days stack deeper greens; missed follow-ups hang below the sand line."
    >
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-[18px] rounded-card border border-border bg-surface-subtle p-[18px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11.5px] font-semibold tracking-[0.1em] text-text uppercase">
              This week
            </span>
            <span className="font-mono text-[11.5px] text-muted">
              {weekRangeLabel(SAMPLE_TODAY, addDaysIso(SAMPLE_TODAY, 6), SAMPLE_NOW)}
            </span>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-border bg-surface-raised shadow-card">
            <WeekStrip days={sampleWeek} now={SAMPLE_NOW} />
            <div className="border-t border-border">
              <ActivityFieldView activity={sampleActivity} now={SAMPLE_NOW} />
            </div>
          </div>
        </div>
        <Specimen title="How a day is drawn" caption="Hover a column for its counts">
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
            <dt className="text-secondary">Held</dt>
            <dd className="text-text">
              Calls, meetings, WhatsApp and email logged that day, stacked up from the zero line.
              The first {HELD_SHADES} take the five greens in turn, so busy days read deeper.
            </dd>
            <dt className="text-secondary">Stage moved</dt>
            <dd className="text-text">A blue dot on top when a stage moved forward that day.</dd>
            <dt className="text-secondary">Missed</dt>
            <dd className="text-text">
              A next action due that day that passed without a touch, hanging below the line in{' '}
              {MISSED_SHADES} shades from ochre to brick.
            </dd>
            <dt className="text-secondary">Weekends, today</dt>
            <dd className="text-text">Weekend columns are shaded; today is outlined.</dd>
          </dl>
        </Specimen>
      </div>
    </Section>
  )
}

/* Shape ----------------------------------------------------------------------------------- */

const radii = [
  { px: 4, label: 'chips', className: 'rounded-chip' },
  { px: 6, label: 'controls', className: 'rounded-control' },
  { px: 10, label: 'cards', className: 'rounded-card' },
] as const

export function ShapeSection() {
  return (
    <Section
      id="shape"
      title="Shape"
      caption="Square-ish corners: 4 for chips, 6 for controls, 10 for cards and popovers. Hairlines, not shadows; the folder tab is the one curve."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Corners">
          <div className="flex flex-wrap items-end gap-6">
            {radii.map((r) => (
              <span key={r.px} className="flex flex-col gap-2">
                <span
                  aria-hidden="true"
                  className={cn('size-11 shadow-[inset_0_0_0_1.5px_var(--text)]', r.className)}
                />
                <span className="font-mono text-[10.5px] text-muted">
                  {r.px} · {r.label}
                </span>
              </span>
            ))}
            <span className="flex flex-col gap-2">
              <span aria-hidden="true" className="flex h-[30px]">
                <span className="w-[52px] rounded-tl-[8px] bg-[image:linear-gradient(180deg,var(--folder2-top),var(--folder2-bottom))]" />
                <span
                  className="w-[18px] bg-[image:linear-gradient(180deg,var(--folder2-top),var(--folder2-bottom))]"
                  style={{ clipPath: folderEar(30) }}
                />
              </span>
              <span className="font-mono text-[10.5px] text-muted">folder tab</span>
            </span>
          </div>
        </Specimen>
        <Specimen title="Controls" caption="Primary is the only filled blue">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Add to calendar</Button>
              <Button variant="secondary" className="text-lost">
                Mark lost
              </Button>
              <Button variant="ghost" className="bg-surface-hover text-text">
                Cancel
              </Button>
            </div>
            <div
              aria-hidden="true"
              className="flex h-[34px] w-full max-w-[380px] items-center gap-2 rounded-[8px] bg-surface-hover pr-1.5 pl-2.5 text-sm text-muted"
            >
              <Search className="size-4 shrink-0" />
              <span className="flex-1 truncate">Search people, companies, tags</span>
              <Kbd keys={['Mod', 'K']} joined />
            </div>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}
