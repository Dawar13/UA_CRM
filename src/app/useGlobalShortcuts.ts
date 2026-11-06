import { useEffect } from 'react'
import { isModKey, isTypingTarget } from '@/lib/platform'
import { useUndoStack } from '@/lib/undoStack'
import { useUiStore } from './uiStore'

/**
 * App-wide shortcuts: Mod+K (search), Mod+. (side panel), ? (shortcut sheet), Mod+Z and
 * Mod+Shift+Z (undo and redo, outside text fields, which keep their own).
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUiStore.getState()
      if (isModKey(event) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        ui.setPaletteOpen(!ui.paletteOpen)
        return
      }
      if (
        isModKey(event) &&
        !event.altKey &&
        event.key.toLowerCase() === 'z' &&
        !isTypingTarget(event.target) &&
        !ui.paletteOpen &&
        !document.querySelector('[role="dialog"]')
      ) {
        event.preventDefault()
        const stack = useUndoStack.getState()
        void (event.shiftKey ? stack.redo() : stack.undo())
        return
      }
      if (isModKey(event) && event.key === '.') {
        event.preventDefault()
        ui.togglePanel()
        return
      }
      if (
        event.key === '/' &&
        !isModKey(event) &&
        !event.altKey &&
        !isTypingTarget(event.target) &&
        !ui.paletteOpen &&
        !document.querySelector('[role="dialog"]') &&
        document.querySelector('[data-testid="quick-add"]')
      ) {
        event.preventDefault()
        ui.requestQuickAdd()
        return
      }
      if (event.key === '?' && !isModKey(event) && !isTypingTarget(event.target)) {
        if (ui.paletteOpen) return
        event.preventDefault()
        ui.setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
