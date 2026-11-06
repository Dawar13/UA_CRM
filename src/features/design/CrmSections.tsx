import { useState } from 'react'
import { BrandLockup } from '@/components/crm/BrandLockup'
import { DateText } from '@/components/crm/DateText'
import { MemberTabs } from '@/components/crm/MemberTabs'
import { SheetTabs } from '@/components/crm/SheetTabs'
import { StageDots, stageSummary } from '@/components/crm/StageDots'
import { StageTracker } from '@/components/crm/StageTracker'
import { TagChip, TagList } from '@/components/crm/TagChip'
import { ThemeToggle } from '@/components/crm/ThemeToggle'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { toast } from '@/components/ui/Toast'
import type { FuzzyDate, Warmth } from '@/domain/types'
import { ClearWeekArt } from '@/features/calendar-panel/ClearWeekArt'
import type { TagColour } from '@/styles/tokens'
import { Mono, Section, Specimen, StateLabel } from './layout'
import { buildStages, customerStages, stageExamples } from './sampleStages'

/** "Today" in the examples: the frozen reference date used by the tests. */
const DEMO_TODAY = '2026-11-05'

/* Warmth ---------------------------------------------------------------------------------- */

function InteractiveWarmth({ initial, size }: { initial: Warmth | null; size: 'sm' | 'md' }) {
  const [value, setValue] = useState<Warmth | null>(initial)
  return <WarmthChip value={value} onChange={setValue} size={size} alwaysShowEmpty />
}

