/**
 * Folder colours and the pixel pipeline for the sheet tabs and the folder front. Pure.
 *
 * Each sheet is a coloured folder: its tab and the top of its front share one of five gradients
 * (`--folder1-top` … `--folder5-bottom`), picked by the sheet's position in the member's list.
 */
import type { Recency, SummaryPerson, SummaryStage } from '@/domain/summary'
import type { Warmth } from '@/domain/types'

export const FOLDER_COUNT = 5
export type FolderNumber = 1 | 2 | 3 | 4 | 5

/** Folder colour for the sheet at `index` in its member's list: 1 to 5, then round again. */
export function folderNumber(index: number): FolderNumber {
  const i = Number.isFinite(index) ? Math.trunc(index) : 0
  return ((((i % FOLDER_COUNT) + FOLDER_COUNT) % FOLDER_COUNT) + 1) as FolderNumber
}

/** "01", "02" … the sheet's position as shown on its tab and folder front. */
export function sheetNumber(index: number): string {
  return String(Math.max(0, Math.trunc(index)) + 1).padStart(2, '0')
}

export function folderTop(folder: FolderNumber): string {
  return `var(--folder${folder}-top)`
}

export function folderBottom(folder: FolderNumber): string {
  return `var(--folder${folder}-bottom)`
}

/** The tab face and its ear: the folder's two stops, top to bottom. */
export function tabGradient(folder: FolderNumber): string {
  return `linear-gradient(180deg, ${folderTop(folder)}, ${folderBottom(folder)})`
}

function mix(colour: string, percent: number): string {
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`
}

/**
 * The folder front continues the tab's lower colour and fades to the page. Folded, it keeps more
 * of the colour so the single line still reads as the folder.
 */
export function faceBackground(folder: FolderNumber, open: boolean): string {
  const bottom = folderBottom(folder)
  const image = open
    ? `linear-gradient(180deg, ${bottom} 0%, ${mix(bottom, 62)} 24%, ${mix(bottom, 24)} 56%, transparent 100%)`
    : `linear-gradient(180deg, ${bottom}, ${mix(bottom, 45)})`
  return `${image}, var(--bg)`
}

/** Number of capsule shades, `--capsule1` (lightest in light mode) to `--capsule8`. */
export const CAPSULE_STEPS = 8

/** A stage's shade of the blue ramp (1 to 8) for stage `index` of `count`: evenly first to last. */
export function capsuleStep(index: number, count: number): number {
  if (count <= 1) return 5
  return Math.round((index * (CAPSULE_STEPS - 1)) / (count - 1)) + 1
}

/** Fill of a person's square: their warmth, deeper when touched more recently. */
export function warmthShade(warmth: Warmth, recency: 0 | 1 | 2): string {
  return `var(--${warmth}-shade${recency + 1})`
}

/** Index of the last stage anyone reached, or -1 when nobody has. */
export function lastReachedIndex(reached: readonly number[]): number {
  let last = -1
  reached.forEach((value, i) => {
    if (value > 0) last = i
  })
  return last
}

/**
 * The blue for those who went further at stage `index` of `count`: `--capsule3` to `--capsule8`.
 * The palest two steps are left out, so even the first stage's squares read against the card.
 */
export function pixelStep(index: number, count: number): number {
  if (count <= 1) return 6
  return 3 + Math.round((index * (CAPSULE_STEPS - 3)) / (count - 1))
}

/** Rows of squares in the pixel pipeline: its height. */
export const PIXEL_ROWS = 7
/** At most this many squares across one stage; wider data makes each square stand for more people. */
export const PIXEL_MAX_COLUMNS = 6

const WARMTH_ORDER: readonly (Warmth | null)[] = ['warm', 'waiting', 'cold', null]

export type PixelCell =
  /** Someone at this stage now (or, when a square stands for several, a group of them). */
  | { kind: 'here'; warmth: Warmth | null; recency: Recency; person: SummaryPerson | null }
  /** Someone lost at this stage. */
  | { kind: 'stopped' }
  /** Someone who reached this stage and went further. */
  | { kind: 'went-on' }

export interface PixelStage {
  index: number
  /** Bottom-up, filling each row left to right: who is here, who stopped here, who went on. */
  cells: PixelCell[]
  /** The stage's shade of the blue ramp (`--capsule3` … `--capsule8`), for those who went on. */
  step: number
}

export interface PixelPipeline {
  /** People per square: 1 unless the busiest stage outgrows the grid. */
  unit: number
  /** Squares across each stage: as few as fit the busiest stage in the rows, so bars stay tall. */
  columns: number
  rows: number
  stages: PixelStage[]
}

function byWarmthThenRecency(a: SummaryPerson, b: SummaryPerson): number {
  return WARMTH_ORDER.indexOf(a.warmth) - WARMTH_ORDER.indexOf(b.warmth) || b.recency - a.recency
}

/** `people` as `count` squares, shared between warmth groups by largest remainder. */
function groupedSquares(people: readonly SummaryPerson[], count: number): PixelCell[] {
  if (count <= 0) return []
  const groups = WARMTH_ORDER.map((warmth) => {
    const members = people.filter((p) => p.warmth === warmth)
    const exact = (members.length / people.length) * count
    return {
      warmth,
      recency: Math.max(0, ...members.map((p) => p.recency)) as Recency,
      squares: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    }
  })
  let left = count - groups.reduce((sum, g) => sum + g.squares, 0)
  for (const g of [...groups].sort((a, b) => b.remainder - a.remainder)) {
    if (left <= 0) break
    if (g.remainder > 0) {
      g.squares += 1
      left -= 1
    }
  }
  return groups.flatMap((g) =>
    Array.from({ length: g.squares }, () => ({
      kind: 'here' as const,
      warmth: g.warmth,
      recency: g.recency,
      person: null,
    })),
  )
}

/**
 * The pipeline as stacks of squares (D-053), one stack per stage, read like a pixel bar chart:
 * a stage's height is everyone who reached it. At the bottom sit the people there now in their
 * warmth colour, then those lost there, then those who went further, in the stage's blue.
 */
export function pixelPipeline(
  stages: readonly SummaryStage[],
  rows = PIXEL_ROWS,
  maxColumns = PIXEL_MAX_COLUMNS,
): PixelPipeline {
  const busiest = stages.reduce((max, s) => Math.max(max, s.reached), 0)
  const unit = Math.max(1, Math.ceil(busiest / (rows * maxColumns)))
  const squares = (people: number) => (people > 0 ? Math.max(1, Math.round(people / unit)) : 0)
  const columns = Math.max(2, Math.min(maxColumns, Math.ceil(squares(busiest) / rows)))
  return {
    unit,
    columns,
    rows,
    stages: stages.map((stage) => {
      const here: PixelCell[] =
        unit === 1
          ? [...stage.here].sort(byWarmthThenRecency).map((person) => ({
              kind: 'here' as const,
              warmth: person.warmth,
              recency: person.recency,
              person,
            }))
          : groupedSquares(stage.here, squares(stage.here.length))
      const stopped = squares(stage.stopped)
      const wentOn = Math.max(0, squares(stage.reached) - here.length - stopped)
      return {
        index: stage.index,
        step: pixelStep(stage.index, stages.length),
        cells: [
          ...here,
          ...Array.from({ length: stopped }, () => ({ kind: 'stopped' as const })),
          ...Array.from({ length: wentOn }, () => ({ kind: 'went-on' as const })),
        ].slice(0, rows * columns),
      }
    }),
  }
}
