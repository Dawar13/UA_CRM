import { Tabs as TabsPrimitive } from 'radix-ui'
import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * Underline tabs on Radix. Arrow keys move between tabs and activate them (automatic
 * activation). The selected tab has a 2px underline in the text colour.
 *
 * `navTabTriggerClassName` and `NavTabLabel` are shared with MemberTabs and SheetTabs, where the
 * trigger fills the bar height and the focus ring sits on the inner label.
 */
export const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-stretch gap-1 border-b border-border', className)}
      {...props}
    />
  )
}

export const navTabTriggerClassName = cn(
  'group/tab relative flex shrink-0 cursor-default select-none items-center px-1 outline-none',
  'font-medium text-secondary transition-colors duration-(--duration-fast) ease-out',
  'hover:text-text data-[state=active]:text-text',
  'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  // The 2px underline sits on the bottom edge of the bar.
  'after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full',
  'after:bg-text after:opacity-0 after:transition-opacity after:duration-(--duration-fast)',
  'data-[state=active]:after:opacity-100',
)

/** Inner label of a nav tab; carries the focus ring so it hugs the text, not the full bar. */
export function NavTabLabel({ className, ...props }: ComponentPropsWithRef<'span'>) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 whitespace-nowrap rounded-control px-2 py-1',
        'group-focus-visible/tab:outline-2 group-focus-visible/tab:outline-offset-2 group-focus-visible/tab:outline-focus group-focus-visible/tab:outline-solid',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(navTabTriggerClassName, 'h-10 text-base', className)}
      {...props}
    >
      <NavTabLabel>{children}</NavTabLabel>
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('rounded-control pt-4', className)} {...props} />
}
