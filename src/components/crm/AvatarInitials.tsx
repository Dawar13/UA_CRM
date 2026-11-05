import { initials } from '@/domain/identity'
import { cn } from '@/lib/cn'
import { type TagColour, tagColourNames } from '@/styles/tokens'

/**
 * Deterministic hue for a name (FNV-1a over the trimmed, lowercased name). Avatars are one calm
 * slate gradient now; the hue stays available for anything that wants a stable colour per name.
 */
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
  /** sm is 24px, md is 28px (grid rows). */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Initials on a soft slate gradient in a squarish tile (6px corners). Hidden from assistive
 * tech: the name always sits beside it.
 */
export function AvatarInitials({ name, size = 'sm', className }: AvatarInitialsProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[6px]',
        'bg-[image:linear-gradient(180deg,var(--avatar-top),var(--avatar-bottom))] text-avatar-fg',
        'text-[10.5px] leading-none font-semibold tracking-[0.02em]',
        size === 'sm' ? 'size-6' : 'size-7',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
