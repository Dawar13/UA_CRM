import type { ComponentPropsWithRef } from 'react'
import { cn } from '@/lib/cn'
import { fieldClassName } from './Input'

export type TextareaProps = ComponentPropsWithRef<'textarea'>

/** Long text. Line height 1.6 as for all long text. */
export function Textarea({ className, rows, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows ?? 3}
      className={cn(fieldClassName, 'min-h-20 resize-y px-2.5 py-2 leading-[1.6]', className)}
      {...props}
    />
  )
}
