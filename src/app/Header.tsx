import { useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Hash,
  Keyboard,
  MoreHorizontal,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { useState } from 'react'
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
import { TagsDialog } from '@/features/tags/TagsDialog'
import { TeamDialog } from '@/features/team/TeamDialog'
import { isDevBuild } from '@/lib/env'
import { AccountMenuItems, ChangePasswordDialog, OfflineNotice } from './AccountMenu'
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
  const showTrash = useUiStore((s) => s.showTrash)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-6 border-b border-border bg-bg px-5">
      <BrandLockup />
      <nav aria-label="Members" className="flex min-w-0 items-center">
        <MemberTabs
          members={members.map((m) => ({ id: m.id, name: m.name }))}
          value={member.id}
          onValueChange={(id) => {
            const next = members.find((m) => m.id === id)
            if (next) navigate(memberPath(next.slug))
          }}
        />
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <OfflineNotice />
        <Tooltip content="Search and commands" shortcut={['Mod', 'K']}>
          {/* A soft pill: no border, the input fill, the shortcut on a paper keycap. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="inline-flex h-[34px] w-[300px] min-w-0 shrink items-center gap-2 rounded-[8px] bg-surface-hover pr-1.5 pl-2.5 text-sm text-muted transition-colors duration-(--duration-fast) ease-out hover:bg-tile hover:text-secondary"
            data-testid="search-trigger"
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">
              Search people, companies, tags
            </span>
            <Kbd keys={['Mod', 'K']} joined />
          </button>
        </Tooltip>
        <ThemeToggle variant="secondary" size="lg" />
        <Menu>
          <MenuTrigger asChild>
            <IconButton aria-label="More" tooltip="More" variant="secondary" size="lg">
              <MoreHorizontal />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end" className="w-64">
            <AccountMenuItems members={members} onChangePassword={() => setPasswordOpen(true)} />
            <MenuItem onSelect={() => setTeamOpen(true)}>
              <Users aria-hidden className="size-4" />
              Team
            </MenuItem>
            <MenuItem onSelect={() => setTagsOpen(true)}>
              <Hash aria-hidden className="size-4" />
              Tags
            </MenuItem>
            <MenuItem onSelect={showTrash}>
              <Trash2 aria-hidden className="size-4" />
              Trash
            </MenuItem>
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
        <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
        <TeamDialog open={teamOpen} onOpenChange={setTeamOpen} />
        <TagsDialog open={tagsOpen} onOpenChange={setTagsOpen} />
      </div>
    </header>
  )
}
