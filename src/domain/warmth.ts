/**
 * Warmth: Warm (green), Waiting (amber, ball in their court), Cold (red), or empty.
 * Set by hand, never automatic. Pure.
 */
import { systemChange } from './stages'
import type { DomainContext, HistoryEntry, Row, RowChange, Warmth } from './types'

/** Cycle order for `W`: empty → warm → waiting → cold → empty. */
export const warmthCycle: readonly (Warmth | null)[] = [null, 'warm', 'waiting', 'cold']

const LABELS: Record<Warmth, string> = { warm: 'Warm', waiting: 'Waiting', cold: 'Cold' }
const SHORTCUTS: Record<Warmth, string> = { warm: '1', waiting: '2', cold: '3' }

/** "Warm", "Waiting", "Cold"; "No warmth" for null. */
export function warmthLabel(warmth: Warmth | null): string {
  return warmth === null ? 'No warmth' : LABELS[warmth]
}

/** Shortcut digit in the warmth menu: warm 1, waiting 2, cold 3, clear 0. */
export function warmthShortcut(warmth: Warmth | null): string {
  return warmth === null ? '0' : SHORTCUTS[warmth]
}

/** Token names, for example { fg: '--warm', bg: '--warm-bg' }; null for empty. */
export function warmthTokens(warmth: Warmth | null): { fg: string; bg: string } | null {
  return warmth === null ? null : { fg: `--${warmth}`, bg: `--${warmth}-bg` }
}

export function nextWarmth(current: Warmth | null): Warmth | null {
  const i = warmthCycle.indexOf(current)
  return warmthCycle[(i + 1) % warmthCycle.length] ?? null
}

function warmthText(from: Warmth | null, to: Warmth | null): string {
  if (to === null) return 'Warmth cleared'
  if (from === null || from === to) return `Warmth set to ${LABELS[to]}`
  return `Warmth: ${LABELS[from]} → ${LABELS[to]}`
}

/**
 * Sets warmth. History kind 'warmth', source 'system', text "Warmth: Warm → Cold" (or
 * "Warmth set to Warm", "Warmth cleared"), meta { fromWarmth, toWarmth }.
 * `undo: true` marks the entry as an undo.
 */
export function setWarmth(
  row: Row,
  warmth: Warmth | null,
  ctx: DomainContext,
  options?: { undo?: boolean },
): RowChange {
  const meta: NonNullable<HistoryEntry['meta']> = { fromWarmth: row.warmth, toWarmth: warmth }
  if (options?.undo) meta.undo = true
  return systemChange(row, { warmth }, 'warmth', warmthText(row.warmth, warmth), meta, ctx)
}
