import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'
import { isApplePlatform } from '@/lib/platform'

/**
 * Key names accepted by `Kbd` and the `shortcut` props. "Mod" is ⌘ on Apple platforms and Ctrl
 * elsewhere. Anything else is shown as written ("K", "/", "?", "1").
 */
export type KeyName = string

const appleLabels: Record<string, string> = {
  Mod: '⌘',
  Meta: '⌘',
  Ctrl: '⌃',
  Control: '⌃',
  Shift: '⇧',
  Alt: '⌥',
  Option: '⌥',
  Enter: '↵',
  Backspace: '⌫',
}

const otherLabels: Record<string, string> = {
  Mod: 'Ctrl',
  Meta: 'Win',
  Control: 'Ctrl',
  Option: 'Alt',
}

const sharedLabels: Record<string, string> = {
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ' ': 'Space',
  Space: 'Space',
}

/** Display label for one key on this platform: "Mod" → "⌘" or "Ctrl". */
export function keyLabel(key: KeyName, apple: boolean = isApplePlatform()): string {
  const platformLabel = apple ? appleLabels[key] : otherLabels[key]
  return platformLabel ?? sharedLabels[key] ?? key
}

/** Plain-text form for tooltips and copy: "⌘K" on Apple, "Ctrl+K" elsewhere. */
export function formatKeys(keys: readonly KeyName[], apple: boolean = isApplePlatform()): string {
  const labels = keys.map((k) => keyLabel(k, apple))
  return apple ? labels.join('') : labels.join('+')
}

const ariaNames: Record<string, string> = {
  Ctrl: 'Control',
  Esc: 'Escape',
  Option: 'Alt',
}

/** Value for `aria-keyshortcuts`: "Meta+K" on Apple, "Control+K" elsewhere. */
export function ariaKeyShortcuts(
  keys: readonly KeyName[],
  apple: boolean = isApplePlatform(),
): string {
  return keys
    .map((k) => {
      if (k === 'Mod') return apple ? 'Meta' : 'Control'
      return ariaNames[k] ?? k
    })
    .join('+')
}

export interface KbdProps extends Omit<ComponentPropsWithRef<'kbd'>, 'children'> {
  keys: readonly KeyName[]
  /** "subtle" for use inside menus and tooltips. */
  tone?: 'default' | 'subtle'
  /**
   * One keycap for the whole shortcut ("Ctrl K", "⌘K"), as on the header search pill. By default
   * each key gets its own keycap.
   */
  joined?: boolean
}

const keycapClassName = cn(
  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-chip px-[5px]',
  'font-mono text-2xs font-medium leading-none tabular-nums',
)

const toneClassName = {
  // A hairline ring rather than a border, so keycaps never change the line height around them.
  default: 'bg-bg text-secondary shadow-[0_0_0_1px_var(--border)]',
  subtle: 'bg-transparent text-muted shadow-[0_0_0_1px_var(--border)]',
} as const

/** A keyboard shortcut in Geist Mono: one keycap per key, or one for the whole shortcut. */
export function Kbd({ keys, tone = 'default', joined = false, className, ...props }: KbdProps) {
  const apple = isApplePlatform()
  const labels = keys.map((key) => keyLabel(key, apple))
  return (
    <kbd
      className={cn('inline-flex items-center gap-1 font-mono not-italic', className)}
      {...props}
    >
      {joined ? (
        <kbd className={cn(keycapClassName, toneClassName[tone])}>
          {labels.join(apple ? '' : ' ')}
        </kbd>
      ) : (
        labels.map((label, i) => (
          <kbd
            // Keys can repeat ("Shift", "Shift" is unusual but harmless); position keeps them unique.
            // biome-ignore lint/suspicious/noArrayIndexKey: the key list is static and ordered.
            key={`${label}-${i}`}
            className={cn(keycapClassName, toneClassName[tone])}
          >
            {label}
          </kbd>
        ))
      )}
    </kbd>
  )
}
