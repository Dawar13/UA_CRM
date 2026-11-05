import { describe, expect, it } from 'vitest'
import { historyEntrySchema, rowSchema } from '@/domain/schemas'
import {
  effectiveStageIndex,
  isWon,
  markLost,
  moveToStage,
  nextStageIndex,
  previousStageIndex,
  reopen,
  restoreStage,
  STAGE_RAMP_STEPS,
  snapshotStage,
  stageRampStep,
  stageState,
  stageView,
} from '@/domain/stages'
import type { Row, Sheet } from '@/domain/types'
import { makeCtx, makeRow, makeSheet, now, sid } from './_fixtures'

const sheet = makeSheet('customers')
const connectors = makeSheet('connectors')
const ctx = makeCtx()

/** A row at First call (index 2), reached on dated stages. */
function atFirstCall(): Row {
  return makeRow({
    stageIndex: 2,
    stageDates: {
      [sid(sheet, 0)]: '2026-10-01',
      [sid(sheet, 1)]: '2026-10-08',
      [sid(sheet, 2)]: '2026-10-15',
    },
    lastTouchAt: '2026-10-15T05:00:00.000Z',
  })
}

function states(row: Row, s: Sheet = sheet): string[] {
  return s.stages.map((_, i) => stageState(row, s, i))
}

