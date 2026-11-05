import { Pill } from '@/components/ui/Pill'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { type TagColour, tagColourNames } from '@/styles/tokens'

/** Static class names per palette hue, so Tailwind sees every one. */
export const tagDotClassName: Record<TagColour, string> = {
  indigo: 'bg-tag-indigo',
  violet: 'bg-tag-violet',
  pink: 'bg-tag-pink',
  orange: 'bg-tag-orange',
  amber: 'bg-tag-amber',
  lime: 'bg-tag-lime',
  teal: 'bg-tag-teal',
  slate: 'bg-tag-slate',
}

/** A palette hue name; anything else (for example a stale colour) falls back to slate. */
export function toTagColour(colour: string): TagColour {
  return tagColourNames.find((c) => c === colour) ?? 'slate'
}

/** True when the chip's label is cut off with an ellipsis. */
function labelIsTruncated(chip: HTMLElement): boolean {
  const label = chip.querySelector<HTMLElement>('[data-tag-label]')
  return label ? label.scrollWidth > label.clientWidth : false
}

export interface TagChipProps {
  name: string
  /** Palette hue (TagColour). Typed as string because stored tags carry a plain string. */
  colour: TagColour | string
  className?: string
}

/**
 * A 6px coloured dot and the tag name in a neutral pill. Long names truncate; the tooltip with
 * the full name only opens when the name is actually cut off. Stateless until hovered.
 */
export function TagChip({ name, colour, className }: TagChipProps) {
  const hue = toTagColour(colour)
  return (
    <Tooltip content={name} openWhen={labelIsTruncated}>
      <span
        data-tag={name}
        data-colour={hue}
        className={cn(
          'inline-flex h-5 max-w-40 min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-pill-border bg-pill-bg px-2',
          'text-xs leading-none text-secondary',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', tagDotClassName[hue])}
        />
        <span data-tag-label="" className="min-w-0 truncate py-0.5">
          {name}
        </span>
      </span>
    </Tooltip>
  )
}

export interface TagListProps {
  tags: readonly { id: string; name: string; colour: TagColour | string }[]
  /** How many chips to show before the "+N" pill. */
  max?: number
  className?: string
}

/**
 * Up to `max` tag chips, then a "+N" pill whose tooltip lists the rest. The first chip keeps its
 * full name when it fits (up to 10rem or 65% of the cell); later chips give way and truncate.
 */
export function TagList({ tags, max = 2, className }: TagListProps) {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const rest = tags.slice(max)
  const restNames = rest.map((t) => t.name).join(', ')
  return (
    <span className={cn('flex min-w-0 items-center gap-1 overflow-hidden', className)}>
      {shown.map((tag, i) => (
        <TagChip
          key={tag.id}
          name={tag.name}
          colour={tag.colour}
          className={i === 0 ? 'max-w-[min(10rem,65%)] shrink-0' : 'shrink'}
        />
      ))}
      {rest.length > 0 ? (
        <Tooltip content={restNames}>
          <Pill data-testid="tag-overflow" className="tabular-nums">
            <span aria-hidden="true">+{rest.length}</span>
            <span className="sr-only">
              {rest.length} more {rest.length === 1 ? 'tag' : 'tags'}: {restNames}
            </span>
          </Pill>
        </Tooltip>
      ) : null}
    </span>
  )
}
