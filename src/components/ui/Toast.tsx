import type { ReactNode } from 'react'
import { Toaster as Sonner, toast } from 'sonner'
import { cn } from '@/lib/cn'
import { buttonVariants } from './Button'

/** Undo toasts stay for 8 seconds (CLAUDE.md §2.13). */
export const TOAST_DURATION_MS = 8000

/**
 * The app's single toaster: sonner, unstyled and dressed in tokens. Toasts are announced through
 * sonner's polite live region. Mount once, inside the providers.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      duration={TOAST_DURATION_MS}
      gap={8}
      visibleToasts={3}
      offset={20}
      style={{ fontFamily: 'var(--font-family-sans)' }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: cn(
            'flex w-(--width) items-center gap-3 rounded-card border border-border bg-surface-raised',
            'py-2 pr-2 pl-4 text-base text-text shadow-popover',
          ),
          content: 'flex min-w-0 flex-1 flex-col gap-0.5 py-1',
          title: 'text-base text-text',
          description: 'text-sm text-secondary',
          icon: 'flex size-4 shrink-0 items-center justify-center text-secondary [&_svg]:size-4',
          error: '[&_[data-icon]]:text-cold',
          actionButton: cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            'font-semibold text-link hover:text-link',
          ),
          cancelButton: buttonVariants({ variant: 'ghost', size: 'sm' }),
        },
      }}
    />
  )
}

export { toast }

/** A toast with an Undo action, for every reversible change. */
export function undoToast(
  message: ReactNode,
  onUndo: () => void,
  options: { description?: ReactNode; id?: string | number } = {},
): string | number {
  return toast(message, {
    ...options,
    action: { label: 'Undo', onClick: () => onUndo() },
  })
}