describe('moveToStage', () => {
  it('sets the first stage from no stage and stamps today in IST', () => {
    const { row, history } = moveToStage(makeRow(), sheet, 0, ctx)
    expect(row.stageIndex).toBe(0)
    expect(row.stageDates).toEqual({ [sid(sheet, 0)]: '2026-11-05' })
    expect(history).toEqual({
      id: 'h-1',
      rowId: 'row-1',
      kind: 'stage',
      source: 'system',
      at: now.toISOString(),
      fuzzyDate: null,
      text: 'Stage set to Identified',
      memberId: 'member-dawar',
      meta: { fromStageIndex: null, toStageIndex: 0 },
    })
  })

  it('stamps the row as updated and touched by the actor', () => {
    const { row } = moveToStage(atFirstCall(), sheet, 3, makeCtx(now, 'member-dhruv'))
    expect(row.updatedAt).toBe(now.toISOString())
    expect(row.updatedBy).toBe('member-dhruv')
    expect(row.lastTouchAt).toBe(now.toISOString())
  })

  it('produces a row and history entry that satisfy the schemas', () => {
    const change = moveToStage(atFirstCall(), sheet, 5, ctx)
    expect(rowSchema.parse(change.row)).toEqual(change.row)
    expect(historyEntrySchema.parse(change.history)).toEqual(change.history)
  })

  it('marks never-reached stages as done with no date when jumping ahead from none', () => {
    const { row } = moveToStage(makeRow(), sheet, 3, ctx)
    expect(row.stageDates).toEqual({
      [sid(sheet, 0)]: null,
      [sid(sheet, 1)]: null,
      [sid(sheet, 2)]: null,
      [sid(sheet, 3)]: '2026-11-05',
    })
    expect(states(row)).toEqual(['done', 'done', 'done', 'current', 'future', 'future', 'future'])
  })

  it('moves forward, keeping earlier dates and skipping intermediate stages without a date', () => {
    const { row, history } = moveToStage(atFirstCall(), sheet, 4, ctx)
    expect(row.stageIndex).toBe(4)
    expect(row.stageDates).toEqual({
      [sid(sheet, 0)]: '2026-10-01',
      [sid(sheet, 1)]: '2026-10-08',
      [sid(sheet, 2)]: '2026-10-15',
      [sid(sheet, 3)]: null,
      [sid(sheet, 4)]: '2026-11-05',
    })
    expect(history.text).toBe('Stage: First call → Pilot scoped')
    expect(history.meta).toEqual({ fromStageIndex: 2, toStageIndex: 4 })
  })

  it('moves back over skipped stages, removing every key after the target', () => {
    const ahead = moveToStage(atFirstCall(), sheet, 5, ctx).row
    expect(ahead.stageDates[sid(sheet, 3)]).toBeNull()
    expect(ahead.stageDates[sid(sheet, 4)]).toBeNull()

    const { row, history } = moveToStage(ahead, sheet, 1, ctx)
    expect(row.stageIndex).toBe(1)
    // The target keeps the date it was first reached; later stages are no longer reached.
    expect(row.stageDates).toEqual({
      [sid(sheet, 0)]: '2026-10-01',
      [sid(sheet, 1)]: '2026-10-08',
    })
    expect(history.text).toBe('Stage: Pilot live → Intro asked')
    expect(history.meta).toEqual({ fromStageIndex: 5, toStageIndex: 1 })
  })

  it('moves back onto a skipped stage and keeps it without a date', () => {
    const ahead = moveToStage(makeRow(), sheet, 4, ctx).row
    const { row } = moveToStage(ahead, sheet, 2, ctx)
    expect(row.stageDates).toEqual({
      [sid(sheet, 0)]: null,
      [sid(sheet, 1)]: null,
      [sid(sheet, 2)]: null,
    })
    expect(stageView(row, sheet)[2]).toMatchObject({ state: 'current', date: null })
  })

  it('stamps a stage again with today after moving back past it and forward again', () => {
    const back = moveToStage(atFirstCall(), sheet, 1, ctx).row
    const later = makeCtx(new Date('2026-11-12T06:00:00.000Z'))
    const { row } = moveToStage(back, sheet, 2, later)
    expect(row.stageDates[sid(sheet, 2)]).toBe('2026-11-12')
    expect(row.stageDates[sid(sheet, 1)]).toBe('2026-10-08')
  })

  it('reopens a lost row when it moves', () => {
    const lost = markLost(atFirstCall(), sheet, ctx).row
    const { row, history } = moveToStage(lost, sheet, 3, ctx)
    expect(row.lost).toBeNull()
    expect(row.stageIndex).toBe(3)
    expect(history.meta).toEqual({ fromStageIndex: 2, toStageIndex: 3, reopened: true })
  })

  it('treats a move to the current stage as setting it, keeping its date', () => {
    const { row, history } = moveToStage(atFirstCall(), sheet, 2, ctx)
    expect(row.stageDates).toEqual(atFirstCall().stageDates)
    expect(history.text).toBe('Stage set to First call')
  })

  it('does not mutate the input row', () => {
    const input = atFirstCall()
    const copy = structuredClone(input)
    moveToStage(input, sheet, 6, ctx)
    moveToStage(input, sheet, 0, ctx)
    expect(input).toEqual(copy)
  })

  it('throws a RangeError for sheets without stages and indexes out of range', () => {
    expect(() => moveToStage(makeRow(), connectors, 0, ctx)).toThrow(RangeError)
    expect(() => moveToStage(makeRow(), sheet, -1, ctx)).toThrow(RangeError)
    expect(() => moveToStage(makeRow(), sheet, 7, ctx)).toThrow(RangeError)
    expect(() => moveToStage(makeRow(), sheet, 1.5, ctx)).toThrow(RangeError)
  })

  it('uses the IST calendar date, not the UTC one, near midnight', () => {
    // 19:00 UTC on 4 Nov is 00:30 IST on 5 Nov.
    const lateUtc = makeCtx(new Date('2026-11-04T19:00:00.000Z'))
    expect(moveToStage(makeRow(), sheet, 0, lateUtc).row.stageDates[sid(sheet, 0)]).toBe(
      '2026-11-05',
    )
    // 18:29:59 UTC on 5 Nov is 23:59:59 IST, still 5 Nov; 18:30 UTC is 6 Nov in IST.
    const beforeMidnight = makeCtx(new Date('2026-11-05T18:29:59.000Z'))
    const afterMidnight = makeCtx(new Date('2026-11-05T18:30:00.000Z'))
    expect(moveToStage(makeRow(), sheet, 0, beforeMidnight).row.stageDates[sid(sheet, 0)]).toBe(
      '2026-11-05',
    )
    expect(moveToStage(makeRow(), sheet, 0, afterMidnight).row.stageDates[sid(sheet, 0)]).toBe(
      '2026-11-06',
    )
  })
})

