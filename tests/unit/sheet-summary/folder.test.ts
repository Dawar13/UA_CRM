import { describe, expect, it } from 'vitest'
import type { SummaryPerson, SummaryStage } from '@/domain/summary'
import type { Warmth } from '@/domain/types'
import {
  capsuleStep,
  faceBackground,
  folderNumber,
  lastReachedIndex,
  pixelPipeline,
  pixelStep,
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

describe('pixel pipeline', () => {
  const person = (id: string, warmth: Warmth | null, recency: 0 | 1 | 2 = 0): SummaryPerson => ({
    id,
    name: id,
    warmth,
    recency,
  })
  const stage = (
    index: number,
    reached: number,
    here: SummaryPerson[] = [],
    stopped = 0,
  ): SummaryStage => ({
    id: `s${index}`,
    name: `Stage ${index}`,
    index,
    reached,
    here,
    stopped,
    isWin: false,
  })

  it('steps the blue ramp evenly from the first stage to the last', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => capsuleStep(i, 7))).toEqual([1, 2, 3, 5, 6, 7, 8])
    expect([0, 1, 2].map((i) => capsuleStep(i, 3))).toEqual([1, 5, 8])
    expect(capsuleStep(0, 1)).toBe(5)
  })

  it('starts the went-further blue two steps in, so the first stage reads on the card', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => pixelStep(i, 7))).toEqual([3, 4, 5, 6, 6, 7, 8])
    expect(pixelStep(0, 1)).toBe(6)
  })

  it('finds the last stage anyone reached', () => {
    expect(lastReachedIndex([5, 3, 2, 1, 0, 0, 0])).toBe(3)
    expect(lastReachedIndex([0, 0])).toBe(-1)
    expect(lastReachedIndex([])).toBe(-1)
  })

  it('gives one square per person: who is here, who stopped here, who went on', () => {
    const grid = pixelPipeline([
      stage(0, 12, [person('cold', 'cold'), person('warm', 'warm', 1), person('warm2', 'warm', 2)]),
      stage(1, 9, [person('none', null)], 1),
      stage(2, 0),
    ])
    expect(grid).toMatchObject({ unit: 1, columns: 2, rows: 7 })
    const first = grid.stages[0]?.cells ?? []
    expect(first).toHaveLength(12)
    // Warm first, the more recently touched first; then cold; then everyone who went on.
    expect(first.slice(0, 3).map((c) => (c.kind === 'here' ? c.person?.id : c.kind))).toEqual([
      'warm2',
      'warm',
      'cold',
    ])
    expect(first.slice(3).every((c) => c.kind === 'went-on')).toBe(true)
    expect(grid.stages[1]?.cells.map((c) => c.kind)).toEqual([
      'here',
      'stopped',
      ...Array(7).fill('went-on'),
    ])
    expect(grid.stages[2]?.cells).toEqual([])
    expect(grid.stages.map((s) => s.step)).toEqual([3, 6, 8])
  })

  it('keeps bars tall: as few squares across as the busiest stage needs', () => {
    expect(pixelPipeline([stage(0, 3)]).columns).toBe(2)
    expect(pixelPipeline([stage(0, 30)]).columns).toBe(5)
    expect(pixelPipeline([stage(0, 42)]).columns).toBe(6)
  })

  it('lets a square stand for several people when the busiest stage outgrows the grid', () => {
    const here = [
      ...Array.from({ length: 6 }, (_, i) => person(`w${i}`, 'warm', 2)),
      ...Array.from({ length: 3 }, (_, i) => person(`c${i}`, 'cold')),
    ]
    const grid = pixelPipeline([stage(0, 100), stage(1, 40, here)])
    expect(grid.unit).toBe(3)
    expect(grid.columns).toBe(5)
    expect(grid.stages[0]?.cells).toHaveLength(33)
    const cells = grid.stages[1]?.cells ?? []
    expect(cells).toHaveLength(13)
    // Nine people in three squares, shared by warmth: two warm, one cold.
    expect(cells.slice(0, 3)).toEqual([
      { kind: 'here', warmth: 'warm', recency: 2, person: null },
      { kind: 'here', warmth: 'warm', recency: 2, person: null },
      { kind: 'here', warmth: 'cold', recency: 0, person: null },
    ])
  })

  it('never draws more squares than the grid holds, and nothing for an empty pipeline', () => {
    const grid = pixelPipeline([stage(0, 5, [], 9)])
    expect(grid.stages[0]?.cells.length).toBeLessThanOrEqual(grid.rows * grid.columns)
    expect(
      pixelPipeline([stage(0, 0), stage(1, 0)]).stages.every((s) => s.cells.length === 0),
    ).toBe(true)
  })
})
