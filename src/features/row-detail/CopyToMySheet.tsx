/**
 * "Copy to my sheet" on another member's row: pick one of your sheets, and a linked copy of the
 * contact is added there. Shown only when you have a sheet to copy into.
 */
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useJumpToRow } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/Menu'
import { useCopyRow, useMembers, useSheets } from '@/data/hooks'
import { useRepository } from '@/data/RepositoryContext'
import { can, PermissionDenied } from '@/domain/permissions'
import type { Row } from '@/domain/types'

export function CopyToMySheet({ row }: { row: Row }) {
  const actor = useActor()
  const { data: sheets = [] } = useSheets(actor?.id)
  const { data: members = [] } = useMembers()
  const copy = useCopyRow()
  const jump = useJumpToRow()
  const repo = useRepository()
  if (!actor || sheets.length === 0) return null
  if (!can(actor, 'copyToMySheet', { source: row, destination: { memberId: actor.id } })) {
    return null
  }
  const me = members.find((m) => m.id === actor.id) ?? actor

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" data-testid="copy-to-my-sheet">
          <Copy aria-hidden />
          Copy to my sheet
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-52">
        <MenuLabel>Copy {row.name} to</MenuLabel>
        {sheets.map((sheet) => (
          <MenuItem
            key={sheet.id}
            onSelect={async () => {
              const doCopy = () =>
                copy.mutate(
                  { row, destination: sheet, actorId: actor.id },
                  {
                    onSuccess: (result) =>
                      toast(`Copied to ${sheet.name}`, {
                        action: {
                          label: 'Open',
                          onClick: () => jump({ member: me, sheet, rowId: result.row.id }),
                        },
                      }),
                    onError: (error) =>
                      toast.error(
                        error instanceof PermissionDenied
                          ? error.message
                          : "Couldn't copy the contact. Nothing was added.",
                      ),
                  },
                )
              // The duplicate check: do you have them already?
              const found = await repo
                .findDuplicates({
                  name: row.name,
                  phone: row.phone,
                  email: row.email,
                  linkedin: row.linkedin,
                  company: row.company,
                })
                .catch(() => [])
              const yours = found.filter(
                (c) => c.location.member.id === actor.id && c.location.row.id !== row.id,
              )
              const first = yours[0]
              if (!first) {
                doCopy()
                return
              }
              toast(
                `You may already have ${row.name}: ${first.location.row.name} in your ${first.location.sheet.name}`,
                {
                  duration: 12_000,
                  action: { label: 'Copy anyway', onClick: doCopy },
                  cancel: {
                    label: 'Open yours',
                    onClick: () =>
                      jump({
                        member: first.location.member,
                        sheet: first.location.sheet,
                        rowId: first.location.row.id,
                      }),
                  },
                },
              )
            }}
          >
            {sheet.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
