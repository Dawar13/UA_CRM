import { type KeyboardEvent, useRef, useState } from 'react'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu'
import { warmthValues } from '@/domain/schemas'
import type { Warmth } from '@/domain/types'
import { warmthLabel, warmthShortcut } from '@/domain/warmth'
import { cn } from '@/lib/cn'

/** The soft chip: a two-stop gradient, the warmth's text colour and a hairline of its border. */
const toneClassName: Record<Warmth, string> = {
  warm: 'bg-[image:linear-gradient(180deg,var(--warm-bg-top),var(--warm-bg))] text-warm shadow-[inset_0_0_0_1px_var(--warm-border)]',
  waiting:
    'bg-[image:linear-gradient(180deg,var(--waiting-bg-top),var(--waiting-bg))] text-waiting shadow-[inset_0_0_0_1px_var(--waiting-border)]',
  cold: 'bg-[image:linear-gradient(180deg,var(--cold-bg-top),var(--cold-bg))] text-cold shadow-[inset_0_0_0_1px_var(--cold-border)]',
}

/** The small square before the label, in the warmth's cell colour. */
const cellClassName: Record<Warmth, string> = {
  warm: 'bg-warm-cell',
  waiting: 'bg-waiting-cell',
  cold: 'bg-cold-cell',
}

/** sm is the grid chip (22px), md the larger one (30px). */
const sizeClassName = {
  sm: 'h-[22px] gap-1.5 px-2 text-xs',
  md: 'h-[30px] gap-1.5 px-3 text-[12.5px]',
} as const

/**
 * The warmth a digit selects in the warmth menu: "1" warm, "2" waiting, "3" cold, "0" clear
 * (null). Undefined for any other key.
 */
export function nextWarmthFromKey(key: string): Warmth | null | undefined {
  for (const warmth of [...warmthValues, null]) {
    if (warmthShortcut(warmth) === key) return warmth
  }
  return undefined
}

/** Accessible name: "Warmth: Warm", "Warmth: none". */
export function warmthAccessibleName(value: Warmth | null): string {
  return `Warmth: ${value ? warmthLabel(value) : 'none'}`
}

function WarmthSquare({ value, className }: { value: Warmth; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-1.5 shrink-0 rounded-[1.5px]', cellClassName[value], className)}
    />
  )
}

export interface WarmthChipProps {
  value: Warmth | null
  /** Makes the chip a menu button. Without it the chip is display only. */
  onChange?: (next: Warmth | null) => void
  /** False inside the grid, which is a single tab stop (tabIndex -1). */
  tabbable?: boolean
  size?: 'sm' | 'md'
  /**
   * Show the empty "Set warmth" affordance at all times. By default it only appears while an
   * ancestor `group/row` is hovered, active (`data-active="true"`) or holds focus.
   */
  alwaysShowEmpty?: boolean
  className?: string
}

/**
 * Warm (olive), Waiting (ochre) or Cold (brick), set by hand: a soft chip with a small square in
 * the warmth's colour before the label. Clicking opens a small menu:
 * Warm (1), Waiting (2), Cold (3), Clear (0); the digits work while the menu is open.
 */
