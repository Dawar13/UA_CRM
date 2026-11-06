import { create } from 'zustand'
import { readStorage, STORAGE_PREFIX, storageKeys, writeStorage } from '@/lib/storage'

/** Whether the folder front (the sheet summary) is open. Remembered across sessions. */
export const SUMMARY_OPEN_KEY = `${STORAGE_PREFIX}summary-open`

/** What the right panel shows: the calendar week, one row's full history, or your Trash. */
export type PanelView =
  | { kind: 'calendar' }
  | { kind: 'history'; rowId: string }
  | { kind: 'trash' }

interface UiState {
  panelOpen: boolean
  panelView: PanelView
  /** The folder front above the grid: open shows the figures and pipeline, folded one line. */
  summaryOpen: boolean
  paletteOpen: boolean
  shortcutsOpen: boolean
  /** A row briefly highlighted after a jump from search or a link chip. */
  flashRowId: string | null
  /** The tag each sheet is filtered by, if any (for this session). */
  tagFilters: Record<string, string | null>
  setTagFilter: (sheetId: string, tagId: string | null) => void
  togglePanel: () => void
  setPanelOpen: (open: boolean) => void
  toggleSummary: () => void
  setSummaryOpen: (open: boolean) => void
  showHistory: (rowId: string) => void
  showCalendar: () => void
  showTrash: () => void
  setPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
  flashRow: (rowId: string) => void
  clearFlash: () => void
}

function readPanelOpen(): boolean {
  return readStorage(storageKeys.panelOpen) !== 'false'
}

/** Below this window height the folder front starts folded, so the grid keeps room. */
export const SUMMARY_MIN_HEIGHT = 820

/**
 * The member's last choice wins. With no choice yet, the front starts open on screens at least
 * SUMMARY_MIN_HEIGHT tall and folded on shorter ones (1024 × 768 keeps its rows visible).
 * `readStorage` never throws.
 */
export function readSummaryOpen(): boolean {
  const saved = readStorage(SUMMARY_OPEN_KEY)
  if (saved === 'true') return true
  if (saved === 'false') return false
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia(`(min-height: ${SUMMARY_MIN_HEIGHT}px)`).matches
}

export const useUiStore = create<UiState>((set, get) => ({
  panelOpen: typeof window === 'undefined' ? true : readPanelOpen(),
  panelView: { kind: 'calendar' },
  summaryOpen: typeof window === 'undefined' ? true : readSummaryOpen(),
  paletteOpen: false,
  shortcutsOpen: false,
  flashRowId: null,
  tagFilters: {},
  setTagFilter: (sheetId, tagId) =>
    set((s) => ({ tagFilters: { ...s.tagFilters, [sheetId]: tagId } })),
  togglePanel: () => get().setPanelOpen(!get().panelOpen),
  setPanelOpen: (open) => {
    writeStorage(storageKeys.panelOpen, String(open))
    set({ panelOpen: open })
  },
  toggleSummary: () => get().setSummaryOpen(!get().summaryOpen),
  setSummaryOpen: (open) => {
    writeStorage(SUMMARY_OPEN_KEY, String(open))
    set({ summaryOpen: open })
  },
  showHistory: (rowId) => {
    writeStorage(storageKeys.panelOpen, 'true')
    set({ panelOpen: true, panelView: { kind: 'history', rowId } })
  },
  showCalendar: () => set({ panelView: { kind: 'calendar' } }),
  showTrash: () => {
    writeStorage(storageKeys.panelOpen, 'true')
    set({ panelOpen: true, panelView: { kind: 'trash' } })
  },
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  flashRow: (rowId) => set({ flashRowId: rowId }),
  clearFlash: () => set({ flashRowId: null }),
}))
