import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'

/** A small, fully rounded label: dropdown values, counts, the "Internal CRM" label. */
export const pillVariants = cva(
  'inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full text-xs leading-none',
  {
    variants: {
      tone: {
        neutral: 'border border-pill-border bg-pill-bg text-secondary',
        brand: 'bg-brand-tint font-medium text-brand-tint-fg',
        outline: 'border border-border text-secondary',
      },
      size: {
        sm: 'h-5 px-2',
        md: 'h-6 px-2.5',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
)

export interface PillProps
  extends ComponentPropsWithRef<'span'>,
    VariantProps<typeof pillVariants> {}

export function Pill({ tone, size, className, ...props }: PillProps) {
  return <span className={cn(pillVariants({ tone, size }), className)} {...props} />
}