describe('markLost and reopen', () => {
  it('marks a row lost at its current stage with today in IST', () => {
    const { row, history } = markLost(atFirstCall(), sheet, ctx)
    expect(row.lost).toEqual({ stageIndex: 2, date: '2026-11-05' })
    expect(row.stageIndex).toBe(2)
    expect(row.stageDates).toEqual(atFirstCall().stageDates)
    expect(row.lastTouchAt).toBe(now.toISOString())
    expect(history).toMatchObject({
      kind: 'stage',
      source: 'system',
      text: 'Marked lost after First call',
      meta: { lost: true },
    })
    expect(rowSchema.safeParse(row).success).toBe(true)
  })

  it('shows the stopped stage as current and the lost marker at the next position', () => {
    const { row } = markLost(atFirstCall(), sheet, ctx)
    expect(states(row)).toEqual([
      'done',
      'done',
      'current',
      'lost-marker',
      'future',
      'future',
      'future',
    ])
    expect(isWon(row, sheet)).toBe(false)
  })

  it('marks a row with no stage lost at the first stage for display, keeping stageIndex null', () => {
    const { row, history } = markLost(makeRow(), sheet, ctx)
    expect(row.stageIndex).toBeNull()
    expect(row.lost).toEqual({ stageIndex: 0, date: '2026-11-05' })
    expect(effectiveStageIndex(row)).toBe(0)
    expect(history.text).toBe('Marked lost after Identified')
    expect(states(row).slice(0, 3)).toEqual(['current', 'lost-marker', 'future'])
  })

  it('has no lost marker when lost at the final stage', () => {
    const won = moveToStage(atFirstCall(), sheet, 6, ctx).row
    const { row } = markLost(won, sheet, ctx)
    expect(isWon(row, sheet)).toBe(false)
    expect(states(row)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'current'])
  })

  it('throws when already lost or when the sheet has no stages', () => {
    const lost = markLost(atFirstCall(), sheet, ctx).row
    expect(() => markLost(lost, sheet, ctx)).toThrow(RangeError)
    expect(() => markLost(makeRow(), connectors, ctx)).toThrow(RangeError)
  })

  it('reopens at the stage it stopped at, keeping the dates', () => {
    const lost = markLost(atFirstCall(), sheet, ctx).row
    const later = makeCtx(new Date('2026-11-06T04:30:00.000Z'), 'member-dhruv')
    const { row, history } = reopen(lost, sheet, later)
    expect(row.lost).toBeNull()
    expect(row.stageIndex).toBe(2)
    expect(row.stageDates).toEqual(atFirstCall().stageDates)
    expect(row.updatedBy).toBe('member-dhruv')
    expect(history).toMatchObject({
      kind: 'stage',
      text: 'Reopened at First call',
      memberId: 'member-dhruv',
      meta: { reopened: true },
    })
    expect(states(row)).toEqual(states(atFirstCall()))
  })

  it('reopens a row that had no stage back to no stage', () => {
    const lost = markLost(makeRow(), sheet, ctx).row
    const { row, history } = reopen(lost, sheet, ctx)
    expect(row.stageIndex).toBeNull()
    expect(row.lost).toBeNull()
    expect(history.text).toBe('Reopened')
    expect(states(row).every((s) => s === 'future')).toBe(true)
  })

  it('throws when reopening a row that is not lost', () => {
    expect(() => reopen(atFirstCall(), sheet, ctx)).toThrow(RangeError)
  })
})