export function WarmthSection() {
  const values: (Warmth | null)[] = ['warm', 'waiting', 'cold', null]
  return (
    <Section
      id="warmth"
      title="Warmth"
      caption="Warm, Waiting (ball in their court) and Cold, set by hand. Click a chip for the menu; 1, 2, 3 and 0 pick while it is open. In the grid, W cycles it."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Interactive" caption="md (24px) and sm (20px, in grid rows)">
          <div className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] items-center gap-x-3 gap-y-4">
            <span />
            {['Warm', 'Waiting', 'Cold', 'Empty'].map((label) => (
              <StateLabel key={label}>{label}</StateLabel>
            ))}
            <StateLabel>md</StateLabel>
            {values.map((value) => (
              <div key={`md-${value ?? 'none'}`}>
                <InteractiveWarmth initial={value} size="md" />
              </div>
            ))}
            <StateLabel>sm</StateLabel>
            {values.map((value) => (
              <div key={`sm-${value ?? 'none'}`}>
                <InteractiveWarmth initial={value} size="sm" />
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen
          title="Display only and in a row"
          caption="Empty shows nothing until the row is hovered or active"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <WarmthChip value="warm" />
              <WarmthChip value="waiting" />
              <WarmthChip value="cold" />
              <StateLabel className="ml-2">Read only</StateLabel>
            </div>
            <div className="overflow-hidden rounded-control border border-border">
              <div className="group/row flex h-10 items-center gap-3 border-b border-border px-3 hover:bg-row-hover">
                <span className="w-36 truncate text-base font-medium text-text">Meera Pillai</span>
                <WarmthChip value={null} onChange={() => {}} size="sm" tabbable={false} />
                <StateLabel className="ml-auto">Hover the row</StateLabel>
              </div>
              <div
                data-active="true"
                className="group/row flex h-10 items-center gap-3 bg-row-selected px-3"
              >
                <span className="w-36 truncate text-base font-medium text-text">
                  Sanjay Kulkarni
                </span>
                <WarmthChip value={null} onChange={() => {}} size="sm" tabbable={false} />
                <StateLabel className="ml-auto">Active row</StateLabel>
              </div>
            </div>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* Tags ------------------------------------------------------------------------------------ */

const sampleTags: { id: string; name: string; colour: TagColour }[] = [
  { id: 't1', name: 'foundry', colour: 'indigo' },
  { id: 't2', name: 'defence', colour: 'violet' },
  { id: 't3', name: 'pilot candidate', colour: 'pink' },
  { id: 't4', name: 'decision maker', colour: 'orange' },
  { id: 't5', name: 'intro pending', colour: 'amber' },
  { id: 't6', name: 'EF network', colour: 'lime' },
  { id: 't7', name: 'IIT Bombay alumni', colour: 'teal' },
  { id: 't8', name: 'Pune cluster', colour: 'slate' },
]

export function TagsSection() {
  return (
    <Section
      id="tags"
      title="Tags"
      caption="One shared library across sheets. A coloured dot in a neutral pill keeps colour for meaning, not decoration."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Palette" caption="New tags take the least-used hue">
          <div className="flex flex-wrap gap-2">
            {sampleTags.map((tag) => (
              <TagChip key={tag.id} name={tag.name} colour={tag.colour} />
            ))}
          </div>
        </Specimen>
        <Specimen title="Truncation and overflow" caption="Hover a cut-off tag or the +N pill">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <TagChip name="Tier 1 automotive supplier with an export focus" colour="teal" />
              <StateLabel>Long name</StateLabel>
            </div>
            <div className="flex w-72 items-center gap-3 rounded-control border border-border px-3 py-2">
              <TagList tags={sampleTags.slice(0, 5)} />
            </div>
            <div className="flex w-72 items-center gap-3 rounded-control border border-border px-3 py-2">
              <TagList tags={sampleTags.slice(5, 7)} max={2} />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-60 items-center border-y border-border px-3">
                <TagList
                  tags={[sampleTags[3], sampleTags[6], sampleTags[2]].filter(
                    (t) => t !== undefined,
                  )}
                />
              </div>
              <StateLabel>Grid column, 240px</StateLabel>
            </div>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* Stage dots ------------------------------------------------------------------------------ */

export function StageDotsSection() {
  return (
    <Section
      id="stage-dots"
      title="Stage dots"
      caption="Compact progress for the grid, with the stage named in words beside it. Hover a stage for its date."
    >
      <Specimen bodyClassName="p-0">
        <div className="divide-y divide-border">
          {stageExamples.map((example) => (
            <div
              key={example.key}
              className="grid grid-cols-[200px_160px_minmax(0,1fr)] items-center gap-6 px-5 py-3"
            >
              <span className="text-sm text-secondary">{example.label}</span>
              <StageDots stages={example.stages} />
              <Mono className="truncate text-muted">{stageSummary(example.stages)}</Mono>
            </div>
          ))}
        </div>
      </Specimen>
    </Section>
  )
}

/* Stage tracker --------------------------------------------------------------------------- */

interface TrackerState {
  current: number | null
  dates: Record<number, string | null>
  lostOn: string | null
}

/** A local stand-in for the domain rules (moveToStage, markLost, reopen), for the playground. */
function useTrackerPlayground() {
  const [state, setState] = useState<TrackerState>({
    current: 2,
    dates: { 0: '2026-10-01', 1: '2026-10-08', 2: '2026-10-15' },
    lostOn: null,
  })
  const move = (index: number) =>
    setState((prev) => {
      const dates: Record<number, string | null> = {}
      for (let i = 0; i <= index; i++) {
        if (i === index && (prev.current === null || index > prev.current)) dates[i] = DEMO_TODAY
        else dates[i] = prev.dates[i] ?? null
      }
      return { current: index, dates, lostOn: null }
    })
  const stages = buildStages(customerStages, {
    current: state.current,
    lost: state.lostOn !== null,
    dates: customerStages.map((_, i) => state.dates[i] ?? null),
  })
  const lostAt = state.current ?? 0
  return {
    stages,
    lost:
      state.lostOn === null
        ? null
        : { afterStageName: customerStages[lostAt] ?? '', date: state.lostOn },
    move,
    markLost: () =>
      setState((prev) => ({
        ...prev,
        current: prev.current ?? 0,
        dates: prev.current === null ? { 0: DEMO_TODAY } : prev.dates,
        lostOn: DEMO_TODAY,
      })),
    reopen: () => setState((prev) => ({ ...prev, lostOn: null })),
  }
}

const noop = () => {}

export function StageTrackerSection() {
  const playground = useTrackerPlayground()
  const fixed = [
    { label: 'Early', stages: buildStages(customerStages, { current: 1 }), lost: null },
    { label: 'Mid', stages: buildStages(customerStages, { current: 3 }), lost: null },
    { label: 'Won', stages: buildStages(customerStages, { current: 6, won: true }), lost: null },
    {
      label: 'Lost',
      stages: buildStages(customerStages, { current: 2, lost: true }),
      lost: { afterStageName: 'First call', date: '2026-10-15' },
    },
    {
      label: 'Skipped stages, no dates',
      stages: buildStages(customerStages, {
        current: 4,
        dates: ['2026-10-01', null, null, null, '2026-11-02'],
      }),
      lost: null,
    },
  ]
  return (
    <Section
      id="stage-tracker"
      title="Stage tracker"
      caption="The full tracker in the expanded row. Click any other stage to move there; the current stage is marked, not a button. Mark lost and Reopen sit underneath."
    >
      <Specimen
        title="Playground"
        caption="Moves stamp today (5 Nov); moving back clears later dates"
      >
        <div className="rounded-control bg-row-selected px-5 pt-5 pb-3">
          <StageTracker
            stages={playground.stages}
            lost={playground.lost}
            onMove={playground.move}
            onMarkLost={playground.markLost}
            onReopen={playground.reopen}
          />
        </div>
      </Specimen>
      <Specimen title="Every state" bodyClassName="p-0">
        <div className="divide-y divide-border">
          {fixed.map((example) => (
            <div
              key={example.label}
              className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-6 px-5 pt-5 pb-3"
            >
              <div className="flex flex-col gap-1 pt-0.5">
                <span className="text-sm text-secondary">{example.label}</span>
                <Mono className="text-muted">{stageSummary(example.stages)}</Mono>
              </div>
              <StageTracker
                stages={example.stages}
                lost={example.lost}
                onMove={noop}
                onMarkLost={noop}
                onReopen={noop}
              />
            </div>
          ))}
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-6 px-5 py-5">
            <span className="text-sm text-secondary">Disabled</span>
            <StageTracker
              stages={buildStages(customerStages, { current: 3 })}
              lost={null}
              onMove={noop}
              onMarkLost={noop}
              onReopen={noop}
              disabled
            />
          </div>
          <div className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-6 px-5 py-5">
            <span className="text-sm text-secondary">No stages</span>
            <p className="text-sm text-muted">
              Sheets without stages, such as Connectors, do not render the tracker at all.
            </p>
          </div>
        </div>
      </Specimen>
    </Section>
  )
}

/* Dates ----------------------------------------------------------------------------------- */

const dateExamples: { label: string; input: string; date: FuzzyDate | string }[] = [
  { label: 'Exact, this year', input: '2026-11-04', date: '2026-11-04' },
  { label: 'Exact, another year', input: '2025-03-12', date: '2025-03-12' },
  { label: 'Instant, shown in IST', input: '2026-11-04T20:00:00Z', date: '2026-11-04T20:00:00Z' },
  {
    label: 'Early month',
    input: "{ '2026-10-05', early-month }",
    date: { date: '2026-10-05', precision: 'early-month' },
  },
  {
    label: 'Mid month',
    input: "{ '2026-10-15', mid-month }",
    date: { date: '2026-10-15', precision: 'mid-month' },
  },
  {
    label: 'Late month',
    input: "{ '2026-10-25', late-month }",
    date: { date: '2026-10-25', precision: 'late-month' },
  },
  {
    label: 'Month, another year',
    input: "{ '2025-10-01', month }",
    date: { date: '2025-10-01', precision: 'month' },
  },
]

const dueExamples: { label: string; date: FuzzyDate | string }[] = [
  { label: 'Overdue', date: '2026-11-02' },
  { label: 'Overdue, fuzzy', date: { date: '2026-10-05', precision: 'early-month' } },
  { label: 'Today', date: DEMO_TODAY },
  { label: 'Upcoming', date: '2026-11-12' },
  { label: 'Upcoming, fuzzy', date: { date: '2026-11-25', precision: 'late-month' } },
]

export function DatesSection() {
  return (
    <Section
      id="dates"
      title="Dates"
      caption="Written the way people write them, in IST. Hover for the full date and how far away it is. Next dates use the due variant."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Plain" bodyClassName="p-0">
          <div className="divide-y divide-border">
            {dateExamples.map((example) => (
              <div
                key={example.label}
                className="grid grid-cols-[150px_90px_minmax(0,1fr)] items-center gap-4 px-5 py-2.5"
              >
                <span className="text-sm text-secondary">{example.label}</span>
                <DateText date={example.date} className="text-base text-text" />
                <Mono className="truncate text-muted">{example.input}</Mono>
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen
          title="Due"
          caption="Overdue in red; today in blue, reading Today"
          bodyClassName="p-0"
        >
          <div className="divide-y divide-border">
            {dueExamples.map((example) => (
              <div
                key={example.label}
                className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-4 px-5 py-2.5"
              >
                <span className="text-sm text-secondary">{example.label}</span>
                <span className="flex items-center gap-2 text-base text-text">
                  <span className="truncate">Send the ROI note</span>
                  <DateText date={example.date} variant="due" className="text-sm" />
                </span>
              </div>
            ))}
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* Tabs ------------------------------------------------------------------------------------ */

const members = [
  { id: 'dawar', name: 'Dawar' },
  { id: 'dhruv', name: 'Dhruv' },
]
const sheets = [
  { id: 'customers', name: 'Customers' },
  { id: 'investors', name: 'Investors' },
  { id: 'advisors', name: 'Advisors and experts' },
  { id: 'connectors', name: 'Connectors' },
  { id: 'service', name: 'Service providers' },
]
const counts: Record<string, number> = {
  customers: 12,
  investors: 6,
  advisors: 3,
  connectors: 6,
  service: 4,
}

export function TabsSection() {
  const [member, setMember] = useState('dawar')
  const [sheet, setSheet] = useState('customers')
  const [narrowSheet, setNarrowSheet] = useState('advisors')
  return (
    <Section
      id="tabs"
      title="Tabs"
      caption="The member switch is a segmented control in the 56px header; sheets are folder tabs above their sheet. Arrow keys move and switch."
    >
      <Specimen className="overflow-hidden" bodyClassName="p-0">
        <div>
          <div className="flex h-14 items-center gap-6 border-b border-border px-5">
            <BrandLockup />
            <MemberTabs members={members} value={member} onValueChange={setMember} />
            <div className="ml-auto flex items-center">
              <ThemeToggle variant="secondary" size="lg" />
            </div>
          </div>
          <div className="flex h-10 items-stretch border-b border-border px-4">
            <SheetTabs sheets={sheets} counts={counts} value={sheet} onValueChange={setSheet} />
          </div>
          <div className="h-10 bg-surface-subtle" />
        </div>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Overflow" caption="Scrolls sideways with fading edges">
          <div className="flex h-10 w-[300px] items-stretch rounded-control border border-border px-1">
            <SheetTabs
              sheets={sheets}
              counts={counts}
              value={narrowSheet}
              onValueChange={setNarrowSheet}
            />
          </div>
        </Specimen>
        <Specimen title="Tabs with panels" caption="The primitive, for settings and dialogs">
          <Tabs defaultValue="history">
            <TabsList aria-label="Row detail">
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="links">Links</TabsTrigger>
              <TabsTrigger value="files" disabled>
                Files
              </TabsTrigger>
            </TabsList>
            <TabsContent value="history">
              <p className="text-sm text-secondary">Called, wants a pilot on line 3 · 4 Nov</p>
            </TabsContent>
            <TabsContent value="links">
              <p className="text-sm text-secondary">Introduced by Krithik Rao</p>
            </TabsContent>
            <TabsContent value="files">
              <p className="text-sm text-secondary">No files yet</p>
            </TabsContent>
          </Tabs>
        </Specimen>
      </div>
    </Section>
  )
}

/* Empty states ---------------------------------------------------------------------------- */

export function EmptySection() {
  return (
    <Section
      id="empty"
      title="Empty states"
      caption="Say what belongs here and how to add it. Every empty state shows the same heatmap: quiet grey cells, the first column in stage blues with one deep-blue cell, popping in with a short ripple. The side panel adds its hours."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Specimen bodyClassName="p-0">
          <EmptyState
            title="No one here yet"
            description="People added to this sheet show up here, with their warmth and stage."
          />
        </Specimen>
        <Specimen bodyClassName="p-0">
          <EmptyState
            art={<ClearWeekArt today="2026-11-05" now={new Date('2026-11-05T10:00:00+05:30')} />}
            title="A clear week"
            description="No meetings in the next seven days."
          />
        </Specimen>
        <Specimen bodyClassName="p-0">
          <EmptyState
            title="No matches for “menon”"
            description="Try a first name, a company or a tag."
            action={
              <Button variant="secondary" size="sm" onClick={() => toast('Search cleared')}>
                Clear search
              </Button>
            }
          />
        </Specimen>
      </div>
    </Section>
  )
}
