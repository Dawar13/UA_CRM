/**
 * Editing rows from the grid: cell edits, new rows, moves to Trash and pastes. Each is optimistic
 * (the grid shows the change at once), rolls back with plain words when the save fails, and
 * pushes one entry onto the session's undo stack.
 */
import {
  type QueryClient,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { pluralise } from '@/domain/format'
import { PermissionDenied } from '@/domain/permissions'
import {
  type NewRowValues,
  newRow,
  patchRow,
  type RowPatch,
  RowValidationError,
} from '@/domain/rows'
import { snapshotStage } from '@/domain/stages'
import type { Id, Row, Sheet, StageSnapshot, Warmth } from '@/domain/types'
import { type UndoEntry, useUndoStack } from '@/lib/undoStack'
import { useRepository } from '../RepositoryContext'
import type { MutationContext, Repository, TrashItem } from '../repository'
import { OfflineError } from '../supabase/errors'
import { queryKeys } from './keys'
import { invalidateRow, SAVE_FAILED_MESSAGE, UNDO_TOAST_DURATION, writeRow } from './mutations'

const ctxOf = (actorId: Id): MutationContext => ({ actorId, now: new Date() })

/** A failed save in plain words. */
export function saveErrorMessage(error: unknown): string {
  if (error instanceof RowValidationError || error instanceof PermissionDenied) return error.message
  if (error instanceof OfflineError) return error.message
  return SAVE_FAILED_MESSAGE
}

function invalidateSheet(qc: QueryClient, sheet: Pick<Sheet, 'id' | 'memberId'>): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.rows(sheet.id) }),
    qc.invalidateQueries({ queryKey: queryKeys.rowCounts(sheet.memberId) }),
    qc.invalidateQueries({ queryKey: queryKeys.memberRows(sheet.memberId) }),
    qc.invalidateQueries({ queryKey: ['memberHistory', sheet.memberId] }),
    qc.invalidateQueries({ queryKey: ['search'] }),
    qc.invalidateQueries({ queryKey: ['trash'] }),
  ])
}

/** The values of `patch`'s keys as they are on `row`: applying it undoes the patch. */
export function inversePatch(row: Row, patch: RowPatch): RowPatch {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) out[key] = (row as unknown as Record<string, unknown>)[key]
  return out as RowPatch
}

// ---------- Tags ----------

/** Creates a tag on the fly (or finds the one with that name). */
export function useCreateTag() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; actorId: Id }) =>
      repo.createTag({ name: v.name }, ctxOf(v.actorId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tags() }),
    onError: (error) => {
      toast.error(saveErrorMessage(error), { id: 'create-tag' })
    },
  })
}

// ---------- Cell edits ----------

export interface UpdateRowVariables {
  row: Row
  sheet: Sheet
  patch: RowPatch
  actorId: Id
  /** For the undo stack: "Edit Title". */
  label: string
}

export function useUpdateRow() {
  const repo = useRepository()
  const qc = useQueryClient()
  const save = async (rowId: Id, patch: RowPatch, actorId: Id) => {
    const updated = await repo.updateRow(rowId, patch, ctxOf(actorId))
    writeRow(qc, updated)
    return updated
  }
  return useMutation({
    mutationFn: (v: UpdateRowVariables) => repo.updateRow(v.row.id, v.patch, ctxOf(v.actorId)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: queryKeys.rows(v.sheet.id) })
      const before = qc.getQueryData<Row[]>(queryKeys.rows(v.sheet.id))
      try {
        writeRow(qc, patchRow(v.row, v.sheet, v.patch, { ...ctxOf(v.actorId), newId: () => '' }))
      } catch {
        // Invalid: the repository refuses it with the same words, and nothing changes here.
      }
      return { before }
    },
    onError: (error, v, snapshot) => {
      qc.setQueryData(queryKeys.rows(v.sheet.id), snapshot?.before)
      toast.error(saveErrorMessage(error), { id: `save-${v.row.id}` })
    },
    onSuccess: (updated, v) => {
      writeRow(qc, updated)
      useUndoStack.getState().push({
        label: v.label,
        undo: () => save(v.row.id, inversePatch(v.row, v.patch), v.actorId),
        redo: () => save(v.row.id, v.patch, v.actorId),
      })
    },
    onSettled: (_data, _error, v) => invalidateRow(qc, v.row),
  })
}

// ---------- New rows ----------

export interface CreateRowVariables {
  sheet: Sheet
  values: NewRowValues
  actorId: Id
  /** Position for the optimistic row: after the last one. */
  position: number
}

