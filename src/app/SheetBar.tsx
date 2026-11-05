import { PanelRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { SheetTabs } from '@/components/crm/SheetTabs'
import { IconButton } from '@/components/ui/IconButton'
import { useRowCounts } from '@/data/hooks'
import type { Member, Sheet } from '@/domain/types'
import { sheetPath } from './navigation'
import { useUiStore } from './uiStore'

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

  return (
    <div className="flex h-[var(--sheet-bar-height)] shrink-0 items-stretch gap-4 border-b border-border bg-bg pl-4 pr-2">
      <nav aria-label={`${member.name}'s sheets`} className="flex min-w-0 flex-1 items-stretch">
        <SheetTabs
          sheets={sheets.map((s) => ({ id: s.id, name: s.name }))}
          counts={counts}
          value={sheet.id}
          onValueChange={(id) => {
            const next = sheets.find((s) => s.id === id)
            if (next) navigate(sheetPath(member.slug, next.slug))
          }}
        />
      </nav>
      <div className="flex items-center">
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
