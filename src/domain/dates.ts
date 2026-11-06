/**
 * Dates. Store UTC, display IST (Asia/Kolkata). Fuzzy dates keep their precision end to end.
 * Uses date-fns 4 with @date-fns/tz. Pure.
 *
 * Copy rules (CLAUDE.md §3.5): "5 Nov 2026"; "Thu 5 Nov" when the year is current;
 * times "4:00 pm", always IST.
 *
 * Implementation notes:
 * - Instants are converted to IST with `@date-fns/tz` (the `in: tz(IST)` context of date-fns 4),
 *   so results never depend on the process time zone.
 * - Calendar dates ("2026-11-05") are handled as plain year, month and day numbers, with day
 *   arithmetic done in UTC milliseconds. A calendar date has no time zone, so this is exact.
 */
import { tz } from '@date-fns/tz'
import * as chrono from 'chrono-node'
import { format } from 'date-fns'
import { fuzzyPrecisions } from './schemas'
import type { FuzzyDate, FuzzyPrecision, IsoDate } from './types'

export const IST = 'Asia/Kolkata' as const

/** IST is UTC+5:30 all year (no daylight saving). */
export const IST_OFFSET_MINUTES = 330

const inIst = tz(IST)
const DAY_MS = 86_400_000

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Year, month (1–12) and day of a calendar date. */
export interface CalendarParts {
  year: number
  month: number
  day: number
}

/** True for a plain calendar date string such as "2026-11-05" (not an instant). */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** Splits "2026-11-05" into numbers. Throws a RangeError for anything else. */
export function parseIsoDate(date: IsoDate): CalendarParts {
  const m = ISO_DATE_RE.exec(date)
  if (!m || !isIsoDate(date)) throw new RangeError(`Not an ISO calendar date: ${date}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Builds "2026-11-05" from numbers. */
export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Number of days in a month (1–12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dayNumber(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from)
}

/** Adds whole days to a calendar date. */
export function addDaysIso(date: IsoDate, days: number): IsoDate {
  const d = new Date((dayNumber(date) + days) * DAY_MS)
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Day of the week for a calendar date, 0 = Sunday. */
export function weekdayOf(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** The UTC instant of an IST wall-clock time on a calendar date ("2026-11-05", "16:00"). */
export function istInstant(date: IsoDate, time = '00:00'): Date {
  parseIsoDate(date)
  if (!/^\d{2}:\d{2}$/.test(time)) throw new RangeError(`Not a 24-hour time: ${time}`)
  return new Date(`${date}T${time}:00+05:30`)
}

/**
 * The IST calendar date of an instant, by arithmetic: IST is a fixed UTC+5:30, so shifting the
 * instant and reading its UTC date is exact, and far cheaper than a time-zone formatter. Summaries
 * call this for every row (thousands of times on a large sheet).
 */
function istDateOfMs(ms: number): IsoDate {
  const shifted = new Date(ms + IST_OFFSET_MINUTES * 60_000)
  return toIsoDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Today's IST calendar date as "YYYY-MM-DD". */
export function todayIst(now: Date): IsoDate {
  return istDateOfMs(now.getTime())
}

/** IST calendar date of an instant. A plain calendar date string is returned unchanged. */
export function istDateOf(instant: Date | string): IsoDate {
  if (typeof instant === 'string' && isIsoDate(instant)) return instant
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant: ${String(instant)}`)
  return istDateOfMs(date.getTime())
}

// ---------------------------------------------------------------------------------------------
// Parsing

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const MONTH_RE = `(${Object.keys(MONTH_NAMES)
  .sort((a, b) => b.length - a.length)
  .join('|')})`
const YEAR_RE = `(?:[\\s,-]+(\\d{4}))?`
const ORDINAL_RE = '(?:st|nd|rd|th)?'