export function useCreateRow() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: CreateRowVariables & { id: Id }) =>
      repo.createRow({ sheetId: v.sheet.id, values: v.values, id: v.id }, ctxOf(v.actorId)),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: queryKeys.rows(v.sheet.id) })
      const before = qc.getQueryData<Row[]>(queryKeys.rows(v.sheet.id))
      try {
        const { row } = newRow(
          v.sheet,
          v.values,
          { id: v.id, position: v.position },
          { ...ctxOf(v.actorId), newId: () => '' },
        )
        qc.setQueryData<Row[]>(queryKeys.rows(v.sheet.id), (old) => [...(old ?? []), row])
      } catch {
        // Invalid: the repository refuses it below.
      }
      return { before }
    },
    onError: (error, v, snapshot) => {
      qc.setQueryData(queryKeys.rows(v.sheet.id), snapshot?.before)
      toast.error(saveErrorMessage(error), { id: `create-${v.id}` })
    },
    onSuccess: (result, v) => {
      writeRow(qc, result.row)
      const sheet = v.sheet
      useUndoStack.getState().push({
        label: `Add ${result.row.name}`,
        undo: async () => {
          await repo.deleteRows([result.row.id], ctxOf(v.actorId))
          await invalidateSheet(qc, sheet)
        },
        redo: async () => {
          await repo.restoreRows([result.row.id], ctxOf(v.actorId))
          await invalidateSheet(qc, sheet)
        },
      })
    },
    onSettled: (_d, _e, v) => invalidateSheet(qc, v.sheet),
  })
}

// ---------- Trash ----------

export interface DeleteRowsVariables {
  sheet: Sheet
  rows: readonly Row[]
  actorId: Id
}

export function useDeleteRows() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: DeleteRowsVariables) =>
      repo.deleteRows(
        v.rows.map((r) => r.id),
        ctxOf(v.actorId),
      ),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: queryKeys.rows(v.sheet.id) })
      const before = qc.getQueryData<Row[]>(queryKeys.rows(v.sheet.id))
      const gone = new Set(v.rows.map((r) => r.id))
      qc.setQueryData<Row[]>(queryKeys.rows(v.sheet.id), (old) =>
        old?.filter((r) => !gone.has(r.id)),
      )
      return { before }
    },
    onError: (error, v, snapshot) => {
      qc.setQueryData(queryKeys.rows(v.sheet.id), snapshot?.before)
      toast.error(saveErrorMessage(error), { id: 'delete-rows' })
    },
    onSuccess: (_r, v) => {
      const ids = v.rows.map((r) => r.id)
      const label =
        v.rows.length === 1
          ? `Move ${v.rows[0]?.name ?? 'the row'} to Trash`
          : `Move ${pluralise(v.rows.length, 'row')} to Trash`
      const entry: UndoEntry = {
        label,
        undo: async () => {
          await repo.restoreRows(ids, ctxOf(v.actorId))
          await invalidateSheet(qc, v.sheet)
        },
        redo: async () => {
          await repo.deleteRows(ids, ctxOf(v.actorId))
          await invalidateSheet(qc, v.sheet)
        },
      }
      useUndoStack.getState().push(entry)
      toast(
        v.rows.length === 1
          ? `Moved ${v.rows[0]?.name ?? 'the row'} to Trash`
          : `Moved ${pluralise(v.rows.length, 'row')} to Trash`,
        {
          id: 'delete-rows',
          duration: UNDO_TOAST_DURATION,
          action: {
            label: 'Undo',
            onClick: () => void useUndoStack.getState().undoEntry(entry),
          },
        },
      )
    },
    onSettled: (_d, _e, v) => invalidateSheet(qc, v.sheet),
  })
}

/** Your Trash from the last 30 days, newest first. */
export function useTrash(actorId: Id | undefined) {
  const repo = useRepository()
  return useQuery({
    queryKey: queryKeys.trash(actorId ?? ''),
    queryFn: actorId ? () => repo.listTrash(ctxOf(actorId)) : skipToken,
  })
}

/** Brings something back from Trash. */
export function useRestoreFromTrash() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { item: TrashItem; actorId: Id }) => {
      const ctx = ctxOf(v.actorId)
      if (v.item.kind === 'row') await repo.restoreRows([v.item.id], ctx)
      else if (v.item.kind === 'sheet') await repo.restoreSheet(v.item.id, ctx)
      else await repo.restoreColumn(v.item.sheetId, v.item.id, ctx)
    },
    onSuccess: (_r, v) => {
      toast(`Restored ${v.item.label}`, { id: 'restored' })
    },
    onError: (error) => {
      toast.error(saveErrorMessage(error), { id: 'restored' })
    },
    // Anything can change when a sheet comes back.
    onSettled: () => qc.invalidateQueries(),
  })
}

// ---------- Paste ----------

/** One pasted row: changes to an existing row, or a new row. */
export type PastedRow =
  | {
      kind: 'update'
      row: Row
      patch: RowPatch
      warmth?: Warmth | null
      stageIndex?: number
      /** Tag names to add (created when new). */
      tagNames?: string[]
    }
  | { kind: 'create'; values: NewRowValues; tagNames?: string[]; warmth?: Warmth | null }

