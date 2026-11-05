/**
 * Deterministic example data for /design, around 5 Nov 2026, so visual snapshots are stable.
 * Stage lists are built directly as `StageViewItem[]` (what `stageView` returns).
 */
import type { StageViewItem } from '@/components/crm/StageDots'
import type { StageState } from '@/domain/types'

export const customerStages = [
  'Identified',
  'Intro asked',
  'First call',
  'Plant visit',
  'Pilot scoped',
  'Pilot live',
  'Paid',
] as const

export const investorStages = [
  'Researching',
  'Intro asked',
  'First meeting',
  'Diligence',
  'Term sheet',
  'Committed',
] as const

export const advisorStages = ['Identified', 'Approached', 'Active'] as const

/** Dates each customer stage was reached in the examples (IST calendar dates). */
export const sampleDates = [
  '2026-10-01',
  '2026-10-08',
  '2026-10-15',
  '2026-10-27',
  '2026-11-02',
  '2026-11-04',
  '2026-11-05',
] as const

export interface StageExample {
  /** Index of the stage reached, or null when none is. */
  current: number | null
  won?: boolean
  /** The row was marked lost at `current`. */
  lost?: boolean
  /** Date per stage index; null means reached without a date (skipped). */
  dates?: readonly (string | null)[]
}

/** Builds stage view items with the same rules as `stageState` in domain/stages.ts. */
export function buildStages(names: readonly string[], example: StageExample): StageViewItem[] {
  const { current, won = false, lost = false, dates = sampleDates } = example
  return names.map((name, index) => {
    let state: StageState
    if (won) state = index === names.length - 1 ? 'won' : 'done'
    else if (current !== null && index < current) state = 'done'
    else if (current !== null && index === current) state = 'current'
    else if (lost && index === (current ?? 0) + 1) state = 'lost-marker'
    else state = 'future'
    const reached = state === 'done' || state === 'current' || state === 'won'
    return {
      id: `stage-${index}`,
      name,
      index,
      state,
      date: reached ? (dates[index] ?? null) : null,
    }
  })
}

export const stageExamples: { key: string; label: string; stages: StageViewItem[] }[] = [
  { key: 'none', label: 'Not started', stages: buildStages(customerStages, { current: null }) },
  { key: 'early', label: 'Early', stages: buildStages(customerStages, { current: 1 }) },
  { key: 'mid', label: 'Mid', stages: buildStages(customerStages, { current: 3 }) },
  { key: 'won', label: 'Won', stages: buildStages(customerStages, { current: 6, won: true }) },
  {
    key: 'lost',
    label: 'Lost',
    stages: buildStages(customerStages, { current: 3, lost: true }),
  },
  {
    key: 'skipped',
    label: 'Skipped stages, no dates',
    stages: buildStages(customerStages, {
      current: 4,
      dates: ['2026-10-01', null, null, null, '2026-11-02'],
    }),
  },
  {
    key: 'investor-won',
    label: 'Investors, won',
    stages: buildStages(investorStages, { current: 5, won: true }),
  },
  { key: 'advisor', label: 'Advisors', stages: buildStages(advisorStages, { current: 1 }) },
]
