import { cva } from 'class-variance-authority'
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ariaKeyShortcuts, type KeyName } from './Kbd'
import { Tooltip } from './Tooltip'

export const iconButtonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center rounded-control',
    'transition-[background-color,border-color,color] duration-(--duration-fast) ease-out',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        ghost:
          'text-secondary hover:bg-surface-hover hover:text-text active:bg-surface-subtle data-[state=open]:bg-surface-hover data-[state=open]:text-text',
        secondary:
          'border border-border bg-surface-raised text-secondary hover:bg-surface-hover hover:text-text active:bg-surface-subtle data-[state=open]:bg-surface-hover data-[state=open]:text-text',
      },
      size: {
        sm: 'size-7 [&_svg]:size-4',
        md: 'size-8 [&_svg]:size-[18px]',
        /** 34px, for the header. */
        lg: 'size-[34px] [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
)

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'aria-label'> {
  /** Required: an icon-only button needs an accessible name. */
  'aria-label': string
  /** Tooltip text; defaults to the aria-label when a shortcut is given. */
  tooltip?: ReactNode
  /** Shortcut shown in the tooltip and exposed through aria-keyshortcuts. */
  shortcut?: readonly KeyName[]
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  variant?: 'ghost' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

/** A square icon-only button. Wraps itself in a Tooltip when `tooltip` or `shortcut` is set. */
export function IconButton({
  tooltip,
  shortcut,
  tooltipSide = 'bottom',
  variant,
  size,
  className,
  type,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type ?? 'button'}
      aria-keyshortcuts={shortcut ? ariaKeyShortcuts(shortcut) : undefined}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  )
  if (tooltip === undefined && shortcut === undefined) return button
  return (
    <Tooltip content={tooltip ?? props['aria-label']} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  )
}
