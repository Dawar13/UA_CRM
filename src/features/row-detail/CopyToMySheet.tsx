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
import { can, PermissionDenied } from '@/domain/permissions'
import type { Row } from '@/domain/types'

export function CopyToMySheet({ row }: { row: Row }) {
  const actor = useActor()
  const { data: sheets = [] } = useSheets(actor?.id)
  const { data: members = [] } = useMembers()
  const copy = useCopyRow()
  const jump = useJumpToRow()
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
            onSelect={() =>
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
            }
          >
            {sheet.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
