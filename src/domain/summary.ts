/**
 * The folder front: a sheet's figures and its pipeline, computed from its rows. Pure.
 *
 * - Reached: everyone who got to a stage or beyond. Lost rows count up to the stage they stopped
 *   at, so the pipeline capsule tapers honestly.
 * - Here: who is at a stage now (not lost). Stopped: who was lost at that stage.
 * - Recency: how recently a person was touched (2 within 7 days, 1 within 14, 0 older or never).
 *   The warmth squares use it as their shade: deeper means touched more recently.
 */
import { daysBetween, isOverdue, isToday, istDateOf, todayIst } from './dates'
import { effectiveStageIndex, isWon } from './stages'
import type { ColumnDef, Row, Sheet, Warmth } from './types'

export type Recency = 0 | 1 | 2

export interface SummaryPerson {
  id: string
  name: string
  warmth: Warmth | null
  recency: Recency
}

export interface SummaryStage {
  id: string
  name: string
  index: number
  /** Everyone who reached this stage or a later one. */
  reached: number
  /** Who is at this stage now, in sheet order. */
  here: SummaryPerson[]
  /** How many were lost at this stage (they count in `reached`, not in `here`). */
  stopped: number
  /** The last stage: the win. */
  isWin: boolean
}

export interface SummaryGroup {
  label: string
  people: SummaryPerson[]
}

export interface SheetSummary {
  people: number
  warmth: Record<Warmth, number> & { none: number }
  /** Rows neither won nor lost (every row when the sheet has no stages). */
  open: number
  won: number
  lost: number
  /** Totals of the sheet's first currency column, when it has one. */
  value: { column: ColumnDef; open: number; won: number } | null
  /** Next actions overdue and due today. */
  due: { overdue: number; today: number }
  /** Rows touched in the last seven days, today included. */
  touchedThisWeek: number
  /** One entry per stage; empty when the sheet has no stages. */
  stages: SummaryStage[]
  lostPeople: SummaryPerson[]
  /** Sheets without stages group people by their first dropdown column instead. */
  groups: { column: ColumnDef; groups: SummaryGroup[] } | null
}

/** 2 when touched in the last 7 days, 1 within 14, 0 when older or never touched. */
export function recencyOf(lastTouchAt: string | null, now: Date): Recency {
  if (!lastTouchAt) return 0
  const days = daysBetween(istDateOf(lastTouchAt), todayIst(now))
  if (days <= 7) return 2
  if (days <= 14) return 1
  return 0
}

function person(row: Row, now: Date): SummaryPerson {
  return {
    id: row.id,
    name: row.name,
    warmth: row.warmth,
    recency: recencyOf(row.lastTouchAt, now),
  }
}

function visibleCustom(sheet: Sheet, type: ColumnDef['type']): ColumnDef | undefined {
  return [...sheet.columns]
    .sort((a, b) => a.position - b.position)
    .find((c) => !c.system && !c.hidden && !c.deletedAt && c.type === type)
}

function amount(row: Row, column: ColumnDef): number {
  const value = row.fields[column.key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function summariseSheet(sheet: Sheet, rows: readonly Row[], now: Date): SheetSummary {
  const hasStages = sheet.stages.length > 0
  const today = todayIst(now)
  const warmth = { warm: 0, waiting: 0, cold: 0, none: 0 }
  let won = 0
  let lost = 0
  let overdue = 0
  let dueToday = 0
  let touchedThisWeek = 0

  for (const row of rows) {
    if (row.warmth) warmth[row.warmth] += 1
    else warmth.none += 1
    if (hasStages && isWon(row, sheet)) won += 1
    if (row.lost) lost += 1
    const date = row.nextAction?.date
    if (date && !row.lost) {
      if (isToday(date, now)) dueToday += 1
      else if (isOverdue(date, now)) overdue += 1
    }
    if (row.lastTouchAt && daysBetween(istDateOf(row.lastTouchAt), today) <= 6) {
      touchedThisWeek += 1
    }
  }

  const currency = visibleCustom(sheet, 'currency')
  let value: SheetSummary['value'] = null
  if (currency) {
    let open = 0
    let wonValue = 0
    for (const row of rows) {
      if (row.lost) continue
      if (hasStages && isWon(row, sheet)) wonValue += amount(row, currency)
      else open += amount(row, currency)
    }
    value = { column: currency, open, won: wonValue }
  }

  const stages: SummaryStage[] = sheet.stages.map((stage, index) => ({
    id: stage.id,
    name: stage.name,
    index,
    reached: rows.filter((row) => (effectiveStageIndex(row) ?? -1) >= index).length,
    here: rows.filter((row) => !row.lost && row.stageIndex === index).map((r) => person(r, now)),
    stopped: rows.filter((row) => row.lost && effectiveStageIndex(row) === index).length,
    isWin: index === sheet.stages.length - 1,
  }))

  let groups: SheetSummary['groups'] = null
  if (!hasStages) {
    const dropdown = visibleCustom(sheet, 'dropdown')
    if (dropdown) {
      const labels = [...(dropdown.options ?? [])]
      const byLabel = new Map<string, SummaryPerson[]>(labels.map((l) => [l, []]))
      const unset: SummaryPerson[] = []
      for (const row of rows) {
        const v = row.fields[dropdown.key]
        const list = typeof v === 'string' ? byLabel.get(v) : undefined
        if (list) list.push(person(row, now))
        else if (typeof v === 'string' && v) byLabel.set(v, [person(row, now)])
        else unset.push(person(row, now))
      }
      const list: SummaryGroup[] = [...byLabel.entries()].map(([label, people]) => ({
        label,
        people,
      }))
      if (unset.length > 0) list.push({ label: 'Not set', people: unset })
      groups = { column: dropdown, groups: list }
    }
  }

  return {
    people: rows.length,
    warmth,
    open: hasStages ? rows.length - won - lost : rows.length,
    won,
    lost,
    value,
    due: { overdue, today: dueToday },
    touchedThisWeek,
    stages,
    lostPeople: rows.filter((row) => row.lost).map((r) => person(r, now)),
    groups,
  }
}

/** Share of people who moved on from stage `index` to the next, as a whole percentage. */
export function conversion(stages: readonly SummaryStage[], index: number): number | null {
  const from = stages[index]
  const to = stages[index + 1]
  if (!from || !to || from.reached === 0) return null
  return Math.round((to.reached / from.reached) * 100)
}
