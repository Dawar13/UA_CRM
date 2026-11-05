/**
 * Warmth: Warm (green), Waiting (amber, ball in their court), Cold (red), or empty.
 * Set by hand, never automatic. Pure.
 *
 * CONTRACT (signatures are fixed; bodies are implemented in M0.3).
 */
import type { DomainContext, Row, RowChange, Warmth } from './types'

/** Cycle order for `W`: empty → warm → waiting → cold → empty. */
export declare const warmthCycle: readonly (Warmth | null)[]

/** "Warm", "Waiting", "Cold"; "No warmth" for null. */
export declare function warmthLabel(warmth: Warmth | null): string

/** Shortcut digit in the warmth menu: warm 1, waiting 2, cold 3, clear 0. */
export declare function warmthShortcut(warmth: Warmth | null): string

/** Token names, for example { fg: '--warm', bg: '--warm-bg' }; null for empty. */
export declare function warmthTokens(warmth: Warmth | null): { fg: string; bg: string } | null

export declare function nextWarmth(current: Warmth | null): Warmth | null

/**
 * Sets warmth. History kind 'warmth', source 'system', text "Warmth: Warm → Cold" (or
 * "Warmth set to Warm", "Warmth cleared"), meta { fromWarmth, toWarmth }.
 * `undo: true` marks the entry as an undo.
 */
export declare function setWarmth(
  row: Row,
  warmth: Warmth | null,
  ctx: DomainContext,
  options?: { undo?: boolean },
): RowChange
