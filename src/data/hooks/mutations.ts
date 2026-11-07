/**
 * Row mutations: optimistic through the domain functions, rolled back on error, and confirmed
 * with an Undo toast. Undo applies the inverse through the repository, which records it in
 * history.
 */
import {
  type QueryClient,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  markLost as domainMarkLost,
  reopen as domainReopen,
  moveToStage,
  snapshotStage,
} from '@/domain/stages'
import type { DomainContext, HistoryEntry, Id, Row, RowChange, Sheet, Warmth } from '@/domain/types'
import { setWarmth, warmthLabel } from '@/domain/warmth'
import { type UndoEntry, useUndoStack } from '@/lib/undoStack'
import { useRepository } from '../RepositoryContext'
import type { MutationContext, MutationResult, Repository, RowLocation } from '../repository'
import { queryKeys, rowMutationKey } from './keys'

export const UNDO_TOAST_DURATION = 8000
export const SAVE_FAILED_MESSAGE = "Couldn't save the change. It has been undone."
export const UNDO_FAILED_MESSAGE = "Couldn't undo the change."

export type UndoKind = 'stage' | 'warmth'

/** Stable toast id per row and kind, so repeated changes replace the toast instead of stacking. */
export function undoToastId(kind: UndoKind, rowId: Id): string {
  return `undo-${kind}-${rowId}`
}

export interface MoveStageVariables {
  row: Row
  sheet: Sheet
  stageIndex: number
  actorId: Id
}
export interface StageActionVariables {
  row: Row
  sheet: Sheet
  actorId: Id
}
export interface SetWarmthVariables {
  row: Row
  warmth: Warmth | null
  actorId: Id
}

interface RowVariables {
  row: Row
  actorId: Id
}

interface CacheSnapshot {
  rows: Row[] | undefined
  row: Row | null | undefined
  location: RowLocation | null | undefined
  history: HistoryEntry[] | undefined
}

interface RowMutationSpec<V extends RowVariables> {
  kind: UndoKind
  run: (repo: Repository, vars: V, ctx: MutationContext) => Promise<MutationResult>
  optimistic: (vars: V, ctx: DomainContext) => RowChange
  message: (vars: V) => string
  /** Applies the inverse of the change; `vars.row` is the row as it was before. */
  undo: (repo: Repository, vars: V, ctx: MutationContext) => Promise<MutationResult>
}

let optimisticCounter = 0
const optimisticId = (): Id => {
  optimisticCounter += 1
  return `optimistic-${optimisticCounter}`
}

/** Mirrors what the repository does to the row with each change. */
function touch(change: RowChange, ctx: MutationContext): Row {
  const at = change.history.at
  const last = change.row.lastTouchAt
  return {
    ...change.row,
    lastTouchAt: last !== null && last > at ? last : at,
    updatedAt: ctx.now.toISOString(),
    updatedBy: ctx.actorId,
  }
}

export function writeRow(qc: QueryClient, row: Row): void {
  qc.setQueryData<Row[]>(queryKeys.rows(row.sheetId), (old) =>
    old?.map((r) => (r.id === row.id ? row : r)),
  )
  qc.setQueryData<Row | null>(queryKeys.row(row.id), (old) => (old === undefined ? old : row))
  qc.setQueryData<RowLocation | null>(queryKeys.rowLocation(row.id), (old) =>
    old ? { ...old, row } : old,
  )
}

function restoreSnapshot(qc: QueryClient, row: Row, snapshot: CacheSnapshot): void {
  qc.setQueryData(queryKeys.rows(row.sheetId), snapshot.rows)
  qc.setQueryData(queryKeys.row(row.id), snapshot.row)
  qc.setQueryData(queryKeys.rowLocation(row.id), snapshot.location)
  qc.setQueryData(queryKeys.history(row.id), snapshot.history)
}

