/**
 * The four figures on a folder front, worked out from the sheet summary. Pure.
 *
 * - People, with the warmth split.
 * - Open pipeline (the first currency column) or, without one, people touched this week.
 * - Won (value or count) for sheets with stages; next actions for sheets without.
 * - Due: next actions overdue or due today.
 */
import { formatCurrency, formatNumber } from '@/domain/format'
import type { SheetSummary } from '@/domain/summary'
import type { Row, Sheet, Warmth } from '@/domain/types'

export interface Figure {
  key: 'people' | 'pipeline' | 'week' | 'won' | 'next' | 'due'
  /** "People", "Open pipeline". */
  label: string
  /** "12", "₹2.2 Cr". */
  value: string
  /** The line under the value: "4 warm · 3 waiting · 3 cold". */
  sub: string
  /** Words after the value on the folded line: "12 people", "₹2.2 Cr open pipeline". */
  inline: string
}

const WARMTH_ORDER: readonly Warmth[] = ['warm', 'waiting', 'cold']

function hasNextAction(row: Row): boolean {
  const next = row.nextAction
  return next !== null && (next.text.trim() !== '' || next.date !== null)
}

function joinParts(parts: readonly (string | false)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(' · ')
}

export function sheetFigures(sheet: Sheet, rows: readonly Row[], summary: SheetSummary): Figure[] {
  const hasStages = sheet.stages.length > 0
  const figures: Figure[] = []

  const warmthSub = joinParts(
    WARMTH_ORDER.map((w) => summary.warmth[w] > 0 && `${formatNumber(summary.warmth[w])} ${w}`),
  )
  figures.push({
    key: 'people',
    label: 'People',
    value: formatNumber(summary.people),
    sub: warmthSub || 'No warmth set yet',
    inline: summary.people === 1 ? 'person' : 'people',
  })

  if (summary.value) {
    figures.push({
      key: 'pipeline',
      label: 'Open pipeline',
      value: formatCurrency(summary.value.open),
      // "Ticket estimate (₹ L/yr)" reads as "Ticket estimate": the figure already shows rupees.
      sub: `${summary.value.column.label.replace(/\s*\(.*\)\s*$/, '')} · ${formatNumber(summary.open)} open`,
      inline: 'open pipeline',
    })
  } else {
    figures.push({
      key: 'week',
      label: 'This week',
      value: formatNumber(summary.touchedThisWeek),
      sub: 'touched in the last 7 days',
      inline: 'touched this week',
    })
  }

  if (hasStages) {
    figures.push({
      key: 'won',
      label: 'Won',
      value: summary.value ? formatCurrency(summary.value.won) : formatNumber(summary.won),
      sub: `${formatNumber(summary.won)} won · ${formatNumber(summary.lost)} lost`,
      inline: 'won',
    })
  } else {
    const withNext = rows.filter(hasNextAction).length
    figures.push({
      key: 'next',
      label: 'Next actions',
      value: formatNumber(withNext),
      sub: `${formatNumber(rows.length - withNext)} without one`,
      inline: withNext === 1 ? 'next action' : 'next actions',
    })
  }

  const { overdue, today } = summary.due
  figures.push({
    key: 'due',
    label: 'Due',
    value: formatNumber(overdue + today),
    sub:
      joinParts([
        overdue > 0 && `${formatNumber(overdue)} overdue`,
        today > 0 && `${formatNumber(today)} today`,
      ]) || 'Nothing due',
    inline: 'due',
  })

  return figures
}