const PART_RE = new RegExp(
  `^(early|beginning of|start of|mid|middle of|late|end of)[\\s-]+${MONTH_RE}${YEAR_RE}$`,
)
const MONTH_ONLY_RE = new RegExp(`^${MONTH_RE}${YEAR_RE}$`)
const DAY_MONTH_RE = new RegExp(`^(\\d{1,2})${ORDINAL_RE}[\\s-]+(?:of\\s+)?${MONTH_RE}${YEAR_RE}$`)
const MONTH_DAY_RE = new RegExp(`^${MONTH_RE}[\\s-]+(\\d{1,2})${ORDINAL_RE}${YEAR_RE}$`)
const NUMERIC_RE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?$/

const PART_PRECISION: Record<string, FuzzyPrecision> = {
  early: 'early-month',
  'beginning of': 'early-month',
  'start of': 'early-month',
  mid: 'mid-month',
  'middle of': 'mid-month',
  late: 'late-month',
  'end of': 'late-month',
}

/** Sort day within the month for each precision (day precision uses its own day). */
const SORT_DAY: Record<Exclude<FuzzyPrecision, 'day'>, number> = {
  'early-month': 5,
  'mid-month': 15,
  'late-month': 25,
  month: 1,
}

/** Day used to measure distance when inferring the year: the middle of the period. */
const DISTANCE_DAY: Record<Exclude<FuzzyPrecision, 'day'>, number> = {
  'early-month': 5,
  'mid-month': 15,
  'late-month': 25,
  month: 15,
}

function monthNumber(name: string | undefined): number {
  // The regexes only capture known month names, so the lookup always succeeds.
  return MONTH_NAMES[name ?? ''] ?? 0
}

function build(
  year: number,
  month: number,
  precision: FuzzyPrecision,
  day: number,
): FuzzyDate | null {
  if (month < 1 || month > 12) return null
  if (precision === 'day') {
    if (day < 1 || day > daysInMonth(year, month)) return null
    return { date: toIsoDate(year, month, day), precision }
  }
  return { date: toIsoDate(year, month, SORT_DAY[precision]), precision }
}

/**
 * Picks the year that puts the date nearest to `today` (so within six months either side).
 * Ties go to the later year, in keeping with forward-dated next actions.
 */
function inferYear(
  month: number,
  precision: FuzzyPrecision,
  day: number,
  today: IsoDate,
): FuzzyDate | null {
  const { year } = parseIsoDate(today)
  let best: { value: FuzzyDate; distance: number } | null = null
  for (const candidateYear of [year + 1, year, year - 1]) {
    const value = build(candidateYear, month, precision, day)
    if (!value) continue
    const distanceDay = precision === 'day' ? day : DISTANCE_DAY[precision]
    const distance = Math.abs(daysBetween(today, toIsoDate(candidateYear, month, distanceDay)))
    if (!best || distance < best.distance) best = { value, distance }
  }
  return best?.value ?? null
}

function resolve(
  month: number,
  precision: FuzzyPrecision,
  day: number,
  year: string | undefined,
  today: IsoDate,
): FuzzyDate | null {
  if (year !== undefined) return build(Number(year), month, precision, day)
  return inferYear(month, precision, day, today)
}

/**
 * Parses "early Oct", "mid Oct", "late Oct", "Oct 2026", "October", "12 Nov", "Nov 12",
 * "12 Nov 2026", "12/11/2026" (day first). Case-insensitive.
 * Year inference: when no year is given, pick the nearest occurrence to the reference date
 * (within six months either side), so "late Dec" typed on 5 Jan means last December and
 * "early Jan" typed on 20 Dec means next January.
 * Returns null when the text is not a date.
 *
 * Also accepted: "beginning of", "start of" (early), "middle of" (mid), "end of" (late),
 * ordinals ("12th Nov"), "mid-Oct", two-digit years in numeric dates ("12/11/26") and ISO
 * calendar dates ("2026-11-12").
 */
