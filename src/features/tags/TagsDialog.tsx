/**
 * The tag library: one shared vocabulary across every tab. Anyone creates tags; only the member
 * who created one renames, recolours or deletes it, and only while nobody else's rows use it
 * (the refusal names whose rows do).
 */
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useActor } from '@/auth/AuthContext'
import { tagDotClassName } from '@/components/crm/TagChip'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { useDeleteTag, useMembers, useTags, useUpdateTag } from '@/data/hooks'
import type { Tag } from '@/domain/types'
import { cn } from '@/lib/cn'
import { type TagColour, tagColourNames } from '@/styles/tokens'

function TagItem({ tag, creator }: { tag: Tag; creator: string | undefined }) {
  const actor = useActor()
  const update = useUpdateTag()
  const remove = useDeleteTag()
  const [name, setName] = useState(tag.name)
  const mine = actor !== null && tag.createdBy === actor.id

  const rename = () => {
    if (!actor || name.trim() === '' || name.trim() === tag.name) {
      setName(tag.name)
      return
    }
    update.mutate({ tag, patch: { name }, actorId: actor.id }, { onError: () => setName(tag.name) })
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2" data-testid="tag-item">
      <span className={cn('size-2.5 shrink-0 rounded-[3px]', tagDotClassName[tag.colour])} />
      {mine ? (
        <Input
          aria-label={`Name of ${tag.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              rename()
            }
          }}
          className="h-7 min-w-0 flex-1"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm text-text">{tag.name}</span>
      )}
      {mine ? (
        <span className="flex gap-1">
          {tagColourNames.map((colour: TagColour) => (
            <button
              key={colour}
              type="button"
              aria-pressed={tag.colour === colour}
              aria-label={`Colour ${colour} for ${tag.name}`}
              onClick={() =>
                actor &&
                tag.colour !== colour &&
                update.mutate({ tag, patch: { colour }, actorId: actor.id })
              }
              className={cn(
                'size-4 rounded-[4px]',
                tagDotClassName[colour],
                tag.colour === colour &&
                  'ring-2 ring-focus ring-offset-1 ring-offset-surface-raised',
              )}
            />
          ))}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-muted">Created by {creator ?? 'a member'}</span>
      )}
      {mine ? (
        <IconButton
          aria-label={`Delete ${tag.name}`}
          tooltip="Delete"
          onClick={() => actor && remove.mutate({ tag, actorId: actor.id })}
        >
          <Trash2 className="size-4" />
        </IconButton>
      ) : null}
    </li>
  )
}

export function TagsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: tags = [] } = useTags()
  const { data: members = [] } = useMembers()
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Tags"
        description="One shared set of tags. You can change the ones you created while nobody else uses them."
        className="max-w-[560px]"
      >
        {tags.length === 0 ? (
          <p className="text-sm text-secondary">
            No tags yet. Type #name in quick add, or create one while tagging a row.
          </p>
        ) : (
          <ul className="flex max-h-[56vh] flex-col divide-y divide-border overflow-y-auto rounded-card border border-border">
            {tags.map((tag) => (
              <TagItem
                key={`${tag.id}-${tag.name}`}
                tag={tag}
                creator={nameOf.get(tag.createdBy ?? '')}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