export function invalidateRow(qc: QueryClient, row: Row): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.rows(row.sheetId) }),
    qc.invalidateQueries({ queryKey: queryKeys.row(row.id) }),
    qc.invalidateQueries({ queryKey: queryKeys.rowLocation(row.id) }),
    qc.invalidateQueries({ queryKey: queryKeys.history(row.id) }),
    qc.invalidateQueries({ queryKey: queryKeys.rowCounts(row.memberId) }),
    qc.invalidateQueries({ queryKey: queryKeys.memberRows(row.memberId) }),
    qc.invalidateQueries({ queryKey: ['memberHistory', row.memberId] }),
    qc.invalidateQueries({ queryKey: ['search'] }),
    // A next action's calendar event follows its edits (Phase 2).
    qc.invalidateQueries({ queryKey: ['events', row.memberId] }),
  ])
}

function useRowMutation<V extends RowVariables>(
  spec: RowMutationSpec<V>,
): UseMutationResult<MutationResult, Error, V, CacheSnapshot> {
  const repo = useRepository()
  const qc = useQueryClient()

  /** Runs a change through the repository and puts the saved row in the cache. */
  const apply = async (
    vars: V,
    run: (repo: Repository, vars: V, ctx: MutationContext) => Promise<MutationResult>,
  ): Promise<void> => {
    try {
      const result = await run(repo, vars, { actorId: vars.actorId, now: new Date() })
      writeRow(qc, result.row)
    } finally {
      await invalidateRow(qc, vars.row)
    }
  }

  return useMutation({
    mutationKey: rowMutationKey,
    mutationFn: (vars: V) => spec.run(repo, vars, { actorId: vars.actorId, now: new Date() }),
    onMutate: async (vars) => {
      const { row } = vars
      await Promise.all([
        qc.cancelQueries({ queryKey: queryKeys.rows(row.sheetId) }),
        qc.cancelQueries({ queryKey: queryKeys.row(row.id) }),
        qc.cancelQueries({ queryKey: queryKeys.rowLocation(row.id) }),
        qc.cancelQueries({ queryKey: queryKeys.history(row.id) }),
      ])
      const snapshot: CacheSnapshot = {
        rows: qc.getQueryData<Row[]>(queryKeys.rows(row.sheetId)),
        row: qc.getQueryData<Row | null>(queryKeys.row(row.id)),
        location: qc.getQueryData<RowLocation | null>(queryKeys.rowLocation(row.id)),
        history: qc.getQueryData<HistoryEntry[]>(queryKeys.history(row.id)),
      }
      const ctx: MutationContext = { actorId: vars.actorId, now: new Date() }
      const change = spec.optimistic(vars, { ...ctx, newId: optimisticId })
      writeRow(qc, touch(change, ctx))
      if (snapshot.history) {
        qc.setQueryData(queryKeys.history(row.id), [change.history, ...snapshot.history])
      }
      return snapshot
    },
    onError: (_error, vars, snapshot) => {
      if (snapshot) restoreSnapshot(qc, vars.row, snapshot)
      toast.error(SAVE_FAILED_MESSAGE, { id: undoToastId(spec.kind, vars.row.id) })
    },
    onSuccess: (result, vars) => {
      writeRow(qc, result.row)
      const entry: UndoEntry = {
        label: spec.message(vars),
        undo: () => apply(vars, spec.undo),
        redo: () => apply(vars, spec.run),
      }
      useUndoStack.getState().push(entry)
      toast(spec.message(vars), {
        id: undoToastId(spec.kind, vars.row.id),
        duration: UNDO_TOAST_DURATION,
        action: {
          label: 'Undo',
          onClick: () => {
            void useUndoStack.getState().undoEntry(entry)
          },
        },
      })
    },
    onSettled: async (_data, _error, vars) => {
      // With several changes in flight, refetch once the last one settles so an early refetch
      // does not overwrite a later optimistic update.
      if (qc.isMutating({ mutationKey: rowMutationKey }) <= 1) await invalidateRow(qc, vars.row)
    },
  })
}

