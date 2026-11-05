import { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'
import { popoverSurfaceClassName } from './Menu'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent({
  className,
  sideOffset = 6,
  align = 'start',
  collisionPadding = 8,
  ...props
}: ComponentPropsWithRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
          popoverSurfaceClassName,
          'w-72 p-3 origin-(--radix-popover-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