export function parseFuzzyDate(text: string, reference: Date): FuzzyDate | null {
  const input = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/, '')
  if (input === '') return null
  const today = todayIst(reference)

  if (isIsoDate(input)) return { date: input, precision: 'day' }

  let m = PART_RE.exec(input)
  if (m) {
    const precision = PART_PRECISION[m[1] ?? ''] ?? 'month'
    return resolve(monthNumber(m[2]), precision, 0, m[3], today)
  }

  m = MONTH_ONLY_RE.exec(input)
  if (m) return resolve(monthNumber(m[1]), 'month', 0, m[2], today)

  m = DAY_MONTH_RE.exec(input)
  if (m) return resolve(monthNumber(m[2]), 'day', Number(m[1]), m[3], today)

  m = MONTH_DAY_RE.exec(input)
  if (m) return resolve(monthNumber(m[1]), 'day', Number(m[2]), m[3], today)

  m = NUMERIC_RE.exec(input)
  if (m) {
    const rawYear = m[3]
    const year = rawYear === undefined ? undefined : rawYear.length === 2 ? `20${rawYear}` : rawYear
    return resolve(Number(m[2]), 'day', Number(m[1]), year, today)
  }

  return null
}

/**
 * Seam for Phase 1: natural-language dates through chrono-node ("fri 4pm").
 * Uses the British English parser (day-first numeric dates, as in India), the reference
 * instant in IST, and forward dating ("fri" means the coming Friday).
 */
export function parseNaturalDate(text: string, reference: Date): Date | null {
  if (text.trim() === '') return null
  return chrono.en.GB.parseDate(
    text,
    { instant: reference, timezone: IST_OFFSET_MINUTES },
    { forwardDate: true },
  )
}

/** Day-precision FuzzyDate from an ISO date. */
export function exactDate(date: IsoDate): FuzzyDate {
  parseIsoDate(date)
  return { date, precision: 'day' }
}

// ---------------------------------------------------------------------------------------------
// Formatting

const PART_LABEL: Record<'early-month' | 'mid-month' | 'late-month', string> = {
  'early-month': 'Early',
  'mid-month': 'Mid',
  'late-month': 'Late',
}

function currentYear(now: Date): number {
  return parseIsoDate(todayIst(now)).year
}

function toCalendarDate(date: IsoDate | Date | string): IsoDate {
  return typeof date === 'string' && isIsoDate(date) ? date : istDateOf(date)
}

function fuzzyText(date: FuzzyDate, withYear: boolean): string {
  const { year, month, day } = parseIsoDate(sortKey(date))
  const mon = MONTH_SHORT[month - 1] ?? ''
  const suffix = withYear ? ` ${year}` : ''
  switch (date.precision) {
    case 'day':
      return `${day} ${mon}${suffix}`
    case 'month':
      return `${mon}${suffix}`
    default:
      return `${PART_LABEL[date.precision]} ${mon}${suffix}`
  }
}

/**
 * Display text.
 * - day: "4 Nov" (current IST year), "4 Nov 2025" otherwise.
 * - early/mid/late: "Early Oct", "Mid Oct", "Late Oct" (+ year if not current).
 * - month: "Oct 2026" when not the current year, "Oct" otherwise.
 */
export function formatFuzzyDate(date: FuzzyDate, now: Date): string {
  const { year } = parseIsoDate(date.date)
  return fuzzyText(date, year !== currentYear(now))
}

/**
 * "5 Nov 2026"; with `weekday`: "Thu 5 Nov" (year added when not current, or always with
 * `alwaysYear`). Without `weekday` the year is always shown, per CLAUDE.md §3.5.
 * Accepts a calendar date ("2026-11-05"), an ISO instant or a Date; instants are shown in IST.
 */
export function formatDate(
  date: IsoDate | Date | string,
  now: Date,
  options?: { weekday?: boolean; alwaysYear?: boolean },
): string {
  const iso = toCalendarDate(date)
  const { year, month, day } = parseIsoDate(iso)
  const base = `${day} ${MONTH_SHORT[month - 1] ?? ''}`
  if (!options?.weekday) return `${base} ${year}`
  const showYear = options.alwaysYear === true || year !== currentYear(now)
  return `${WEEKDAY_SHORT[weekdayOf(iso)] ?? ''} ${base}${showYear ? ` ${year}` : ''}`
}

