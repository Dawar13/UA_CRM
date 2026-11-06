import { beforeEach, describe, expect, it, vi } from 'vitest'

const toasts = vi.hoisted(() => ({ messages: [] as string[] }))
vi.mock('sonner', () => {
  const toast = Object.assign((message: string) => toasts.messages.push(message), {
    error: (message: string) => toasts.messages.push(`error: ${message}`),
  })
  return { toast }
})

import { type UndoEntry, useUndoStack } from '@/lib/undoStack'

function change(label: string, log: string[], fail = false): UndoEntry {
  return {
    label,
    undo: async () => {
      if (fail) throw new Error('refused')
      log.push(`undo ${label}`)
    },
    redo: async () => {
      if (fail) throw new Error('refused')
      log.push(`redo ${label}`)
    },
  }
}

describe('the undo stack', () => {
  beforeEach(() => {
    useUndoStack.getState().clear()
    toasts.messages.length = 0
  })

  it('undoes the newest change first, then redoes it', async () => {
    const log: string[] = []
    const stack = useUndoStack.getState()
    stack.push(change('Edit Title', log))
    stack.push(change('Add Asha Rao', log))
    await stack.undo()
    expect(log).toEqual(['undo Add Asha Rao'])
    expect(toasts.messages.at(-1)).toBe('Undone: Add Asha Rao')
    await useUndoStack.getState().redo()
    expect(log).toEqual(['undo Add Asha Rao', 'redo Add Asha Rao'])
    expect(toasts.messages.at(-1)).toBe('Redone: Add Asha Rao')
    expect(useUndoStack.getState().past.map((e) => e.label)).toEqual(['Edit Title', 'Add Asha Rao'])
  })

  it('says so when there is nothing to undo or redo', async () => {
    await useUndoStack.getState().undo()
    await useUndoStack.getState().redo()
    expect(toasts.messages).toEqual(['Nothing to undo', 'Nothing to redo'])
  })

  it('a new change clears what could be redone', async () => {
    const log: string[] = []
    useUndoStack.getState().push(change('One', log))
    await useUndoStack.getState().undo()
    expect(useUndoStack.getState().future).toHaveLength(1)
    useUndoStack.getState().push(change('Two', log))
    expect(useUndoStack.getState().future).toHaveLength(0)
  })

  it("a toast's Undo undoes that change, only once", async () => {
    const log: string[] = []
    const first = change('First', log)
    useUndoStack.getState().push(first)
    useUndoStack.getState().push(change('Second', log))
    await useUndoStack.getState().undoEntry(first)
    expect(log).toEqual(['undo First'])
    expect(useUndoStack.getState().past.map((e) => e.label)).toEqual(['Second'])
    await useUndoStack.getState().undo()
    expect(log).toEqual(['undo First', 'undo Second'])
  })

  it('reports a failed undo or redo and stays usable', async () => {
    const log: string[] = []
    useUndoStack.getState().push(change('Broken', log, true))
    await useUndoStack.getState().undo()
    expect(toasts.messages.at(-1)).toBe("error: Couldn't undo the change.")
    expect(useUndoStack.getState().busy).toBe(false)
    useUndoStack.setState({ future: [change('Broken', log, true)] })
    await useUndoStack.getState().redo()
    expect(toasts.messages.at(-1)).toBe("error: Couldn't redo the change.")
    expect(useUndoStack.getState().busy).toBe(false)
  })

  it('keeps the newest 100 changes', () => {
    const log: string[] = []
    for (let i = 0; i < 105; i++) useUndoStack.getState().push(change(`Change ${i}`, log))
    const past = useUndoStack.getState().past
    expect(past).toHaveLength(100)
    expect(past[0]?.label).toBe('Change 5')
  })
})
