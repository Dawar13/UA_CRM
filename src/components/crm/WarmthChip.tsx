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

const toneClassName: Record<Warmth, string> = {
  warm: 'bg-warm-bg text-warm',
  waiting: 'bg-waiting-bg text-waiting',
  cold: 'bg-cold-bg text-cold',
}

const dotClassName: Record<Warmth, string> = {
  warm: 'bg-warm',
  waiting: 'bg-waiting',
  cold: 'bg-cold',
}

const sizeClassName = {
  sm: 'h-5 gap-1 px-2 text-xs',
  md: 'h-6 gap-1.5 px-2.5 text-xs',
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

function WarmthDot({ value }: { value: Warmth }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-1.5 shrink-0 rounded-full', dotClassName[value])}
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
 * Warm (green), Waiting (amber) or Cold (red), set by hand. Clicking opens a small menu:
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
          'inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap',
          sizeClassName[size],
          toneClassName[value],
          className,
        )}
      >
        <WarmthDot value={value} />
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
      'inline-flex shrink-0 cursor-default items-center rounded-full font-medium whitespace-nowrap',
      'transition-[opacity,box-shadow,color,border-color] duration-(--duration-fast) ease-out',
      sizeClassName[size],
      value
        ? [
            toneClassName[value],
            'hover:ring-1 hover:ring-current/35 hover:ring-inset data-[state=open]:ring-1 data-[state=open]:ring-current/35 data-[state=open]:ring-inset',
          ]
        : [
            'border border-dashed border-border text-muted hover:border-border-strong hover:text-secondary',
            'data-[state=open]:border-border-strong data-[state=open]:text-secondary',
            !alwaysShowEmpty &&
              'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 group-data-[active=true]/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
          ],
      className,
    ),
    children: value ? (
      <>
        <WarmthDot value={value} />
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
              icon={<WarmthDot value={warmth} />}
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
