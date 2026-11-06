import { useQueries } from '@tanstack/react-query'
import { Command } from 'cmdk'
import {
  Keyboard,
  Monitor,
  Moon,
  PanelRight,
  Search,
  Sun,
  Table2,
  Trash2,
  Users,
} from 'lucide-react'
import { Dialog, VisuallyHidden } from 'radix-ui'
import { type ReactNode, useDeferredValue, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { memberPath, sheetPath, useJumpToRow } from '@/app/navigation'
import { type ThemeMode, useTheme } from '@/app/theme'
import { useUiStore } from '@/app/uiStore'
import { useReturnFocus } from '@/app/useReturnFocus'
import { Kbd } from '@/components/ui/Kbd'
import { queryKeys, useMembers, useSearch } from '@/data/hooks'
import { useRepository } from '@/data/RepositoryContext'
import type { SearchResult } from '@/data/repository'
import type { Member, Sheet } from '@/domain/types'
import { cn } from '@/lib/cn'
import { highlight } from './highlight'

/** Group labels in Geist Mono caps, like every section label in the app. */
const groupClassName = cn(
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5',
  '[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold',
  '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted',
)

/** Rows: 6px corners inside the 10px card, the soft selected tint. */
const itemClassName =
  'flex cursor-default items-center gap-3 rounded-control px-2.5 py-2 text-base text-text data-[selected=true]:bg-row-selected'

interface PaletteCommand {
  id: string
  label: string
  icon: ReactNode
  keywords: string
  shortcut?: string[]
  run: () => void
}

const fieldLabels: Record<SearchResult['matchedField'], string> = {
  name: 'Name',
  company: 'Company',
  title: 'Title',
  email: 'Email',
  phone: 'Phone',
  tags: 'Tag',
  notes: 'Notes',
  connectsTo: 'Connects to',
}

function groupResults(results: readonly SearchResult[]) {
  const groups = new Map<string, { label: string; results: SearchResult[] }>()
  for (const result of results) {
    const key = `${result.member.id}/${result.sheet.id}`
    const label = `${result.member.name} · ${result.sheet.name}`
    const group = groups.get(key) ?? { label, results: [] }
    group.results.push(result)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function ResultItem({
  result,
  query,
  onSelect,
}: {
  result: SearchResult
  query: string
  onSelect: () => void
}) {
  const { row } = result
  const secondary =
    result.matchedField === 'name' || result.matchedField === 'company'
      ? [row.title, row.company].filter(Boolean).join(' · ')
      : `${fieldLabels[result.matchedField]}: ${result.matchedText}`
  return (
    <Command.Item
      value={`row:${row.id}`}
      onSelect={onSelect}
      data-testid="palette-result"
      className={cn('group', itemClassName)}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{highlight(row.name, query)}</span>
        {secondary ? (
          <span className="truncate text-xs text-muted">
            {result.matchedField === 'name' ? secondary : highlight(secondary, query)}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted">
        {result.member.name} · {result.sheet.name}
      </span>
    </Command.Item>
  )
}

function useAllSheets(members: readonly Member[]) {
  const repository = useRepository()
  const results = useQueries({
    queries: members.map((m) => ({
      queryKey: queryKeys.sheets(m.id),
      queryFn: () => repository.listSheets(m.id),
    })),
  })
  return members.map((member, i) => ({ member, sheets: (results[i]?.data ?? []) as Sheet[] }))
}

export function CommandPalette({ currentMember }: { currentMember: Member | undefined }) {
  const open = useUiStore((s) => s.paletteOpen)
  const setOpen = useUiStore((s) => s.setPaletteOpen)
  const togglePanel = useUiStore((s) => s.togglePanel)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  const showTrash = useUiStore((s) => s.showTrash)
  const { setMode } = useTheme()
  const navigate = useNavigate()
  const jump = useJumpToRow()
  const returnFocus = useReturnFocus()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const { data: members = [] } = useMembers()
  const allSheets = useAllSheets(members)
  const { data: results = [] } = useSearch(deferredQuery)

  const [selection, setSelection] = useState({ value: '', first: '' })

  const close = () => {
    setOpen(false)
    setQuery('')
    setSelection({ value: '', first: '' })
  }

  const commands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = []
    for (const member of members) {
      if (member.id === currentMember?.id) continue
      list.push({
        id: `member:${member.id}`,
        label: `Switch to ${member.name}`,
        icon: <Users aria-hidden className="size-4" />,
        keywords: `member tab ${member.name}`,
        run: () => navigate(memberPath(member.slug)),
      })
    }
    for (const { member, sheets } of allSheets) {
      for (const sheet of sheets) {
        list.push({
          id: `sheet:${sheet.id}`,
          label: `Go to ${member.name} · ${sheet.name}`,
          icon: <Table2 aria-hidden className="size-4" />,
          keywords: `sheet ${member.name} ${sheet.name}`,
          run: () => navigate(sheetPath(member.slug, sheet.slug)),
        })
      }
    }
    const themes: { mode: ThemeMode; label: string; icon: ReactNode }[] = [
      { mode: 'system', label: 'Theme: System', icon: <Monitor aria-hidden className="size-4" /> },
      { mode: 'light', label: 'Theme: Light', icon: <Sun aria-hidden className="size-4" /> },
      { mode: 'dark', label: 'Theme: Dark', icon: <Moon aria-hidden className="size-4" /> },
    ]
    for (const t of themes) {
      list.push({
        id: `theme:${t.mode}`,
        label: t.label,
        icon: t.icon,
        keywords: `theme appearance mode ${t.mode}`,
        run: () => setMode(t.mode),
      })
    }
    list.push({
      id: 'panel',
      label: 'Toggle side panel',
      icon: <PanelRight aria-hidden className="size-4" />,
      keywords: 'calendar panel this week right',
      shortcut: ['Mod', '.'],
      run: togglePanel,
    })
    list.push({
      id: 'today',
      label: 'Go to Today',
      icon: <Sun aria-hidden className="size-4" />,
      keywords: 'today due overdue added this week agenda',
      run: () => navigate('/today'),
    })
    list.push({
      id: 'trash',
      label: 'Open Trash',
      icon: <Trash2 aria-hidden className="size-4" />,
      keywords: 'trash deleted restore bin',
      run: showTrash,
    })
    list.push({
      id: 'shortcuts',
      label: 'Show keyboard shortcuts',
      icon: <Keyboard aria-hidden className="size-4" />,
      keywords: 'help keys keyboard',
      shortcut: ['?'],
      run: () => setShortcutsOpen(true),
    })
    return list
  }, [
    members,
    allSheets,
    currentMember?.id,
    navigate,
    setMode,
    togglePanel,
    setShortcutsOpen,
    showTrash,
  ])

  const q = deferredQuery.toLowerCase()
  const visibleCommands = q
    ? commands.filter((c) =>
        q.split(/\s+/).every((t) => `${c.label} ${c.keywords}`.toLowerCase().includes(t)),
      )
    : commands
  const groups = groupResults(results)

  // The selection follows the first item on screen whenever it changes (new results, a filtered
  // command list), so Enter always opens the top match. cmdk only selects the first item itself
  // when nothing is selected, and its old selection can outlive the items it pointed at (results
  // arrive after the commands they replace), which left Enter doing nothing.
  const firstResult = groups[0]?.results[0]
  const firstValue = firstResult ? `row:${firstResult.row.id}` : (visibleCommands[0]?.id ?? '')
  const selectedValue = selection.first === firstValue ? selection.value : firstValue

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          {...returnFocus}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-card border border-border bg-surface-raised shadow-popover data-[state=open]:animate-fade-in"
          data-testid="command-palette"
        >
          <VisuallyHidden.Root>
            <Dialog.Title>Search and commands</Dialog.Title>
          </VisuallyHidden.Root>
          <Command
            shouldFilter={false}
            loop
            label="Search and commands"
            value={selectedValue}
            onValueChange={(value) => setSelection({ value, first: firstValue })}
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search aria-hidden className="size-[18px] shrink-0 text-muted" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search people, companies, tags, or type a command"
                className="h-[52px] min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
              />
              <Kbd keys={['Esc']} />
            </div>
            <Command.List className="max-h-[min(60vh,480px)] overflow-y-auto overscroll-contain p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                No matches for “{query.trim()}”. Try a name, company, tag or phone number.
              </Command.Empty>
              {groups.map((group) => (
                <Command.Group
                  key={group.label}
                  heading={group.label}
                  className={cn('pb-1', groupClassName)}
                >
                  {group.results.map((result) => (
                    <ResultItem
                      key={result.row.id}
                      result={result}
                      query={deferredQuery}
                      onSelect={() => {
                        close()
                        jump({ member: result.member, sheet: result.sheet, rowId: result.row.id })
                      }}
                    />
                  ))}
                </Command.Group>
              ))}
              {visibleCommands.length > 0 ? (
                <Command.Group heading="Commands" className={groupClassName}>
                  {visibleCommands.map((command) => (
                    <Command.Item
                      key={command.id}
                      value={command.id}
                      onSelect={() => {
                        close()
                        command.run()
                      }}
                      className={itemClassName}
                    >
                      <span className="text-secondary">{command.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.shortcut ? <Kbd keys={command.shortcut} /> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
