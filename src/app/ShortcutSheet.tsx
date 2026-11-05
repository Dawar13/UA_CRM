import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Kbd } from '@/components/ui/Kbd'
import { useUiStore } from './uiStore'
import { useReturnFocus } from './useReturnFocus'

/** Every shortcut from CLAUDE.md §3.1 that works in Phase 0. */
export const phase0Shortcuts: { keys: string[][]; label: string }[] = [
  { keys: [['Mod', 'K']], label: 'Search and commands' },
  { keys: [['↑'], ['↓'], ['←'], ['→']], label: 'Move in the grid' },
  { keys: [['Home'], ['End']], label: 'First or last column' },
  {
    keys: [
      ['Mod', 'Home'],
      ['Mod', 'End'],
    ],
    label: 'First or last row',
  },
  { keys: [['PgUp'], ['PgDn']], label: 'Up or down a page' },
  { keys: [['Enter']], label: 'Expand or collapse the row' },
  { keys: [['Esc']], label: 'Collapse, or cancel' },
  { keys: [['W']], label: 'Cycle warmth on the active row' },
  { keys: [[']'], ['[']], label: 'Next or previous stage' },
  { keys: [['Mod', '.']], label: 'Toggle the side panel' },
  { keys: [['?']], label: 'Show this list' },
]

export function ShortcutSheet() {
  const open = useUiStore((s) => s.shortcutsOpen)
  const setOpen = useUiStore((s) => s.setShortcutsOpen)
  const returnFocus = useReturnFocus()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Everything here works without the mouse."
        {...returnFocus}
      >
        <dl
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-2.5 pt-1"
          data-testid="shortcut-sheet"
        >
          {phase0Shortcuts.map((s) => (
            <div key={s.label} className="contents">
              <dt className="text-base text-text">{s.label}</dt>
              <dd className="flex items-center justify-end gap-1.5">
                {s.keys.map((combo, i) => (
                  <span key={combo.join('+')} className="flex items-center gap-1.5">
                    {i > 0 ? <span className="text-xs text-muted">or</span> : null}
                    <Kbd keys={combo} />
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
