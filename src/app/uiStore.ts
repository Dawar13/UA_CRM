import { create } from 'zustand'
import { readStorage, storageKeys, writeStorage } from '@/lib/storage'

/** What the right panel shows: the calendar week, or one row's full history. */
export type PanelView = { kind: 'calendar' } | { kind: 'history'; rowId: string }

interface UiState {
  panelOpen: boolean
  panelView: PanelView
  paletteOpen: boolean
  shortcutsOpen: boolean
  /** A row briefly highlighted after a jump from search or a link chip. */
  flashRowId: string | null
  togglePanel: () => void
  setPanelOpen: (open: boolean) => void
  showHistory: (rowId: string) => void
  showCalendar: () => void
  setPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  flashRow: (rowId: string) => void
  clearFlash: () => void
}

function readPanelOpen(): boolean {
  return readStorage(storageKeys.panelOpen) !== 'false'
}

export const useUiStore = create<UiState>((set, get) => ({
  panelOpen: typeof window === 'undefined' ? true : readPanelOpen(),
  panelView: { kind: 'calendar' },
  paletteOpen: false,
  shortcutsOpen: false,
  flashRowId: null,
  togglePanel: () => get().setPanelOpen(!get().panelOpen),
  setPanelOpen: (open) => {
    writeStorage(storageKeys.panelOpen, String(open))
    set({ panelOpen: open })
  },
  showHistory: (rowId) => {
    writeStorage(storageKeys.panelOpen, 'true')
    set({ panelOpen: true, panelView: { kind: 'history', rowId } })
  },
  showCalendar: () => set({ panelView: { kind: 'calendar' } }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  flashRow: (rowId) => set({ flashRowId: rowId }),
  clearFlash: () => set({ flashRowId: null }),
}))
