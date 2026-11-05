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
 * A tag in legend style: an 8px square in the tag's hue and the name beside it, no pill. Long
 * names truncate; the tooltip with the full name only opens when the name is actually cut off.
 * Stateless until hovered.
 */
export function TagChip({ name, colour, className }: TagChipProps) {
  const hue = toTagColour(colour)
  return (
    <Tooltip content={name} openWhen={labelIsTruncated}>
      <span
        data-tag={name}
        data-colour={hue}
        className={cn(
          'inline-flex max-w-40 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap',
          'text-[12.5px] leading-[1.3] text-secondary',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-[2px]', tagDotClassName[hue])}
        />
        <span data-tag-label="" className="min-w-0 truncate">
          {name}
        </span>
      </span>
    </Tooltip>
  )
}

export interface TagListProps {
  tags: readonly { id: string; name: string; colour: TagColour | string }[]
  /** How many tags to show before the "+N" count. */
  max?: number
  className?: string
}

/**
 * Up to `max` tags, 12px apart, then a "+N" count whose tooltip lists the rest. When more
 * follow, the first tag keeps its full name when it fits (up to 10rem or 65% of the cell) and
 * later ones give way and truncate; a tag on its own may use the whole width.
 */
export function TagList({ tags, max = 2, className }: TagListProps) {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const rest = tags.slice(max)
  const restNames = rest.map((t) => t.name).join(', ')
  const followed = shown.length > 1 || rest.length > 0
  return (
    <span className={cn('flex min-w-0 items-center gap-3 overflow-hidden', className)}>
      {shown.map((tag, i) => (
        <TagChip
          key={tag.id}
          name={tag.name}
          colour={tag.colour}
          className={
            i > 0 ? 'shrink' : followed ? 'max-w-[min(10rem,65%)] shrink-0' : 'max-w-full shrink'
          }
        />
      ))}
      {rest.length > 0 ? (
        <Tooltip content={restNames}>
          <span
            data-testid="tag-overflow"
            className="shrink-0 rounded-chip bg-tile px-[5px] py-px font-mono text-2xs leading-[1.4] whitespace-nowrap text-muted tabular-nums"
          >
            <span aria-hidden="true">+{rest.length}</span>
            <span className="sr-only">
              {rest.length} more {rest.length === 1 ? 'tag' : 'tags'}: {restNames}
            </span>
          </span>
        </Tooltip>
      ) : null}
    </span>
  )
}
