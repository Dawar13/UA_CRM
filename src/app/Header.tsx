import { useQueryClient } from '@tanstack/react-query'
import { Database, Keyboard, MoreHorizontal, RotateCcw, Search } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { BrandLockup } from '@/components/crm/BrandLockup'
import { MemberTabs } from '@/components/crm/MemberTabs'
import { ThemeSegmented, ThemeToggle } from '@/components/crm/ThemeToggle'
import { IconButton } from '@/components/ui/IconButton'
import { Kbd } from '@/components/ui/Kbd'
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu'
import { Tooltip } from '@/components/ui/Tooltip'
import { useRepository } from '@/data/RepositoryContext'
import type { Member } from '@/domain/types'
import { isDevBuild } from '@/lib/env'
import { memberPath, sheetPath } from './navigation'
import { useUiStore } from './uiStore'

function DeveloperItems() {
  const repository = useRepository()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (
    <>
      <MenuSeparator />
      <MenuGroup>
        <MenuLabel>Developer</MenuLabel>
        <MenuItem
          onSelect={async () => {
            await repository.resetSampleData()
            await queryClient.resetQueries()
            navigate('/')
            toast('Sample data reset')
          }}
        >
          <RotateCcw aria-hidden className="size-4" />
          Reset sample data
        </MenuItem>
        <MenuItem
          onSelect={async () => {
            const sheet = await repository.loadPerfSheet()
            const members = await repository.listMembers()
            const owner = members.find((m) => m.id === sheet.memberId)
            await queryClient.invalidateQueries()
            if (owner) navigate(sheetPath(owner.slug, sheet.slug))
            toast('Loaded the 2,000-row sheet')
          }}
        >
          <Database aria-hidden className="size-4" />
          Load 2,000-row sheet
        </MenuItem>
      </MenuGroup>
    </>
  )
}

export function Header({ members, member }: { members: readonly Member[]; member: Member }) {
  const navigate = useNavigate()
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)

  return (
    <header className="flex h-[var(--header-height)] shrink-0 items-center gap-6 border-b border-border bg-bg px-4">
      <BrandLockup />
      <span aria-hidden className="h-5 w-px bg-border" />
      <nav aria-label="Members" className="flex h-full min-w-0 items-stretch">
        <MemberTabs
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          value={member.id}
          onValueChange={(id) => {
            const next = members.find((m) => m.id === id)
            if (next) navigate(memberPath(next.slug))
          }}
        />
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip content="Search and commands" shortcut={['Mod', 'K']}>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="mr-1 inline-flex h-8 w-56 items-center gap-2 rounded-control border border-border bg-surface-subtle px-2.5 text-sm text-muted transition-colors duration-[var(--duration-fast)] hover:border-border-strong hover:text-secondary"
            data-testid="search-trigger"
          >
            <Search aria-hidden className="size-4" />
            <span className="flex-1 text-left">Search</span>
            <Kbd keys={['Mod', 'K']} />
          </button>
        </Tooltip>
        <ThemeToggle />
        <Menu>
          <MenuTrigger asChild>
            <IconButton aria-label="More" tooltip="More">
              <MoreHorizontal className="size-4" />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end" className="w-64">
            <MenuItem onSelect={() => setShortcutsOpen(true)} shortcut={['?']}>
              <Keyboard aria-hidden className="size-4" />
              Keyboard shortcuts
            </MenuItem>
            <MenuSeparator />
            <MenuGroup>
              <MenuLabel>Theme</MenuLabel>
              <div className="px-2 pb-1.5">
                <ThemeSegmented />
              </div>
            </MenuGroup>
            {isDevBuild ? <DeveloperItems /> : null}
          </MenuContent>
        </Menu>
      </div>
    </header>
  )
}
