import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * Buttons. Primary is the UA blue fill with white text; secondary is a hairline outline on the
 * raised surface; ghost has no chrome until hover; danger is the filled red for destructive
 * confirmations. Focus uses the global 2px ring with a 2px offset.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-control font-medium',
    'transition-[background-color,border-color,color,box-shadow] duration-(--duration-fast) ease-out',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-hover active:bg-brand-800',
        secondary:
          'border border-border bg-surface-raised text-text hover:border-border-strong/60 hover:bg-surface-hover active:bg-surface-subtle',
        ghost: 'text-secondary hover:bg-surface-hover hover:text-text active:bg-surface-subtle',
        danger: 'bg-danger text-danger-fg hover:bg-danger-hover active:bg-danger-hover',
      },
      size: {
        sm: 'h-7 px-2.5 text-sm [&_svg]:size-3.5',
        md: 'h-8 px-3 text-base [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Render the child element (for example a link) with button styles. */
  asChild?: boolean
}

export function Button({ variant, size, asChild = false, className, type, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className)
  if (asChild) return <Slot.Root className={classes} {...props} />
  return <button type={type ?? 'button'} className={classes} {...props} />
}
