/**
 * Changing the shape of a tab: sheets, columns, stages and the team. These are rarer than cell
 * edits, so each one refreshes everything it might touch afterwards. Reversible ones push an
 * undo entry and show an undo toast (CLAUDE.md §2.13).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { StageMoves } from '@/domain/sheetEdits'
import type { ColumnDef, Id, Member, Sheet, StageDef, TemplateKey } from '@/domain/types'
import { type UndoEntry, useUndoStack } from '@/lib/undoStack'
import { useRepository } from '../RepositoryContext'
import type { ColumnPatch, MemberPatch, MutationContext, NewColumnInput } from '../repository'
import { UNDO_TOAST_DURATION } from './mutations'
import { saveErrorMessage } from './rowEdits'

const ctxOf = (actorId: Id): MutationContext => ({ actorId, now: new Date() })

function failed(error: unknown) {
  toast.error(saveErrorMessage(error), { id: 'sheet-change' })
}

/** Pushes an undo entry and shows its toast. */
function offerUndo(message: string, entry: UndoEntry): void {
  useUndoStack.getState().push(entry)
  toast(message, {
    id: 'sheet-change',
    duration: UNDO_TOAST_DURATION,
    action: { label: 'Undo', onClick: () => void useUndoStack.getState().undoEntry(entry) },
  })
}

function useRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

// ---------- Sheets ----------

