/**
 * Dates. Store UTC, display IST (Asia/Kolkata). Fuzzy dates keep their precision end to end.
 * Uses date-fns 4 with @date-fns/tz. Pure.
 *
 * Copy rules (CLAUDE.md §3.5): "5 Nov 2026"; "Thu 5 Nov" when the year is current;
 * times "4:00 pm", always IST.
 *
 * CONTRACT (signatures are fixed; bodies are implemented in M0.3).
 */
import type { FuzzyDate, IsoDate } from './types'

export declare const IST: 'Asia/Kolkata'

/** Today's IST calendar date as "YYYY-MM-DD". */
export declare function todayIst(now: Date): IsoDate

/** IST calendar date of an instant. */
export declare function istDateOf(instant: Date | string): IsoDate

/**
 * Parses "early Oct", "mid Oct", "late Oct", "Oct 2026", "October", "12 Nov", "Nov 12",
 * "12 Nov 2026", "12/11/2026" (day first). Case-insensitive.
 * Year inference: when no year is given, pick the nearest occurrence to the reference date
 * (within six months either side), so "late Dec" typed on 5 Jan means last December and
 * "early Jan" typed on 20 Dec means next January.
 * Returns null when the text is not a date.
 */
export declare function parseFuzzyDate(text: string, reference: Date): FuzzyDate | null

/** Seam for Phase 1: natural-language dates through chrono-node ("fri 4pm"). */
export declare function parseNaturalDate(text: string, reference: Date): Date | null

/** Day-precision FuzzyDate from an ISO date. */
export declare function exactDate(date: IsoDate): FuzzyDate

/**
 * Display text.
 * - day: "4 Nov" (current IST year), "4 Nov 2025" otherwise.
 * - early/mid/late: "Early Oct", "Mid Oct", "Late Oct" (+ year if not current).
 * - month: "Oct 2026" when not the current year, "Oct" otherwise.
 */
export declare function formatFuzzyDate(date: FuzzyDate, now: Date): string

/** "5 Nov 2026"; with `weekday`: "Thu 5 Nov" (year added when not current). */
export declare function formatDate(
  date: IsoDate | Date | string,
  now: Date,
  options?: { weekday?: boolean; alwaysYear?: boolean },
): string

/** "4:00 pm" in IST. */
export declare function formatTime(instant: Date | string): string

/** "Today", "Tomorrow", "Fri 6 Nov" for calendar day headers. */
export declare function formatDayHeading(date: IsoDate, now: Date): string

/**
 * Relative phrase in IST calendar days: "today", "yesterday", "tomorrow", "3 days ago",
 * "in 3 days", "2 weeks ago", "in 2 weeks", "3 months ago". Fuzzy dates use their sort date.
 */
export declare function relative(date: FuzzyDate | IsoDate, now: Date): string

/** Full date for tooltips: "4 Nov 2026" or, for fuzzy, "Mid Oct 2026". */
export declare function formatFullDate(date: FuzzyDate | IsoDate): string

/**
 * Overdue when the date is before today (IST). Fuzzy dates are overdue only when the whole
 * period has passed (early = days 1–10, mid = 11–20, late = 21–end, month = whole month).
 */
export declare function isOverdue(date: FuzzyDate, now: Date): boolean

/** Due today (IST). Only day precision can be today. */
export declare function isToday(date: FuzzyDate, now: Date): boolean

/** Sort key (ISO date) for any FuzzyDate. */
export declare function sortKey(date: FuzzyDate): IsoDate

/** Compares two fuzzy dates for sorting; nulls last. */
export declare function compareFuzzy(a: FuzzyDate | null, b: FuzzyDate | null): number
