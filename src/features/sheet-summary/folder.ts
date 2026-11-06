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

/** Funnel band shade (1 to 8) for stage `index` of `count`: evenly from first to last. */
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
  /** Outline of the funnel, used as a clip path. */
  path: string
  /** One band per stage up to the last reached stage, 1px apart. */
  bands: CapsuleBand[]
}

const MIN_HALF = 6

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The pipeline as a horizontal funnel across `width` × `height`. Each stage owns an equal column.
 * The funnel opens with a flat, full-height mouth on the left (everyone who reached the first
 * stage) and narrows through each stage boundary in proportion to how many reached that stage,
 * along monotone curves (Fritsch–Carlson) so the sides never bulge, to a rounded spout at the end
 * of the last stage anyone reached. Nothing is drawn past it. Null when there is nothing to draw.
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
  const end = (last + 1) * col - 2
  const tip = Math.max(MIN_HALF * 0.75, half(reached[last] ?? 0) * 0.7)

  // The top edge at each stage boundary: [x, half-thickness], then the spout.
  const points: [number, number][] = []
  for (let i = 0; i <= last; i++) points.push([i * col, half(reached[i] ?? 0)])
  points.push([Math.max(end - tip, last * col + 1), tip])
  const n = points.length
  const xs = points.map((p) => p[0])
  const hs = points.map((p) => p[1])

  // Monotone cubic slopes (Fritsch–Carlson).
  const secants: number[] = []
  for (let k = 0; k < n - 1; k++) {
    const dx = (xs[k + 1] as number) - (xs[k] as number)
    secants.push(dx > 0 ? ((hs[k + 1] as number) - (hs[k] as number)) / dx : 0)
  }
  const slopes: number[] = new Array(n).fill(0)
  slopes[0] = secants[0] ?? 0
  slopes[n - 1] = secants[n - 2] ?? 0
  for (let k = 1; k < n - 1; k++) {
    const a = secants[k - 1] as number
    const b = secants[k] as number
    slopes[k] = a * b <= 0 ? 0 : (a + b) / 2
  }
  for (let k = 0; k < n - 1; k++) {
    const s = secants[k] as number
    if (s === 0) {
      slopes[k] = 0
      slopes[k + 1] = 0
      continue
    }
    const a = (slopes[k] as number) / s
    const b = (slopes[k + 1] as number) / s
    const r = a * a + b * b
    if (r > 9) {
      const t = 3 / Math.sqrt(r)
      slopes[k] = t * a * s
      slopes[k + 1] = t * b * s
    }
  }

  const x = (k: number) => xs[k] as number
  const h = (k: number) => hs[k] as number
  const m = (k: number) => slopes[k] as number
  let d = `M ${round(x(0))} ${round(cy - h(0))}`
  for (let k = 0; k < n - 1; k++) {
    const third = (x(k + 1) - x(k)) / 3
    d += ` C ${round(x(k) + third)} ${round(cy - (h(k) + m(k) * third))} ${round(x(k + 1) - third)} ${round(cy - (h(k + 1) - m(k + 1) * third))} ${round(x(k + 1))} ${round(cy - h(k + 1))}`
  }
  d += ` A ${round(h(n - 1))} ${round(h(n - 1))} 0 0 1 ${round(x(n - 1))} ${round(cy + h(n - 1))}`
  for (let k = n - 1; k > 0; k--) {
    const third = (x(k) - x(k - 1)) / 3
    d += ` C ${round(x(k) - third)} ${round(cy + (h(k) - m(k) * third))} ${round(x(k - 1) + third)} ${round(cy + (h(k - 1) + m(k - 1) * third))} ${round(x(k - 1))} ${round(cy + h(k - 1))}`
  }
  d += ' Z'

  const bands: CapsuleBand[] = []
  for (let i = 0; i <= last; i++) {
    const x = i * col + (i > 0 ? 1 : 0)
    const w = col - (i > 0 ? 1 : 0) - (i < last ? 1 : 0)
    bands.push({ index: i, x: round(x), width: round(Math.max(0, w)), step: capsuleStep(i, count) })
  }
  return { path: d, bands }
}
