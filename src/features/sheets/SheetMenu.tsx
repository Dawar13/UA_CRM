/**
 * Sheet options at the right of the folder tabs, in your own tab only: new sheet, rename, stages,
 * columns, move left or right, and delete to Trash (with Undo).
 */
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  ListOrdered,
  PenLine,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { memberPath } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { useDeleteSheet, useRenameSheet, useReorderSheets } from '@/data/hooks'
import type { Member, Sheet } from '@/domain/types'
import { ColumnsDialog } from './ColumnsDialog'
import { NewSheetDialog } from './NewSheetDialog'
import { StageEditorDialog } from './StageEditorDialog'

function RenameSheetDialog({
  sheet,
  open,
  onOpenChange,
}: {
  sheet: Sheet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actor = useActor()
  const rename = useRenameSheet()
  const [name, setName] = useState(sheet.name)
  const id = useId()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!actor || name.trim() === '') return
    rename.mutate({ sheet, name, actorId: actor.id }, { onSuccess: () => onOpenChange(false) })
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setName(sheet.name)
        onOpenChange(next)
      }}
    >
      <DialogContent title="Rename sheet">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              Name
            </label>
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={name.trim() === ''}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type OpenDialog = 'new' | 'rename' | 'stages' | 'columns' | null

export function SheetMenu({
  member,
  sheets,
  sheet,
}: {
  member: Member
  sheets: readonly Sheet[]
  sheet: Sheet
}) {
  const actor = useActor()
  const navigate = useNavigate()
  const reorder = useReorderSheets()
  const remove = useDeleteSheet()
  const [open, setOpen] = useState<OpenDialog>(null)
  const index = sheets.findIndex((s) => s.id === sheet.id)
  const ids = sheets.map((s) => s.id)

  const move = (by: number) => {
    if (!actor) return
    const next = [...ids]
    const [id] = next.splice(index, 1)
    if (id) next.splice(index + by, 0, id)
    reorder.mutate({ memberId: member.id, ids: next, before: ids, actorId: actor.id })
  }

  const dialog = (which: Exclude<OpenDialog, null>) => ({
    open: open === which,
    onOpenChange: (next: boolean) => setOpen(next ? which : null),
  })

  return (
    <>
      <IconButton
        aria-label="New sheet"
        tooltip="New sheet"
        onClick={() => setOpen('new')}
        data-testid="new-sheet"
      >
        <Plus className="size-4" />
      </IconButton>
      <Menu>
        <MenuTrigger asChild>
          <IconButton aria-label="Sheet options" tooltip="Sheet options">
            <SlidersHorizontal className="size-4" />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end" className="w-56">
          <MenuItem onSelect={() => setOpen('rename')}>
            <PenLine aria-hidden />
            Rename sheet
          </MenuItem>
          <MenuItem onSelect={() => setOpen('stages')}>
            <ListOrdered aria-hidden />
            {sheet.stages.length > 0 ? 'Edit stages' : 'Add stages'}
          </MenuItem>
          <MenuItem onSelect={() => setOpen('columns')}>
            <Columns3 aria-hidden />
            Columns
          </MenuItem>
          <MenuSeparator />
          <MenuItem disabled={index <= 0} onSelect={() => move(-1)}>
            <ArrowLeft aria-hidden />
            Move left
          </MenuItem>
          <MenuItem disabled={index < 0 || index >= sheets.length - 1} onSelect={() => move(1)}>
            <ArrowRight aria-hidden />
            Move right
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onSelect={() => {
              if (!actor) return
              remove.mutate({ sheet, actorId: actor.id })
              navigate(memberPath(member.slug))
            }}
          >
            <Trash2 aria-hidden />
            Delete sheet
          </MenuItem>
        </MenuContent>
      </Menu>
      <NewSheetDialog member={member} {...dialog('new')} />
      <RenameSheetDialog sheet={sheet} {...dialog('rename')} />
      <StageEditorDialog
        key={`${sheet.id}-${sheet.updatedAt}`}
        sheet={sheet}
        {...dialog('stages')}
      />
      <ColumnsDialog sheet={sheet} {...dialog('columns')} />
    </>
  )
}
