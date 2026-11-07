/**
 * A new sheet in your own tab, from one of the six templates or blank (CLAUDE.md §2.4). The name
 * starts as the template's and can be changed before creating.
 */
import { type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { sheetPath } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useCreateSheet } from '@/data/hooks'
import { templateKeys } from '@/domain/schemas'
import { templates } from '@/domain/templates'
import type { Member, TemplateKey } from '@/domain/types'
import { cn } from '@/lib/cn'

function templateHint(key: TemplateKey): string {
  const t = templates[key]
  if (key === 'blank') return 'Only the core columns, no stages'
  return t.stages.length > 0 ? t.stages.join(' → ') : 'No stages'
}

export function NewSheetDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actor = useActor()
  const navigate = useNavigate()
  const create = useCreateSheet()
  const [template, setTemplate] = useState<TemplateKey>('customers')
  const [name, setName] = useState(templates.customers.name)
  const [touched, setTouched] = useState(false)
  const nameId = useId()

  const choose = (key: TemplateKey) => {
    setTemplate(key)
    if (!touched) setName(key === 'blank' ? '' : templates[key].name)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!actor || name.trim() === '') return
    create.mutate(
      { memberId: member.id, name, template, actorId: actor.id },
      {
        onSuccess: (sheet) => {
          onOpenChange(false)
          setTouched(false)
          navigate(sheetPath(member.slug, sheet.slug))
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New sheet" description="Start from a template or blank.">
        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* A fieldset will not shrink below its content unless told to (min-w-0). */}
          <fieldset className="flex min-w-0 flex-col gap-1">
            <legend className="mb-1.5 text-sm font-medium">Template</legend>
            <div role="radiogroup" aria-label="Template" className="flex flex-col gap-1">
              {templateKeys.map((key) => (
                <label
                  key={key}
                  className={cn(
                    'flex min-w-0 cursor-default items-start gap-2.5 rounded-control border px-3 py-2',
                    template === key
                      ? 'border-focus bg-brand-tint'
                      : 'border-border hover:bg-surface-hover',
                  )}
                >
                  <input
                    type="radio"
                    name="template"
                    value={key}
                    checked={template === key}
                    onChange={() => choose(key)}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-text">{templates[key].name}</span>
                    {/* The whole stage list, wrapping onto a second line when it is long. */}
                    <span className="text-xs leading-snug text-pretty text-muted">
                      {templateHint(key)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setTouched(true)
              }}
              placeholder="Pilots, Vendors, Hiring…"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={name.trim() === '' || create.isPending}
            >
              Create sheet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