export function WarmthChip({
  value,
  onChange,
  tabbable = true,
  size = 'md',
  alwaysShowEmpty = false,
  className,
}: WarmthChipProps) {
  const [armed, setArmed] = useState(false)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (!onChange) {
    if (!value) return null
    return (
      <span
        data-warmth={value}
        className={cn(
          'inline-flex shrink-0 items-center rounded-chip font-semibold whitespace-nowrap',
          sizeClassName[size],
          toneClassName[value],
          className,
        )}
      >
        <WarmthSquare value={value} />
        <span className="sr-only">Warmth: </span>
        {warmthLabel(value)}
      </span>
    )
  }

  const choose = (next: Warmth | null) => {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const next = nextWarmthFromKey(event.key)
    if (next === undefined) return
    event.preventDefault()
    choose(next)
  }

  const buttonProps = {
    type: 'button' as const,
    // Empty: the name also carries the visible text, so speech users can say it.
    'aria-label': value ? warmthAccessibleName(value) : `${warmthAccessibleName(null)}, set warmth`,
    tabIndex: tabbable ? undefined : -1,
    'data-warmth': value ?? 'none',
    className: cn(
      'inline-flex shrink-0 cursor-default items-center rounded-chip whitespace-nowrap',
      'transition-[opacity,box-shadow,color,border-color] duration-(--duration-fast) ease-out',
      sizeClassName[size],
      value
        ? [
            toneClassName[value],
            'font-semibold',
            'hover:shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_40%,transparent)] data-[state=open]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,currentColor_40%,transparent)]',
          ]
        : [
            'border border-dashed border-border font-medium text-muted hover:border-border-strong hover:text-secondary',
            'data-[state=open]:border-border-strong data-[state=open]:text-secondary',
            !alwaysShowEmpty &&
              'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-data-[active=true]/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
          ],
      className,
    ),
    children: value ? (
      <>
        <WarmthSquare value={value} />
        {warmthLabel(value)}
      </>
    ) : (
      'Set warmth'
    ),
  }

  // The grid shows hundreds of chips, so the Radix menu mounts only on first use: until then
  // this is a plain button with the same name, looks and keys (pointer down, Enter, Space or
  // ArrowDown), which mounts the menu already open.
  if (!armed) {
    const arm = () => {
      setArmed(true)
      setOpen(true)
    }
    return (
      <button
        {...buttonProps}
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={false}
        data-state="closed"
        onPointerDown={(event) => {
          if (event.button !== 0 || event.ctrlKey) return
          // As Radix does: keep focus where it is; the menu takes it when it opens.
          event.preventDefault()
          arm()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault()
            arm()
          }
        }}
      />
    )
  }

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <button {...buttonProps} ref={triggerRef} />
      </MenuTrigger>
      <MenuContent
        className="min-w-40"
        onKeyDown={onMenuKeyDown}
        onCloseAutoFocus={(event) => {
          if (tabbable) return
          // Inside the grid, hand focus back to the grid's active cell rather than the chip.
          const host = triggerRef.current?.closest<HTMLElement>('[tabindex="0"]')
          if (host) {
            event.preventDefault()
            host.focus()
          }
        }}
      >
        <MenuRadioGroup
          value={value ?? ''}
          onValueChange={(next) => {
            const warmth = warmthValues.find((w) => w === next)
            if (warmth) choose(warmth)
          }}
        >
          {warmthValues.map((warmth) => (
            <MenuRadioItem
              key={warmth}
              value={warmth}
              shortcut={[warmthShortcut(warmth)]}
              icon={<WarmthSquare value={warmth} className="size-2 rounded-[2px]" />}
            >
              {warmthLabel(warmth)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem
          className="pl-7"
          shortcut={[warmthShortcut(null)]}
          disabled={value === null}
          onSelect={() => choose(null)}
        >
          Clear
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export interface WarmthRadioGroupProps {
  value: Warmth | null
  onChange: (next: Warmth | null) => void
  disabled?: boolean
  className?: string
}

/**
 * Warmth as three soft chips in a radio group (the expanded row). The chosen one wears its
 * warmth's gradient, border and text; the others are plain with a coloured square.
 *
 * Keyboard: one tab stop (the chosen chip, or Warm). Arrows, Home and End move focus without
 * choosing, so stepping across does not log a warmth change per key; Space or Enter chooses.
 * The menu digits work here too: 1 warm, 2 waiting, 3 cold, 0 clear. Choosing the chosen chip
 * again clears warmth.
 */
export function WarmthRadioGroup({
  value,
  onChange,
  disabled = false,
  className,
}: WarmthRadioGroupProps) {
  const refs = useRef<Partial<Record<Warmth, HTMLButtonElement | null>>>({})
  const tabStop = value ?? warmthValues[0]

  const focusAt = (index: number) => {
    const count = warmthValues.length
    const warmth = warmthValues[((index % count) + count) % count]
    if (warmth) refs.current[warmth]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || disabled) return
    const from = warmthValues.findIndex((w) => refs.current[w] === event.target)
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        focusAt(from + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        focusAt(from - 1)
        break
      case 'Home':
        focusAt(0)
        break
      case 'End':
        focusAt(warmthValues.length - 1)
        break
      default: {
        const next = nextWarmthFromKey(event.key)
        if (next === undefined) return
        if (next !== value) onChange(next)
        if (next) refs.current[next]?.focus()
      }
    }
    event.preventDefault()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Warmth"
      onKeyDown={onKeyDown}
      className={cn('flex flex-wrap gap-1.5', className)}
    >
      {warmthValues.map((warmth) => {
        const checked = value === warmth
        return (
          // biome-ignore lint/a11y/useSemanticElements: a styled chip; the group handles arrow keys.
          <button
            key={warmth}
            ref={(el) => {
              refs.current[warmth] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-keyshortcuts={warmthShortcut(warmth)}
            data-warmth={warmth}
            tabIndex={warmth === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(checked ? null : warmth)}
            className={cn(
              'inline-flex h-[30px] cursor-default items-center gap-[7px] rounded-control px-3 text-[12.5px] whitespace-nowrap',
              'transition-[background-color,box-shadow,color] duration-(--duration-fast) ease-out',
              'disabled:pointer-events-none disabled:opacity-50',
              checked
                ? [toneClassName[warmth], 'font-semibold']
                : 'bg-bg font-medium text-secondary shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-hover hover:text-text',
            )}
          >
            <WarmthSquare value={warmth} className="size-2 rounded-[2px]" />
            {warmthLabel(warmth)}
          </button>
        )
      })}
    </div>
  )
}