describe('snapshotStage and restoreStage', () => {
  it('takes a deep copy', () => {
    const lost = markLost(atFirstCall(), sheet, ctx).row
    const snap = snapshotStage(lost)
    expect(snap).toEqual({ stageIndex: 2, stageDates: lost.stageDates, lost: lost.lost })
    expect(snap.stageDates).not.toBe(lost.stageDates)
    expect(snap.lost).not.toBe(lost.lost)
    expect(snapshotStage(makeRow()).lost).toBeNull()
  })

  it('restores a forward move exactly, as an undo entry', () => {
    const before = atFirstCall()
    const snap = snapshotStage(before)
    const moved = moveToStage(before, sheet, 4, ctx).row
    const { row, history } = restoreStage(moved, sheet, snap, ctx)
    expect(snapshotStage(row)).toEqual(snapshotStage(before))
    expect(row.stageDates).not.toBe(snap.stageDates)
    expect(history).toMatchObject({
      kind: 'stage',
      source: 'system',
      text: 'Stage restored to First call',
      meta: { undo: true, fromStageIndex: 4, toStageIndex: 2 },
    })
    expect(historyEntrySchema.safeParse(history).success).toBe(true)
  })

  it('restores a backward move, bringing back the cleared dates', () => {
    const before = moveToStage(atFirstCall(), sheet, 5, ctx).row
    const snap = snapshotStage(before)
    const back = moveToStage(before, sheet, 0, ctx).row
    const { row } = restoreStage(back, sheet, snap, ctx)
    expect(row.stageIndex).toBe(5)
    expect(row.stageDates).toEqual(before.stageDates)
  })

  it('undoes a reopen by restoring the lost state', () => {
    const lost = markLost(atFirstCall(), sheet, ctx).row
    const snap = snapshotStage(lost)
    const reopened = reopen(lost, sheet, ctx).row
    const { row, history } = restoreStage(reopened, sheet, snap, ctx)
    expect(row.lost).toEqual({ stageIndex: 2, date: '2026-11-05' })
    expect(history.text).toBe('Restored as lost after First call')
  })

  it('undoes a lost mark by restoring the open state', () => {
    const before = atFirstCall()
    const snap = snapshotStage(before)
    const lost = markLost(before, sheet, ctx).row
    const { row } = restoreStage(lost, sheet, snap, ctx)
    expect(row.lost).toBeNull()
    expect(snapshotStage(row)).toEqual(snap)
  })

  it('restores to no stage', () => {
    const snap = snapshotStage(makeRow())
    const moved = moveToStage(makeRow(), sheet, 3, ctx).row
    const { row, history } = restoreStage(moved, sheet, snap, ctx)
    expect(row.stageIndex).toBeNull()
    expect(row.stageDates).toEqual({})
    expect(history.text).toBe('Stage cleared')
    expect(history.meta).toEqual({ undo: true, fromStageIndex: 3, toStageIndex: null })
  })

  it('throws when the snapshot does not fit the sheet', () => {
    const bad = { stageIndex: 9, stageDates: {}, lost: null }
    expect(() => restoreStage(makeRow(), sheet, bad, ctx)).toThrow(RangeError)
    const badLost = {
      stageIndex: null,
      stageDates: {},
      lost: { stageIndex: 9, date: '2026-11-05' },
    }
    expect(() => restoreStage(makeRow(), sheet, badLost, ctx)).toThrow(RangeError)
  })
})

describe('isWon and stageState', () => {
  it('is won at the final stage when not lost', () => {
    const won = moveToStage(atFirstCall(), sheet, 6, ctx).row
    expect(isWon(won, sheet)).toBe(true)
    expect(states(won)).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'won'])
    expect(isWon(moveToStage(atFirstCall(), sheet, 5, ctx).row, sheet)).toBe(false)
    expect(isWon(makeRow(), sheet)).toBe(false)
    expect(isWon(makeRow({ stageIndex: 0 }), connectors)).toBe(false)
  })

  it('reports every state', () => {
    const lost = markLost(atFirstCall(), sheet, ctx).row
    expect(stageState(atFirstCall(), sheet, 0)).toBe('done')
    expect(stageState(atFirstCall(), sheet, 2)).toBe('current')
    expect(stageState(atFirstCall(), sheet, 3)).toBe('future')
    expect(stageState(lost, sheet, 3)).toBe('lost-marker')
    expect(stageState(lost, sheet, 4)).toBe('future')
    expect(stageState(moveToStage(makeRow(), sheet, 6, ctx).row, sheet, 6)).toBe('won')
    expect(stageState(makeRow(), sheet, 0)).toBe('future')
  })

  it('throws for positions outside the sheet', () => {
    expect(() => stageState(makeRow(), sheet, 7)).toThrow(RangeError)
    expect(() => stageState(makeRow(), connectors, 0)).toThrow(RangeError)
  })
})

