import { describe, expect, it } from 'vitest'
import {
  capsuleGeometry,
  capsuleStep,
  faceBackground,
  folderNumber,
  lastReachedIndex,
  sheetNumber,
  tabGradient,
  warmthShade,
} from '@/features/sheet-summary/folder'

describe('folder colours', () => {
  it('cycles through the five folders by position', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(folderNumber)).toEqual([1, 2, 3, 4, 5, 1, 2, 1])
    expect(folderNumber(-1)).toBe(5)
    expect(folderNumber(Number.NaN)).toBe(1)
  })

  it('numbers sheets from 01', () => {
    expect(sheetNumber(0)).toBe('01')
    expect(sheetNumber(9)).toBe('10')
    expect(sheetNumber(-3)).toBe('01')
  })

  it('builds the tab and face gradients from tokens only', () => {
    expect(tabGradient(3)).toBe(
      'linear-gradient(180deg, var(--folder3-top), var(--folder3-bottom))',
    )
    const open = faceBackground(2, true)
    expect(open).toContain('var(--folder2-bottom) 0%')
    expect(open).toContain('color-mix(in srgb, var(--folder2-bottom) 62%, transparent) 24%')
    expect(open).toContain('color-mix(in srgb, var(--folder2-bottom) 24%, transparent) 56%')
    expect(open.endsWith('transparent 100%), var(--bg)')).toBe(true)
    expect(faceBackground(2, false)).toBe(
      'linear-gradient(180deg, var(--folder2-bottom), color-mix(in srgb, var(--folder2-bottom) 45%, transparent)), var(--bg)',
    )
    for (const value of [tabGradient(1), open]) expect(value).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('shades people by warmth and recency', () => {
    expect(warmthShade('warm', 0)).toBe('var(--warm-shade1)')
    expect(warmthShade('cold', 2)).toBe('var(--cold-shade3)')
  })
})

describe('capsule', () => {
  it('steps the capsule shades evenly from the first stage to the last', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => capsuleStep(i, 7))).toEqual([1, 2, 3, 5, 6, 7, 8])
    expect([0, 1, 2].map((i) => capsuleStep(i, 3))).toEqual([1, 5, 8])
    expect(capsuleStep(0, 1)).toBe(5)
  })

  it('finds the last stage anyone reached', () => {
    expect(lastReachedIndex([5, 3, 2, 1, 0, 0, 0])).toBe(3)
    expect(lastReachedIndex([0, 0])).toBe(-1)
    expect(lastReachedIndex([])).toBe(-1)
  })

  it('draws nothing without width or without anyone in the pipeline', () => {
    expect(capsuleGeometry([3, 1], 0, 56)).toBeNull()
    expect(capsuleGeometry([0, 0, 0], 600, 56)).toBeNull()
    expect(capsuleGeometry([], 600, 56)).toBeNull()
  })

  it('has one band per stage up to the last reached stage, 1px apart', () => {
    const geometry = capsuleGeometry([5, 3, 2, 1, 0, 0, 0], 700, 56)
    if (!geometry) throw new Error('expected a capsule')
    expect(geometry.bands.map((b) => b.index)).toEqual([0, 1, 2, 3])
    expect(geometry.bands.map((b) => b.step)).toEqual([1, 2, 3, 5])
    // 100px columns: the first band starts at 0, the others 1px in, each leaves a 1px gap.
    expect(geometry.bands.map((b) => [b.x, b.width])).toEqual([
      [0, 99],
      [101, 98],
      [201, 98],
      [301, 99],
    ])
  })

  it('is round at both ends and tapers with the numbers', () => {
    const geometry = capsuleGeometry([12, 10, 8, 6, 3, 2, 1], 700, 56)
    if (!geometry) throw new Error('expected a capsule')
    const { path } = geometry
    // Starts on the top of the left cap: half-thickness 28 (full height) at x = 28.
    expect(path.startsWith('M 28 0 ')).toBe(true)
    // The left cap is a semicircle of radius 28; the right cap's radius follows the last stage:
    // 6 + (1 / 12) × 22 ≈ 7.83, ending 2px before the column edge.
    expect(path).toMatch(/A 28 28 0 0 1 28 0 Z$/)
    expect(path).toContain('A 7.83 7.83 0 0 1 690.17 35.83')
    expect(geometry.bands).toHaveLength(7)
  })

  it('never runs backwards in narrow space', () => {
    const geometry = capsuleGeometry([10, 10, 10], 60, 56)
    if (!geometry) throw new Error('expected a capsule')
    const xs = [...geometry.path.matchAll(/C [\d.]+ [\d.]+ [\d.]+ [\d.]+ ([\d.]+) /g)].map((m) =>
      Number(m[1]),
    )
    const top = xs.slice(0, xs.length / 2)
    for (let i = 1; i < top.length; i++) expect(top[i]).toBeGreaterThan(top[i - 1] as number)
  })
})
