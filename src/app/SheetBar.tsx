import { PanelRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useActor } from '@/auth/AuthContext'
import { useEditGate } from '@/auth/useCan'
import { SheetTabs } from '@/components/crm/SheetTabs'
import { IconButton } from '@/components/ui/IconButton'
import { useReorderSheets, useRowCounts } from '@/data/hooks'
import type { Member, Sheet } from '@/domain/types'
import { SheetMenu } from '@/features/sheets/SheetMenu'
import { rememberLocation, sheetPath } from './navigation'
import { useUiStore } from './uiStore'

/**
 * The folder tabs above the open sheet, with the side panel toggle at the right end. Clicking the
 * open sheet's tab again folds or unfolds its folder front.
 */
export function SheetBar({
  member,
  sheets,
  sheet,
}: {
  member: Member
  sheets: readonly Sheet[]
  sheet: Sheet
}) {
  const navigate = useNavigate()
  const { data: counts } = useRowCounts(member.id)
  const panelOpen = useUiStore((s) => s.panelOpen)
  const togglePanel = useUiStore((s) => s.togglePanel)
  const toggleSummary = useUiStore((s) => s.toggleSummary)
  const gate = useEditGate(member)
  const actor = useActor()
  const reorder = useReorderSheets()

  return (
    <div className="flex h-[var(--sheet-bar-height)] shrink-0 items-stretch gap-3">
      <nav aria-label={`${member.name}'s sheets`} className="flex min-w-0 flex-1 items-stretch">
        <SheetTabs
          sheets={sheets.map((s) => ({ id: s.id, name: s.name }))}
          counts={counts}
          value={sheet.id}
          onValueChange={(id) => {
            const next = sheets.find((s) => s.id === id)
            if (!next) return
            // Remember the choice now, not after the new sheet renders, so a reload straight
            // after switching still comes back to it.
            rememberLocation(member.id, next.id)
            navigate(sheetPath(member.slug, next.slug))
          }}
          onActiveTabClick={toggleSummary}
          onReorder={
            gate.editable && actor
              ? (ids) =>
                  reorder.mutate({
                    memberId: member.id,
                    ids,
                    before: sheets.map((s) => s.id),
                    actorId: actor.id,
                  })
              : undefined
          }
        />
      </nav>
      <div className="flex items-center gap-0.5">
        {gate.editable ? <SheetMenu member={member} sheets={sheets} sheet={sheet} /> : null}
        <IconButton
          aria-label={panelOpen ? 'Hide side panel' : 'Show side panel'}
          aria-pressed={panelOpen}
          tooltip={panelOpen ? 'Hide side panel' : 'Show side panel'}
          shortcut={['Mod', '.']}
          onClick={togglePanel}
        >
          <PanelRight className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}