export interface PasteVariables {
  sheet: Sheet
  rows: readonly PastedRow[]
  actorId: Id
  /** Cells that could not be read, for the toast. */
  skipped: number
}

/** Creates any new tags by name and returns their ids, keeping existing ones. */
async function tagIdsFor(repo: Repository, names: readonly string[], actorId: Id): Promise<Id[]> {
  const ids: Id[] = []
  for (const name of names) {
    const tag = await repo.createTag({ name }, ctxOf(actorId))
    if (!ids.includes(tag.id)) ids.push(tag.id)
  }
  return ids
}

interface PasteUndo {
  updated: {
    rowId: Id
    patch: RowPatch
    inverse: RowPatch
    /** Set when the paste changed the warmth: the new warmth and the one before. */
    warmth?: { to: Warmth | null; from: Warmth | null }
    /** Set when the paste moved the stage: the new index and the stage as it was. */
    stage?: { to: number; from: StageSnapshot }
  }[]
  created: Id[]
}

/** Applies a pasted block: updates rows in place and adds rows below, all as one undo step. */
export function usePasteRows() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: PasteVariables): Promise<PasteUndo> => {
      const undo: PasteUndo = { updated: [], created: [] }
      for (const item of v.rows) {
        const tagIds = item.tagNames?.length
          ? await tagIdsFor(repo, item.tagNames, v.actorId)
          : null
        if (item.kind === 'create') {
          const values = tagIds ? { ...item.values, tagIds } : item.values
          const result = await repo.createRow(
            {
              sheetId: v.sheet.id,
              values: item.warmth ? { ...values, warmth: item.warmth } : values,
            },
            ctxOf(v.actorId),
          )
          undo.created.push(result.row.id)
          continue
        }
        const patch: RowPatch = tagIds
          ? { ...item.patch, tagIds: [...new Set([...item.row.tagIds, ...tagIds])] }
          : item.patch
        const step: PasteUndo['updated'][number] = {
          rowId: item.row.id,
          patch,
          inverse: inversePatch(item.row, patch),
        }
        if (Object.keys(patch).length > 0) {
          await repo.updateRow(item.row.id, patch, ctxOf(v.actorId))
        }
        if (item.warmth !== undefined && item.warmth !== item.row.warmth) {
          await repo.updateWarmth(item.row.id, item.warmth, ctxOf(v.actorId))
          step.warmth = { to: item.warmth, from: item.row.warmth }
        }
        if (item.stageIndex !== undefined && item.stageIndex !== item.row.stageIndex) {
          await repo.updateStage(item.row.id, item.stageIndex, ctxOf(v.actorId))
          step.stage = { to: item.stageIndex, from: snapshotStage(item.row) }
        }
        undo.updated.push(step)
      }
      return undo
    },
    onError: (error, v) => {
      toast.error(saveErrorMessage(error), { id: 'paste' })
      void invalidateSheet(qc, v.sheet)
    },
    onSuccess: (undo, v) => {
      const count = v.rows.length
      const label = `Paste into ${pluralise(count, 'row')}`
      const entry: UndoEntry = {
        label,
        undo: async () => {
          if (undo.created.length > 0) await repo.deleteRows(undo.created, ctxOf(v.actorId))
          for (const u of undo.updated) {
            if (Object.keys(u.inverse).length > 0) {
              await repo.updateRow(u.rowId, u.inverse, ctxOf(v.actorId))
            }
            if (u.stage) await repo.restoreStage(u.rowId, u.stage.from, ctxOf(v.actorId))
            if (u.warmth) {
              await repo.updateWarmth(u.rowId, u.warmth.from, ctxOf(v.actorId), { undo: true })
            }
          }
          await invalidateSheet(qc, v.sheet)
        },
        redo: async () => {
          if (undo.created.length > 0) await repo.restoreRows(undo.created, ctxOf(v.actorId))
          for (const u of undo.updated) {
            if (Object.keys(u.patch).length > 0) {
              await repo.updateRow(u.rowId, u.patch, ctxOf(v.actorId))
            }
            if (u.stage) await repo.updateStage(u.rowId, u.stage.to, ctxOf(v.actorId))
            if (u.warmth) await repo.updateWarmth(u.rowId, u.warmth.to, ctxOf(v.actorId))
          }
          await invalidateSheet(qc, v.sheet)
        },
      }
      useUndoStack.getState().push(entry)
      const skipped =
        v.skipped > 0 ? `. ${pluralise(v.skipped, 'cell')} did not fit and stayed as they were` : ''
      toast(`Pasted into ${pluralise(count, 'row')}${skipped}`, {
        id: 'paste',
        duration: UNDO_TOAST_DURATION,
        action: { label: 'Undo', onClick: () => void useUndoStack.getState().undoEntry(entry) },
      })
    },
    onSettled: (_d, _e, v) => invalidateSheet(qc, v.sheet),
  })
}
