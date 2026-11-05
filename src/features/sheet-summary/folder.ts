/**
 * Folder colours and pipeline geometry for the sheet tabs and the folder front. Pure.
 *
 * Each sheet is a coloured folder: its tab and the top of its front share one of five gradients
 * (`--folder1-top` … `--folder5-bottom`), picked by the sheet's position in the member's list.
 */
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

/** Capsule shade (1 to 8) for stage `index` of `count`: evenly from first to last. */
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

export interface CapsuleBand {
  index: number
  x: number
  width: number
  step: number
}

export interface CapsuleGeometry {
  /** Outline of the tapered capsule, used as a clip path. */
  path: string
  /** One band per stage up to the last reached stage, 1px apart. */
  bands: CapsuleBand[]
}

const MIN_HALF = 6

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * One long tapered capsule across `width` × `height`. Each stage owns an equal column; the
 * capsule's half-thickness at a column centre follows how many reached that stage, with smooth
 * curves between centres, a round cap on the left and a round cap at the end of the last stage
 * anyone reached. Nothing is drawn past that stage. Null when there is nothing to draw.
 */
export function capsuleGeometry(
  reached: readonly number[],
  width: number,
  height: number,
): CapsuleGeometry | null {
  const count = reached.length
  const last = lastReachedIndex(reached)
  if (count === 0 || last < 0 || !(width > 0) || !(height > 0)) return null

  const cy = height / 2
  const max = Math.max(1, ...reached)
  const col = width / count
  const half = (value: number) => Math.min(cy, MIN_HALF + (value / max) * (cy - MIN_HALF))
  const h0 = half(reached[0] ?? 0)
  const hLast = half(reached[last] ?? 0)
  const end = (last + 1) * col - 2

  // Control points along the top edge: [x, half-thickness], with x always moving right.
  const points: [number, number][] = [[h0, h0]]
  for (let i = 0; i <= last; i++) points.push([col * (i + 0.5), half(reached[i] ?? 0)])
  points.push([end - hLast, hLast])
  for (let k = 1; k < points.length; k++) {
    const prev = points[k - 1] as [number, number]
    const point = points[k] as [number, number]
    if (point[0] < prev[0] + 0.5) point[0] = prev[0] + 0.5
  }

  const at = (k: number) => points[k] as [number, number]
  const first = at(0)
  const tail = at(points.length - 1)
  let d = `M ${round(first[0])} ${round(cy - first[1])}`
  for (let k = 1; k < points.length; k++) {
    const [x0, h0k] = at(k - 1)
    const [x1, h1] = at(k)
    const mx = round((x0 + x1) / 2)
    d += ` C ${mx} ${round(cy - h0k)} ${mx} ${round(cy - h1)} ${round(x1)} ${round(cy - h1)}`
  }
  d += ` A ${round(tail[1])} ${round(tail[1])} 0 0 1 ${round(tail[0])} ${round(cy + tail[1])}`
  for (let k = points.length - 1; k > 0; k--) {
    const [x1, h1] = at(k)
    const [x0, h0k] = at(k - 1)
    const mx = round((x0 + x1) / 2)
    d += ` C ${mx} ${round(cy + h1)} ${mx} ${round(cy + h0k)} ${round(x0)} ${round(cy + h0k)}`
  }
  d += ` A ${round(first[1])} ${round(first[1])} 0 0 1 ${round(first[0])} ${round(cy - first[1])} Z`

  const bands: CapsuleBand[] = []
  for (let i = 0; i <= last; i++) {
    const x = i * col + (i > 0 ? 1 : 0)
    const w = col - (i > 0 ? 1 : 0) - (i < last ? 1 : 0)
    bands.push({ index: i, x: round(x), width: round(Math.max(0, w)), step: capsuleStep(i, count) })
  }
  return { path: d, bands }
}
