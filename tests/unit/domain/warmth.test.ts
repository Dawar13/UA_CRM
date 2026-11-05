import { describe, expect, it } from 'vitest'
import { historyEntrySchema, rowSchema } from '@/domain/schemas'
import {
  nextWarmth,
  setWarmth,
  warmthCycle,
  warmthLabel,
  warmthShortcut,
  warmthTokens,
} from '@/domain/warmth'
import { makeCtx, makeRow, now } from './_fixtures'

const ctx = makeCtx()

describe('warmth constants', () => {
  it('cycles empty → warm → waiting → cold → empty', () => {
    expect(warmthCycle).toEqual([null, 'warm', 'waiting', 'cold'])
    expect(nextWarmth(null)).toBe('warm')
    expect(nextWarmth('warm')).toBe('waiting')
    expect(nextWarmth('waiting')).toBe('cold')
    expect(nextWarmth('cold')).toBeNull()
  })

  it('labels each value', () => {
    expect(warmthLabel('warm')).toBe('Warm')
    expect(warmthLabel('waiting')).toBe('Waiting')
    expect(warmthLabel('cold')).toBe('Cold')
    expect(warmthLabel(null)).toBe('No warmth')
  })

  it('maps menu shortcuts', () => {
    expect(warmthShortcut('warm')).toBe('1')
    expect(warmthShortcut('waiting')).toBe('2')
    expect(warmthShortcut('cold')).toBe('3')
    expect(warmthShortcut(null)).toBe('0')
  })

  it('names the semantic tokens', () => {
    expect(warmthTokens('warm')).toEqual({ fg: '--warm', bg: '--warm-bg' })
    expect(warmthTokens('waiting')).toEqual({ fg: '--waiting', bg: '--waiting-bg' })
    expect(warmthTokens('cold')).toEqual({ fg: '--cold', bg: '--cold-bg' })
    expect(warmthTokens(null)).toBeNull()
  })
})

describe('setWarmth', () => {
  it('sets warmth from empty', () => {
    const { row, history } = setWarmth(makeRow(), 'warm', ctx)
    expect(row.warmth).toBe('warm')
    expect(row.updatedAt).toBe(now.toISOString())
    expect(row.updatedBy).toBe('member-dawar')
    expect(row.lastTouchAt).toBe(now.toISOString())
    expect(history).toEqual({
      id: 'h-1',
      rowId: 'row-1',
      kind: 'warmth',
      source: 'system',
      at: now.toISOString(),
      fuzzyDate: null,
      text: 'Warmth set to Warm',
      memberId: 'member-dawar',
      meta: { fromWarmth: null, toWarmth: 'warm' },
    })
    expect(rowSchema.safeParse(row).success).toBe(true)
    expect(historyEntrySchema.safeParse(history).success).toBe(true)
  })

  it('changes warmth', () => {
    const { row, history } = setWarmth(makeRow({ warmth: 'warm' }), 'cold', ctx)
    expect(row.warmth).toBe('cold')
    expect(history.text).toBe('Warmth: Warm → Cold')
    expect(history.meta).toEqual({ fromWarmth: 'warm', toWarmth: 'cold' })
  })

  it('clears warmth', () => {
    const { row, history } = setWarmth(makeRow({ warmth: 'waiting' }), null, ctx)
    expect(row.warmth).toBeNull()
    expect(history.text).toBe('Warmth cleared')
    expect(history.meta).toEqual({ fromWarmth: 'waiting', toWarmth: null })
  })

  it('records setting the same value as a set', () => {
    expect(setWarmth(makeRow({ warmth: 'cold' }), 'cold', ctx).history.text).toBe(
      'Warmth set to Cold',
    )
  })

  it('marks undo entries', () => {
    const { history } = setWarmth(makeRow({ warmth: 'cold' }), 'warm', ctx, { undo: true })
    expect(history.meta).toEqual({ fromWarmth: 'cold', toWarmth: 'warm', undo: true })
    expect(setWarmth(makeRow(), 'warm', ctx, { undo: false }).history.meta).not.toHaveProperty(
      'undo',
    )
  })

  it('cycles a row through every value and back with W', () => {
    let row = makeRow()
    const texts: string[] = []
    for (let i = 0; i < 4; i++) {
      const change = setWarmth(row, nextWarmth(row.warmth), ctx)
      row = change.row
      texts.push(change.history.text)
    }
    expect(row.warmth).toBeNull()
    expect(texts).toEqual([
      'Warmth set to Warm',
      'Warmth: Warm → Waiting',
      'Warmth: Waiting → Cold',
      'Warmth cleared',
    ])
  })

  it('does not mutate the input row', () => {
    const input = makeRow({ warmth: 'warm' })
    setWarmth(input, 'cold', ctx)
    expect(input.warmth).toBe('warm')
    expect(input.lastTouchAt).toBeNull()
  })
})