describe('stageView', () => {
  it('lists every stage with its state and date', () => {
    const view = stageView(moveToStage(atFirstCall(), sheet, 4, ctx).row, sheet)
    expect(view).toHaveLength(7)
    expect(view.map((v) => [v.name, v.state, v.date])).toEqual([
      ['Identified', 'done', '2026-10-01'],
      ['Intro asked', 'done', '2026-10-08'],
      ['First call', 'done', '2026-10-15'],
      ['Plant visit', 'done', null],
      ['Pilot scoped', 'current', '2026-11-05'],
      ['Pilot live', 'future', null],
      ['Paid', 'future', null],
    ])
    expect(view[0]).toMatchObject({ id: sid(sheet, 0), index: 0 })
  })

  it('is empty for a sheet without stages', () => {
    expect(stageView(makeRow(), connectors)).toEqual([])
  })
})

describe('nextStageIndex and previousStageIndex', () => {
  it('steps forward and back', () => {
    expect(nextStageIndex(atFirstCall(), sheet)).toBe(3)
    expect(previousStageIndex(atFirstCall(), sheet)).toBe(1)
  })

  it('starts at the first stage from no stage', () => {
    expect(nextStageIndex(makeRow(), sheet)).toBe(0)
    expect(previousStageIndex(makeRow(), sheet)).toBeNull()
  })

  it('returns null at the ends', () => {
    expect(nextStageIndex(makeRow({ stageIndex: 6 }), sheet)).toBeNull()
    expect(previousStageIndex(makeRow({ stageIndex: 0 }), sheet)).toBeNull()
  })

  it('returns null when lost or without stages', () => {
    const lost = markLost(atFirstCall(), sheet, ctx).row
    expect(nextStageIndex(lost, sheet)).toBeNull()
    expect(previousStageIndex(lost, sheet)).toBeNull()
    expect(nextStageIndex(makeRow(), connectors)).toBeNull()
    expect(previousStageIndex(makeRow({ stageIndex: 1 }), connectors)).toBeNull()
  })
})

describe('stageRampStep', () => {
  const ramp = (count: number) =>
    Array.from({ length: count - 1 }, (_, i) => stageRampStep(i, count))

  it('spans light to deep over the open stages of a seven-stage sheet', () => {
    expect(ramp(7)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('spreads shorter pipelines across the whole ramp', () => {
    expect(ramp(6)).toEqual([1, 2, 4, 5, 6])
    expect(ramp(4)).toEqual([1, 4, 6])
    expect(ramp(3)).toEqual([1, 6])
  })

  it('uses the middle step for sheets with two stages or fewer', () => {
    expect(stageRampStep(0, 2)).toBe(4)
    expect(stageRampStep(1, 2)).toBe(4)
    expect(stageRampStep(0, 1)).toBe(4)
  })

  it('stays within the ramp, even for the win stage and long pipelines', () => {
    expect(stageRampStep(6, 7)).toBe(STAGE_RAMP_STEPS)
    expect(stageRampStep(-1, 7)).toBe(1)
    for (let count = 1; count <= 20; count++) {
      for (let i = 0; i < count; i++) {
        const step = stageRampStep(i, count)
        expect(step).toBeGreaterThanOrEqual(1)
        expect(step).toBeLessThanOrEqual(STAGE_RAMP_STEPS)
      }
    }
  })

  it('never gets lighter further along', () => {
    for (let count = 3; count <= 20; count++) {
      const steps = ramp(count)
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] ?? 0)
      }
    }
  })
})
