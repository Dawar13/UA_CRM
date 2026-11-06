/**
 * Contact essentials: logging touches, files and the tag library. Each change refreshes the row
 * it touched; reversible ones go on the undo stack.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { FileRef, HistoryEntry, Id, Row, Tag } from '@/domain/types'
import { useUndoStack } from '@/lib/undoStack'
import { useRepository } from '../RepositoryContext'
import type { HistoryPatch, MutationContext, NewFile, NewHistoryInput } from '../repository'
import { invalidateRow } from './mutations'
import { saveErrorMessage } from './rowEdits'

const ctxOf = (actorId: Id): MutationContext => ({ actorId, now: new Date() })

function failed(error: unknown) {
  toast.error(saveErrorMessage(error), { id: 'contact-change' })
}

// ---------- History ----------

export function useAddHistory() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { row: Row; entry: NewHistoryInput; actorId: Id }) =>
      repo.addHistory(v.row.id, v.entry, ctxOf(v.actorId)),
    onSuccess: (entry, v) => {
      let current: HistoryEntry = entry
      useUndoStack.getState().push({
        label: 'Log a touch',
        undo: () =>
          repo.deleteHistory(current.id, ctxOf(v.actorId)).then(() => invalidateRow(qc, v.row)),
        redo: async () => {
          current = await repo.addHistory(v.row.id, v.entry, ctxOf(v.actorId))
          await invalidateRow(qc, v.row)
        },
      })
    },
    onError: failed,
    onSettled: (_e, _err, v) => invalidateRow(qc, v.row),
  })
}

export function useUpdateHistory() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { row: Row; entry: HistoryEntry; patch: HistoryPatch; actorId: Id }) =>
      repo.updateHistory(v.entry.id, v.patch, ctxOf(v.actorId)),
    onSuccess: (_e, v) => {
      const before: HistoryPatch = {
        kind: v.entry.kind,
        at: v.entry.at,
        fuzzyDate: v.entry.fuzzyDate,
        text: v.entry.text,
      }
      useUndoStack.getState().push({
        label: 'Edit a touch',
        undo: () =>
          repo
            .updateHistory(v.entry.id, before, ctxOf(v.actorId))
            .then(() => invalidateRow(qc, v.row)),
        redo: () =>
          repo
            .updateHistory(v.entry.id, v.patch, ctxOf(v.actorId))
            .then(() => invalidateRow(qc, v.row)),
      })
    },
    onError: failed,
    onSettled: (_e, _err, v) => invalidateRow(qc, v.row),
  })
}

export function useDeleteHistory() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { row: Row; entry: HistoryEntry; actorId: Id }) =>
      repo.deleteHistory(v.entry.id, ctxOf(v.actorId)),
    onSuccess: (_r, v) => {
      let restored: HistoryEntry | null = null
      const again: NewHistoryInput = {
        kind: v.entry.kind as NewHistoryInput['kind'],
        at: v.entry.at,
        fuzzyDate: v.entry.fuzzyDate,
        text: v.entry.text,
      }
      const entry = {
        label: 'Delete a touch',
        undo: async () => {
          restored = await repo.addHistory(v.row.id, again, ctxOf(v.actorId))
          await invalidateRow(qc, v.row)
        },
        redo: async () => {
          if (restored) await repo.deleteHistory(restored.id, ctxOf(v.actorId))
          await invalidateRow(qc, v.row)
        },
      }
      useUndoStack.getState().push(entry)
      toast('Touch deleted', {
        id: 'contact-change',
        action: { label: 'Undo', onClick: () => void useUndoStack.getState().undoEntry(entry) },
      })
    },
    onError: failed,
    onSettled: (_e, _err, v) => invalidateRow(qc, v.row),
  })
}

// ---------- Files ----------

export function useAttachFile() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { row: Row; file: NewFile; actorId: Id }) =>
      repo.attachFile(v.row.id, v.file, ctxOf(v.actorId)),
    onSuccess: (file) => {
      toast(`Attached ${file.name}`, { id: 'contact-change' })
    },
    onError: failed,
    onSettled: (_e, _err, v) => invalidateRow(qc, v.row),
  })
}

export function useRemoveFile() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { row: Row; file: FileRef; actorId: Id }) =>
      repo.removeFile(v.row.id, v.file.id, ctxOf(v.actorId)),
    onSuccess: (_r, v) => {
      toast(`Removed ${v.file.name}`, { id: 'contact-change' })
    },
    onError: failed,
    onSettled: (_e, _err, v) => invalidateRow(qc, v.row),
  })
}

/** Opens a file: a short-lived link for Storage, the data itself in local mode. */
export function useOpenFile() {
  const repo = useRepository()
  return async (file: FileRef) => {
    try {
      const url = await repo.fileUrl(file)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.target = '_blank'
      link.rel = 'noopener'
      document.body.append(link)
      link.click()
      link.remove()
    } catch (error) {
      failed(error)
    }
  }
}

// ---------- Tags ----------

export function useUpdateTag() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { tag: Tag; patch: Partial<Pick<Tag, 'name' | 'colour'>>; actorId: Id }) =>
      repo.updateTag(v.tag.id, v.patch, ctxOf(v.actorId)),
    onSuccess: (_t, v) => {
      const before = { name: v.tag.name, colour: v.tag.colour }
      useUndoStack.getState().push({
        label: `Edit #${v.tag.name}`,
        undo: () =>
          repo.updateTag(v.tag.id, before, ctxOf(v.actorId)).then(() => qc.invalidateQueries()),
        redo: () =>
          repo.updateTag(v.tag.id, v.patch, ctxOf(v.actorId)).then(() => qc.invalidateQueries()),
      })
    },
    onError: failed,
    onSettled: () => qc.invalidateQueries(),
  })
}

export function useDeleteTag() {
  const repo = useRepository()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { tag: Tag; actorId: Id }) => repo.deleteTag(v.tag.id, ctxOf(v.actorId)),
    onSuccess: (_r, v) => {
      toast(`Deleted #${v.tag.name}`, { id: 'contact-change' })
    },
    onError: failed,
    onSettled: () => qc.invalidateQueries(),
  })
}

/** How many live rows of a sheet use each tag, for the filter menu. */
export function useSheetTagCounts(rows: readonly Row[] | undefined): Map<Id, number> {
  const counts = new Map<Id, number>()
  for (const row of rows ?? [])
    for (const id of row.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}
