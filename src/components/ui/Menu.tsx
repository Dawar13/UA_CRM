import { Check } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ariaKeyShortcuts, Kbd, type KeyName } from './Kbd'

/** Surfaces shared by menus and popovers (also used for static previews on /design). */
export const popoverSurfaceClassName = cn(
  'z-50 rounded-card border border-border bg-surface-raised text-text shadow-popover outline-none',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
)

export const menuContentClassName = cn(
  popoverSurfaceClassName,
  'min-w-48 p-1 origin-(--radix-dropdown-menu-content-transform-origin)',
)

export const menuItemClassName = cn(
  'relative flex h-8 cursor-default select-none items-center gap-2 rounded-control px-2 text-base text-text outline-none',
  'data-[highlighted]:bg-surface-hover',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-secondary',
)

/**
 * Menus are non-modal by default: the rest of the page stays in the accessibility tree and
 * scrollable while a menu is open. Focus still moves into the menu; Esc and outside clicks close it.
 */
export function Menu({ modal = false, ...props }: ComponentProps<typeof DropdownMenu.Root>) {
  return <DropdownMenu.Root modal={modal} {...props} />
}
export const MenuTrigger = DropdownMenu.Trigger
export const MenuGroup = DropdownMenu.Group

export function MenuContent({
  className,
  sideOffset = 6,
  align = 'start',
  collisionPadding = 8,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(menuContentClassName, className)}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

function MenuShortcut({ keys }: { keys: readonly KeyName[] }) {
  return <Kbd keys={keys} tone="subtle" className="ml-auto pl-4" aria-hidden="true" />
}

export interface MenuItemProps extends ComponentPropsWithRef<typeof DropdownMenu.Item> {
  /** Leading icon. */
  icon?: ReactNode
  /** Shortcut shown on the right, for example ['1'] or ['Mod', 'K']. */
  shortcut?: readonly KeyName[]
  /** Red text for destructive items. */
  destructive?: boolean
}

export function MenuItem({
  className,
  icon,
  shortcut,
  destructive = false,
  children,
  ...props
}: MenuItemProps) {
  return (
    <DropdownMenu.Item
      aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
      className={cn(menuItemClassName, destructive && 'text-cold [&_svg]:text-cold', className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <MenuShortcut keys={shortcut} /> : null}
    </DropdownMenu.Item>
  )
}

export function MenuLabel({
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2 pt-2 pb-1 text-xs font-medium text-muted', className)}
      {...props}
    />
  )
}

export function MenuSeparator({
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenu.Separator>) {
  return (
    <DropdownMenu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
  )
}

export const MenuRadioGroup = DropdownMenu.RadioGroup

export interface MenuRadioItemProps extends ComponentPropsWithRef<typeof DropdownMenu.RadioItem> {
  icon?: ReactNode
  shortcut?: readonly KeyName[]
}

export function MenuRadioItem({
  className,
  icon,
  shortcut,
  children,
  ...props
}: MenuRadioItemProps) {
  return (
    <DropdownMenu.RadioItem
      aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
      className={cn(menuItemClassName, 'pr-2 pl-7', className)}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenu.ItemIndicator>
          <Check className="text-link!" strokeWidth={2.25} aria-hidden="true" />
        </DropdownMenu.ItemIndicator>
      </span>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <MenuShortcut keys={shortcut} /> : null}
    </DropdownMenu.RadioItem>
  )
}
