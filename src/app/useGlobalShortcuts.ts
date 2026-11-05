import { useEffect } from 'react'
import { isModKey, isTypingTarget } from '@/lib/platform'
import { useUiStore } from './uiStore'

/** App-wide shortcuts: Mod+K (search), Mod+. (side panel), ? (shortcut sheet). */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUiStore.getState()
      if (isModKey(event) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        ui.setPaletteOpen(!ui.paletteOpen)
        return
      }
      if (isModKey(event) && event.key === '.') {
        event.preventDefault()
        ui.togglePanel()
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
