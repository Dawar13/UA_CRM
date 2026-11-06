/**
 * Undo and redo for the session (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z). Every change the member makes
 * pushes one entry; the Undo button on a change's toast undoes that same entry, so a change is
 * never undone twice.
 */
import { toast } from 'sonner'
import { create } from 'zustand'

export interface UndoEntry {
  /** What the change was, in a few words: "Edit Title", "Move 2 rows to Trash". */
  label: string
  undo: () => Promise<unknown>
  redo: () => Promise<unknown>
}

const LIMIT = 100
const TOAST_ID = 'undo-stack'

interface UndoState {
  past: UndoEntry[]
  future: UndoEntry[]
  busy: boolean
  push: (entry: UndoEntry) => void
  /** Undoes the newest change. */
  undo: () => Promise<void>
  redo: () => Promise<void>
  /** Undoes a particular change (its toast's Undo button). */
  undoEntry: (entry: UndoEntry) => Promise<void>
  clear: () => void
}

export const useUndoStack = create<UndoState>((set, get) => ({
  past: [],
  future: [],
  busy: false,
  push: (entry) => set((s) => ({ past: [...s.past.slice(-(LIMIT - 1)), entry], future: [] })),
  undo: async () => {
    const entry = get().past.at(-1)
    if (!entry) {
      toast('Nothing to undo', { id: TOAST_ID })
      return
    }
    await get().undoEntry(entry)
  },
  redo: async () => {
    const { future, busy } = get()
    const entry = future.at(-1)
    if (!entry) {
      toast('Nothing to redo', { id: TOAST_ID })
      return
    }
    if (busy) return
    set({ busy: true, future: future.slice(0, -1) })
    try {
      await entry.redo()
      set((s) => ({ past: [...s.past, entry] }))
      toast(`Redone: ${entry.label}`, { id: TOAST_ID })
    } catch {
      toast.error("Couldn't redo the change.", { id: TOAST_ID })
    } finally {
      set({ busy: false })
    }
  },
  undoEntry: async (entry) => {
    if (get().busy) return
    set((s) => ({ busy: true, past: s.past.filter((e) => e !== entry) }))
    try {
      await entry.undo()
      set((s) => ({ future: [...s.future, entry] }))
      toast(`Undone: ${entry.label}`, { id: TOAST_ID })
    } catch {
      toast.error("Couldn't undo the change.", { id: TOAST_ID })
    } finally {
      set({ busy: false })
    }
  },
  clear: () => set({ past: [], future: [] }),
}))
