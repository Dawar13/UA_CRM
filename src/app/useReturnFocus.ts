import { useCallback, useRef } from 'react'

/**
 * Focus handlers for Radix dialogs that open from a shortcut rather than a Trigger (the command
 * palette, the shortcut sheet). Radix returns focus to the dialog's Trigger on close; without one,
 * focus would fall to <body> and the keyboard user would lose their place. Spread the result onto
 * the dialog content: focus goes back to whatever had it when the dialog opened (usually the grid),
 * as long as it is still on the page.
 */
export function useReturnFocus() {
  const previous = useRef<HTMLElement | null>(null)

  // Radix calls this before it moves focus into the dialog, so activeElement is still the opener.
  const onOpenAutoFocus = useCallback(() => {
    const active = document.activeElement
    previous.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [])

  const onCloseAutoFocus = useCallback((event: Event) => {
    const target = previous.current
    previous.current = null
    if (target?.isConnected) {
      event.preventDefault()
      target.focus({ preventScroll: true })
    }
  }, [])

  return { onOpenAutoFocus, onCloseAutoFocus }
}
