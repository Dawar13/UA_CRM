/**
 * The UA brand mark: a 28px rounded square (radius 8) in --brand-500 with a white "UA"
 * monogram. The monogram is drawn as strokes, not text, so it renders identically in the
 * app, the favicon and exports without depending on a loaded font.
 *
 * If the founders supply a logo later, replace the files in src/assets/brand/ only.
 */
import { brand } from '../../styles/tokens.ts'

export const BRAND_MARK_SIZE = 28
export const BRAND_MARK_RADIUS = 8

/** Monogram strokes on a 28 × 28 grid. */
export const monogramPaths = {
  /** U: two stems joined by a round bowl. */
  u: 'M7 9v7a3 3 0 0 0 6 0V9',
  /** A: two legs meeting at the apex. */
  a: 'M14.5 19 17.5 9h0.5l3 10',
  /** A crossbar. */
  aBar: 'M15.6 15.4h4.3',
} as const

export const MONOGRAM_STROKE_WIDTH = 2.1

export function brandMarkSvg(fill: string = brand[500]): string {
  const s = BRAND_MARK_SIZE
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">`,
    `<rect width="${s}" height="${s}" rx="${BRAND_MARK_RADIUS}" fill="${fill}"/>`,
    `<g fill="none" stroke="#FFFFFF" stroke-width="${MONOGRAM_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">`,
    `<path d="${monogramPaths.u}"/>`,
    `<path d="${monogramPaths.a}"/>`,
    `<path d="${monogramPaths.aBar}"/>`,
    '</g></svg>',
  ].join('')
}

export const brandMarkDataUri = `data:image/svg+xml,${encodeURIComponent(brandMarkSvg())}`
