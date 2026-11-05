import { Separator as SeparatorPrimitive } from 'radix-ui'
import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'

/** A 1px hairline. Decorative by default (hidden from assistive tech). */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentPropsWithRef<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
      {...props}
    />
  )
}
