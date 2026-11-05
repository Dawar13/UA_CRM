import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'

/** Loading placeholder. Hidden from assistive tech; pair it with an aria-busy region. */
export function Skeleton({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('h-3 animate-pulse rounded-control bg-border/60', className)}
      {...props}
    />
  )
}