/** "4:00 pm" in IST. */
export function formatTime(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant: ${String(instant)}`)
  return format(date, 'h:mm aaa', { in: inIst })
}

/** "Today", "Tomorrow", "Fri 6 Nov" for calendar day headers. */
export function formatDayHeading(date: IsoDate, now: Date): string {
  const diff = daysBetween(todayIst(now), date)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return formatDate(date, now, { weekday: true })
}

function unit(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * Relative phrase in IST calendar days: "today", "yesterday", "tomorrow", "3 days ago",
 * "in 3 days", "2 weeks ago", "in 2 weeks", "3 months ago". Fuzzy dates use their sort date.
 * Up to 13 days in days, up to 59 days in whole weeks, up to 364 days in whole 30-day months,
 * then whole years. An ISO instant is accepted too (its IST date is used).
 */
export function relative(date: FuzzyDate | IsoDate, now: Date): string {
  const iso = typeof date === 'string' ? toCalendarDate(date) : sortKey(date)
  const diff = daysBetween(todayIst(now), iso)
  if (diff === 0) return 'today'
  if (diff === -1) return 'yesterday'
  if (diff === 1) return 'tomorrow'
  const abs = Math.abs(diff)
  let phrase: string
  if (abs < 14) phrase = unit(abs, 'day')
  else if (abs < 60) phrase = unit(Math.floor(abs / 7), 'week')
  else if (abs < 365) phrase = unit(Math.floor(abs / 30), 'month')
  else phrase = unit(Math.floor(abs / 365), 'year')
  return diff < 0 ? `${phrase} ago` : `in ${phrase}`
}

/**
 * Full date for tooltips: "4 Nov 2026" or, for fuzzy, "Mid Oct 2026". An ISO instant is shown
 * as its IST calendar date.
 */
export function formatFullDate(date: FuzzyDate | IsoDate): string {
  if (typeof date === 'string') return fuzzyText(exactDate(toCalendarDate(date)), true)
  return fuzzyText(date, true)
}

// ---------------------------------------------------------------------------------------------
// Comparisons

/** Last calendar day of the period a fuzzy date covers. */
export function periodEnd(date: FuzzyDate): IsoDate {
  const { year, month } = parseIsoDate(date.date)
  switch (date.precision) {
    case 'day':
      return date.date
    case 'early-month':
      return toIsoDate(year, month, 10)
    case 'mid-month':
      return toIsoDate(year, month, 20)
    default:
      return toIsoDate(year, month, daysInMonth(year, month))
  }
}

/**
 * Overdue when the date is before today (IST). Fuzzy dates are overdue only when the whole
 * period has passed (early = days 1–10, mid = 11–20, late = 21–end, month = whole month).
 */
export function isOverdue(date: FuzzyDate, now: Date): boolean {
  return periodEnd(date) < todayIst(now)
}

/** Due today (IST). Only day precision can be today. */
export function isToday(date: FuzzyDate, now: Date): boolean {
  return date.precision === 'day' && date.date === todayIst(now)
}

/**
 * Sort key (ISO date) for any FuzzyDate: the day itself, or the 5th, 15th, 25th or 1st of the
 * month for early, mid, late and month. Recomputed from the month, so a stored date that drifted
 * from the convention still sorts correctly.
 */
export function sortKey(date: FuzzyDate): IsoDate {
  if (date.precision === 'day') return date.date
  const { year, month } = parseIsoDate(date.date)
  return toIsoDate(year, month, SORT_DAY[date.precision])
}

/**
 * Compares two fuzzy dates for sorting; nulls last. Equal sort keys order by precision, exact
 * dates first.
 */
export function compareFuzzy(a: FuzzyDate | null, b: FuzzyDate | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  const ka = sortKey(a)
  const kb = sortKey(b)
  if (ka !== kb) return ka < kb ? -1 : 1
  return fuzzyPrecisions.indexOf(a.precision) - fuzzyPrecisions.indexOf(b.precision)
}
