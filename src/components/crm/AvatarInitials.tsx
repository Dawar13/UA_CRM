import { initials } from '@/domain/identity'
import { cn } from '@/lib/cn'
import { type TagColour, tagColourNames } from '@/styles/tokens'

/**
 * Soft tints of the tag palette over the page background. Text stays in --text, which keeps
 * well above 4.5:1 on every tint in both themes.
 */
const tintClassName: Record<TagColour, string> = {
  indigo:
    'bg-[color-mix(in_oklab,var(--tag-indigo)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-indigo)_32%,transparent)]',
  violet:
    'bg-[color-mix(in_oklab,var(--tag-violet)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-violet)_32%,transparent)]',
  pink: 'bg-[color-mix(in_oklab,var(--tag-pink)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-pink)_32%,transparent)]',
  orange:
    'bg-[color-mix(in_oklab,var(--tag-orange)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-orange)_32%,transparent)]',
  amber:
    'bg-[color-mix(in_oklab,var(--tag-amber)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-amber)_32%,transparent)]',
  lime: 'bg-[color-mix(in_oklab,var(--tag-lime)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-lime)_32%,transparent)]',
  teal: 'bg-[color-mix(in_oklab,var(--tag-teal)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-teal)_32%,transparent)]',
  slate:
    'bg-[color-mix(in_oklab,var(--tag-slate)_28%,var(--bg))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--tag-slate)_32%,transparent)]',
}

/** Deterministic hue for a name (FNV-1a over the trimmed, lowercased name). */
export function avatarHue(name: string): TagColour {
  let hash = 0x811c9dc5
  for (const ch of name.trim().toLowerCase()) {
    hash ^= ch.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return tagColourNames[(hash >>> 0) % tagColourNames.length] ?? 'slate'
}

export interface AvatarInitialsProps {
  name: string
  /** sm is 24px (grid rows), md is 28px. */
  size?: 'sm' | 'md'
  className?: string
}

/** Initials in a softly tinted circle. Hidden from assistive tech: the name sits beside it. */
export function AvatarInitials({ name, size = 'sm', className }: AvatarInitialsProps) {
  const hue = avatarHue(name)
  return (
    <span
      aria-hidden="true"
      data-hue={hue}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-text',
        size === 'sm' ? 'size-6 text-2xs' : 'size-7 text-xs',
        tintClassName[hue],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
