import { ListFilter, PanelRight, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useActor } from '@/auth/AuthContext'
import { useEditGate } from '@/auth/useCan'
import { SheetTabs } from '@/components/crm/SheetTabs'
import { TagChip } from '@/components/crm/TagChip'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/Menu'
import { useReorderSheets, useRowCounts, useRows, useSheetTagCounts, useTagMap } from '@/data/hooks'
import type { Member, Sheet } from '@/domain/types'
import { ExportMenu } from '@/features/import-export/ExportMenu'
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
  const { data: rows } = useRows(sheet.id)
  const tagCounts = useSheetTagCounts(rows)
  const tagMap = useTagMap()
  const filterTag = useUiStore((s) => s.tagFilters[sheet.id] ?? null)
  const setTagFilter = useUiStore((s) => s.setTagFilter)
  const filtered = filterTag ? tagMap.get(filterTag) : undefined
  const usedTags = [...tagCounts.entries()]
    .map(([id, count]) => ({ tag: tagMap.get(id), count }))
    .filter((t): t is { tag: NonNullable<typeof t.tag>; count: number } => t.tag !== undefined)
    .sort((a, b) => a.tag.name.localeCompare(b.tag.name))

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
        {filtered ? (
          <span
            className="mr-1 inline-flex h-7 items-center gap-1 rounded-chip bg-surface-hover pr-0.5 pl-2 text-xs"
            data-testid="tag-filter"
          >
            <TagChip name={filtered.name} colour={filtered.colour} />
            <button
              type="button"
              aria-label={`Stop filtering by ${filtered.name}`}
              onClick={() => setTagFilter(sheet.id, null)}
              className="grid size-6 place-items-center rounded-chip text-muted hover:text-text"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ) : null}
        {usedTags.length > 0 ? (
          <Menu>
            <MenuTrigger asChild>
              <IconButton aria-label="Filter by tag" tooltip="Filter by tag">
                <ListFilter className="size-4" />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
              <MenuLabel>Show rows tagged</MenuLabel>
              {usedTags.map(({ tag, count }) => (
                <MenuItem key={tag.id} onSelect={() => setTagFilter(sheet.id, tag.id)}>
                  <TagChip name={tag.name} colour={tag.colour} />
                  <span className="ml-auto font-mono text-[11px] text-muted">{count}</span>
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
        <ExportMenu member={member} sheet={sheet} />
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