export function useCreateSheet() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { memberId: Id; name: string; template: TemplateKey; actorId: Id }) =>
      repo.createSheet(v.memberId, { name: v.name, template: v.template }, ctxOf(v.actorId)),
    onSuccess: (sheet, v) => {
      useUndoStack.getState().push({
        label: `Create ${sheet.name}`,
        undo: () => repo.deleteSheet(sheet.id, ctxOf(v.actorId)).then(refresh),
        redo: () => repo.restoreSheet(sheet.id, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

/** "Start with the UA templates": the five standard sheets, in order. */
export function useCreateStandardSheets() {
  const repo = useRepository()
  const refresh = useRefresh()
  const standard: { name: string; template: TemplateKey }[] = [
    { name: 'Customers', template: 'customers' },
    { name: 'Investors', template: 'investors' },
    { name: 'Advisors and experts', template: 'advisors' },
    { name: 'Connectors', template: 'connectors' },
    { name: 'Service providers', template: 'serviceProviders' },
  ]
  return useMutation({
    mutationFn: async (v: { memberId: Id; actorId: Id }) => {
      const sheets: Sheet[] = []
      for (const s of standard) sheets.push(await repo.createSheet(v.memberId, s, ctxOf(v.actorId)))
      return sheets
    },
    onError: failed,
    onSettled: refresh,
  })
}

export function useRenameSheet() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; name: string; actorId: Id }) =>
      repo.updateSheet(v.sheet.id, { name: v.name }, ctxOf(v.actorId)),
    onSuccess: (sheet, v) => {
      useUndoStack.getState().push({
        label: `Rename ${v.sheet.name}`,
        undo: () =>
          repo.updateSheet(sheet.id, { name: v.sheet.name }, ctxOf(v.actorId)).then(refresh),
        redo: () => repo.updateSheet(sheet.id, { name: v.name }, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

export function useReorderSheets() {
  const repo = useRepository()
  const qc = useQueryClient()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { memberId: Id; ids: Id[]; before: Id[]; actorId: Id }) =>
      repo.reorderSheets(v.memberId, v.ids, ctxOf(v.actorId)),
    onMutate: (v) => {
      // Show the new order at once.
      qc.setQueryData<Sheet[]>(['sheets', v.memberId], (old) =>
        old
          ? v.ids
              .map((id, position) => {
                const s = old.find((x) => x.id === id)
                return s ? { ...s, position } : undefined
              })
              .filter((s): s is Sheet => s !== undefined)
          : old,
      )
    },
    onSuccess: (_s, v) => {
      useUndoStack.getState().push({
        label: 'Reorder sheets',
        undo: () => repo.reorderSheets(v.memberId, v.before, ctxOf(v.actorId)).then(refresh),
        redo: () => repo.reorderSheets(v.memberId, v.ids, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

export function useDeleteSheet() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; actorId: Id }) =>
      repo.deleteSheet(v.sheet.id, ctxOf(v.actorId)),
    onSuccess: (_r, v) => {
      offerUndo(`Moved ${v.sheet.name} to Trash`, {
        label: `Delete ${v.sheet.name}`,
        undo: () => repo.restoreSheet(v.sheet.id, ctxOf(v.actorId)).then(refresh),
        redo: () => repo.deleteSheet(v.sheet.id, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

// ---------- Stages ----------

export function useEditStages() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; stages: StageDef[]; moves: StageMoves; actorId: Id }) =>
      repo.editStages(v.sheet.id, v.stages, v.moves, ctxOf(v.actorId)),
    onSuccess: () => {
      toast('Stages saved', { id: 'sheet-change' })
    },
    onError: failed,
    onSettled: refresh,
  })
}

// ---------- Columns ----------

export function useAddColumn() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; column: NewColumnInput; actorId: Id }) =>
      repo.addColumn(v.sheet.id, v.column, ctxOf(v.actorId)),
    onSuccess: (sheet, v) => {
      const added = sheet.columns.find(
        (c) => !v.sheet.columns.some((old) => old.id === c.id) && !c.deletedAt,
      )
      if (!added) return
      useUndoStack.getState().push({
        label: `Add ${added.label}`,
        undo: () => repo.deleteColumn(sheet.id, added.id, ctxOf(v.actorId)).then(refresh),
        redo: () => repo.restoreColumn(sheet.id, added.id, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

export function useUpdateColumn() {
  const repo = useRepository()
  const qc = useQueryClient()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; column: ColumnDef; patch: ColumnPatch; actorId: Id }) =>
      repo.updateColumn(v.sheet.id, v.column.id, v.patch, ctxOf(v.actorId)),
    onMutate: (v) => {
      // Widths, names and visibility show at once.
      qc.setQueryData<Sheet[]>(['sheets', v.sheet.memberId], (old) =>
        old?.map((s) =>
          s.id === v.sheet.id
            ? {
                ...s,
                columns: s.columns.map((c) => (c.id === v.column.id ? { ...c, ...v.patch } : c)),
              }
            : s,
        ),
      )
    },
    onSuccess: (_s, v) => {
      const before: ColumnPatch = {}
      for (const key of Object.keys(v.patch) as (keyof ColumnPatch)[]) {
        Object.assign(before, { [key]: v.column[key] })
      }
      useUndoStack.getState().push({
        label: `Edit ${v.column.label}`,
        undo: () =>
          repo.updateColumn(v.sheet.id, v.column.id, before, ctxOf(v.actorId)).then(refresh),
        redo: () =>
          repo.updateColumn(v.sheet.id, v.column.id, v.patch, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

export function useDeleteColumn() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; column: ColumnDef; actorId: Id }) =>
      repo.deleteColumn(v.sheet.id, v.column.id, ctxOf(v.actorId)),
    onSuccess: (_s, v) => {
      offerUndo(`Moved ${v.column.label} to Trash`, {
        label: `Delete ${v.column.label}`,
        undo: () => repo.restoreColumn(v.sheet.id, v.column.id, ctxOf(v.actorId)).then(refresh),
        redo: () => repo.deleteColumn(v.sheet.id, v.column.id, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

export function useReorderColumns() {
  const repo = useRepository()
  const qc = useQueryClient()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; ids: Id[]; actorId: Id }) =>
      repo.reorderColumns(v.sheet.id, v.ids, ctxOf(v.actorId)),
    onMutate: (v) => {
      qc.setQueryData<Sheet[]>(['sheets', v.sheet.memberId], (old) =>
        old?.map((s) =>
          s.id === v.sheet.id
            ? {
                ...s,
                columns: s.columns.map((c) => {
                  const position = v.ids.indexOf(c.id)
                  return position >= 0 ? { ...c, position } : c
                }),
              }
            : s,
        ),
      )
    },
    onSuccess: (_s, v) => {
      const before = [...v.sheet.columns]
        .filter((c) => !c.deletedAt)
        .sort((a, b) => a.position - b.position)
        .map((c) => c.id)
      useUndoStack.getState().push({
        label: 'Reorder columns',
        undo: () => repo.reorderColumns(v.sheet.id, before, ctxOf(v.actorId)).then(refresh),
        redo: () => repo.reorderColumns(v.sheet.id, v.ids, ctxOf(v.actorId)).then(refresh),
      })
    },
    onError: failed,
    onSettled: refresh,
  })
}

export function useConvertColumn() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { sheet: Sheet; column: ColumnDef; type: ColumnDef['type']; actorId: Id }) =>
      repo.convertColumn(v.sheet.id, v.column.id, v.type, ctxOf(v.actorId)),
    onSuccess: (_s, v) => {
      toast(`${v.column.label} changed type`, { id: 'sheet-change' })
    },
    onError: failed,
    onSettled: refresh,
  })
}

// ---------- The team ----------

export function useCreateMember() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { name: string; email: string; actorId: Id }) =>
      repo.createMember({ name: v.name, email: v.email }, ctxOf(v.actorId)),
    onSettled: refresh,
  })
}

export function useUpdateMember() {
  const repo = useRepository()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (v: { member: Member; patch: MemberPatch; actorId: Id }) =>
      repo.updateMember(v.member.id, v.patch, ctxOf(v.actorId)),
    onError: failed,
    onSettled: refresh,
  })
}