export function useMoveStage(): UseMutationResult<
  MutationResult,
  Error,
  MoveStageVariables,
  CacheSnapshot
> {
  return useRowMutation<MoveStageVariables>({
    kind: 'stage',
    run: (repo, v, ctx) => repo.updateStage(v.row.id, v.stageIndex, ctx),
    optimistic: (v, ctx) => moveToStage(v.row, v.sheet, v.stageIndex, ctx),
    message: (v) => `Moved to ${v.sheet.stages[v.stageIndex]?.name ?? 'the next stage'}`,
    undo: (repo, v, ctx) => repo.restoreStage(v.row.id, snapshotStage(v.row), ctx),
  })
}

export function useMarkLost(): UseMutationResult<
  MutationResult,
  Error,
  StageActionVariables,
  CacheSnapshot
> {
  return useRowMutation<StageActionVariables>({
    kind: 'stage',
    run: (repo, v, ctx) => repo.markLost(v.row.id, ctx),
    optimistic: (v, ctx) => domainMarkLost(v.row, v.sheet, ctx),
    message: () => 'Marked lost',
    undo: (repo, v, ctx) => repo.restoreStage(v.row.id, snapshotStage(v.row), ctx),
  })
}

export function useReopen(): UseMutationResult<
  MutationResult,
  Error,
  StageActionVariables,
  CacheSnapshot
> {
  return useRowMutation<StageActionVariables>({
    kind: 'stage',
    run: (repo, v, ctx) => repo.reopen(v.row.id, ctx),
    optimistic: (v, ctx) => domainReopen(v.row, v.sheet, ctx),
    message: () => 'Reopened',
    undo: (repo, v, ctx) => repo.restoreStage(v.row.id, snapshotStage(v.row), ctx),
  })
}

export function useSetWarmth(): UseMutationResult<
  MutationResult,
  Error,
  SetWarmthVariables,
  CacheSnapshot
> {
  return useRowMutation<SetWarmthVariables>({
    kind: 'warmth',
    run: (repo, v, ctx) => repo.updateWarmth(v.row.id, v.warmth, ctx),
    optimistic: (v, ctx) => setWarmth(v.row, v.warmth, ctx),
    message: (v) => (v.warmth ? `Warmth set to ${warmthLabel(v.warmth)}` : 'Warmth cleared'),
    undo: (repo, v, ctx) => repo.updateWarmth(v.row.id, v.row.warmth, ctx, { undo: true }),
  })
}

export interface CopyRowVariables {
  row: Row
  destination: Sheet
  actorId: Id
}

/** "Copy to my sheet": a linked copy of another member's contact in one of the actor's sheets. */
export function useCopyRow(): UseMutationResult<MutationResult, Error, CopyRowVariables> {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: CopyRowVariables) =>
      repo.copyRow(v.row.id, v.destination.id, { actorId: v.actorId, now: new Date() }),
    onSuccess: (_result, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.rows(v.destination.id) }),
        qc.invalidateQueries({ queryKey: queryKeys.rowCounts(v.destination.memberId) }),
        qc.invalidateQueries({ queryKey: queryKeys.memberRows(v.destination.memberId) }),
        qc.invalidateQueries({ queryKey: queryKeys.samePersonOf(v.row.id) }),
        qc.invalidateQueries({ queryKey: ['search'] }),
      ]),
  })
}

/** Developer menu: wipe and reseed, then refetch everything. */
export function useResetSampleData(): UseMutationResult<void, Error, void> {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => repo.resetSampleData(),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Developer menu and test hook: add (or replace) the 2,000-row Customers sheet. */
export function useLoadPerfSheet(): UseMutationResult<Sheet, Error, void> {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => repo.loadPerfSheet(),
    onSuccess: () => qc.invalidateQueries(),
  })
}
