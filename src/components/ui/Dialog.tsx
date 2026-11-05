import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconButton } from './IconButton'

/** Dialogs are for confirmations, imports and multi-step flows only, never routine edits. */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export interface DialogContentProps
  extends Omit<ComponentPropsWithRef<typeof DialogPrimitive.Content>, 'title'> {
  /** Required: every dialog has a visible title, which is also its accessible name. */
  title: ReactNode
  description?: ReactNode
  /** Hide the top-right close button (Esc still closes). */
  hideClose?: boolean
}

export function DialogContent({
  title,
  description,
  hideClose = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 grid justify-items-center overflow-y-auto bg-overlay px-4 pt-[12vh] pb-8',
          'items-start data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        )}
      >
        <DialogPrimitive.Content
          // Without a description, tell Radix not to look for one.
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          className={cn(
            'relative w-full max-w-md rounded-card border border-border bg-surface-raised p-5 text-text shadow-popover',
            'data-[state=open]:animate-dialog-in data-[state=closed]:animate-pop-out',
            className,
          )}
          {...props}
        >
          <div className={cn('flex flex-col gap-1', !hideClose && 'pr-8')}>
            <DialogPrimitive.Title className="text-md font-semibold tracking-[-0.01em] text-text">
              {title}
            </DialogPrimitive.Title>
            {description !== undefined ? (
              <DialogPrimitive.Description className="text-sm text-secondary">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {children !== undefined ? <div className="mt-4">{children}</div> : null}
          {hideClose ? null : (
            <DialogPrimitive.Close asChild>
              <IconButton aria-label="Close" size="sm" className="absolute top-3.5 right-3.5">
                <X aria-hidden="true" />
              </IconButton>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  )
}

/** Right-aligned row of dialog actions. */
export function DialogFooter({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />
}
