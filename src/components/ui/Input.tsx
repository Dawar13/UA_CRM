import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'

/** Shared field chrome for Input and Textarea. */
export const fieldClassName = cn(
  'w-full min-w-0 rounded-control border border-border bg-surface-raised text-base text-text',
  'placeholder:text-muted',
  'transition-[border-color,box-shadow] duration-(--duration-fast) ease-out',
  'hover:border-border-strong/70',
  'focus-visible:border-focus',
  'aria-invalid:border-cold aria-invalid:focus-visible:outline-cold',
  'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted disabled:opacity-70 disabled:hover:border-border',
)

export type InputProps = ComponentPropsWithRef<'input'>

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type ?? 'text'}
      className={cn(fieldClassName, 'h-8 px-2.5', className)}
      {...props}
    />
  )
}
