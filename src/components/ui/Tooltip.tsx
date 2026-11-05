import { Slot } from 'radix-ui'
import {
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { Kbd, type KeyName } from './Kbd'

/**
 * Tooltips are everywhere in the grid (every stage dot, tag and date), so they must cost nothing
 * until used. This one renders only its trigger (through Slot, so the trigger element is never
 * replaced) and mounts the bubble in a portal when it opens. Behaviour follows Radix Tooltip and
 * WCAG 1.4.13: opens after 300 ms on hover (instantly when moving between tooltips), instantly on
 * keyboard focus; closes on leave, blur, click, Esc or when the page scrolls under it; the bubble
 * can be hovered without closing.
 */

/** Same values as the Radix provider in app/providers.tsx. */
export const TOOLTIP_DELAY_MS = 300
const SKIP_DELAY_MS = 150
/** Grace period for moving the pointer from the trigger onto the bubble. */
const HOVER_GRACE_MS = 120
const COLLISION_PADDING = 8

/** Shared look for the tooltip bubble (also used for static previews on /design). */
export const tooltipContentClassName = cn(
  'z-50 flex max-w-72 items-center gap-2 rounded-control border border-border bg-surface-raised',
  'px-2 py-1 text-xs font-medium text-text shadow-popover',
  'data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in',
)

type Side = 'top' | 'right' | 'bottom' | 'left'
type Align = 'start' | 'center' | 'end'

/** Only one tooltip is open at a time; opening another closes this one. */
interface TooltipHandle {
  close: () => void
}
let active: TooltipHandle | null = null
let lastClosedAt = Number.NEGATIVE_INFINITY

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0
}

export interface TooltipProps {
  /** Tooltip text. Supplementary only: never the sole source of essential information. */
  content: ReactNode
  /** Shortcut shown as keycaps after the text, for example ['Mod', 'K']. */
  shortcut?: readonly KeyName[]
  side?: Side
  align?: Align
  sideOffset?: number
  /** Controlled open state. `onOpenChange` reports what the tooltip wants. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Checked when the tooltip is about to open; return false to stay closed (truncation). */
  openWhen?: (trigger: HTMLElement) => boolean
  /** Never opens when true. */
  disabled?: boolean
  delayDuration?: number
  /** The trigger. Must accept a ref and DOM props (a DOM element or a forwarding component). */
  children: ReactElement
  className?: string
}

/** `<Tooltip content="Search" shortcut={['Mod','K']}>{trigger}</Tooltip>` */
export function Tooltip({
  content,
  shortcut,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  open: openProp,
  onOpenChange,
  openWhen,
  disabled = false,
  delayDuration = TOOLTIP_DELAY_MS,
  children,
  className,
}: TooltipProps) {
  const [state, setState] = useState<'closed' | 'delayed-open' | 'instant-open'>('closed')
  const triggerRef = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pointerDown = useRef(false)
  const handle = useRef<TooltipHandle>({ close: () => {} })
  const id = useId()

  const controlled = openProp !== undefined
  const isOpen = !disabled && (controlled ? openProp : state !== 'closed')

  const clearTimer = () => {
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
  }

  const close = () => {
    clearTimer()
    if (active === handle.current) active = null
    lastClosedAt = now()
    setState('closed')
    onOpenChange?.(false)
  }

  const show = (how: 'delayed-open' | 'instant-open') => {
    clearTimer()
    const trigger = triggerRef.current
    if (disabled || !trigger) return
    if (openWhen && !openWhen(trigger)) return
    if (active && active !== handle.current) active.close()
    active = handle.current
    setState(how)
    onOpenChange?.(true)
  }

  handle.current.close = close

  const handlers = {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch' || disabled) return
      clearTimer()
      if (isOpen) return
      if (now() - lastClosedAt < SKIP_DELAY_MS || delayDuration <= 0) show('instant-open')
      else timer.current = setTimeout(() => show('delayed-open'), delayDuration)
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') return
      clearTimer()
      if (isOpen) timer.current = setTimeout(close, HOVER_GRACE_MS)
    },
    onPointerDown: () => {
      pointerDown.current = true
      document.addEventListener(
        'pointerup',
        () => {
          pointerDown.current = false
        },
        { once: true },
      )
      if (isOpen) close()
      else clearTimer()
    },
    onFocus: () => {
      if (!pointerDown.current && !isOpen) show('instant-open')
    },
    onBlur: () => {
      if (isOpen) close()
      else clearTimer()
    },
    onClick: () => {
      if (isOpen) close()
    },
  }

  return (
    <>
      <Slot.Root ref={triggerRef} aria-describedby={isOpen ? id : undefined} {...handlers}>
        {children}
      </Slot.Root>
      {isOpen ? (
        <TooltipBubble
          id={id}
          anchor={triggerRef}
          side={side}
          align={align}
          sideOffset={sideOffset}
          state={state === 'closed' ? 'instant-open' : state}
          className={className}
          onDismiss={close}
          onPointerEnter={clearTimer}
          onPointerLeave={() => {
            clearTimer()
            timer.current = setTimeout(close, HOVER_GRACE_MS)
          }}
        >
          <span className="min-w-0">{content}</span>
          {shortcut && shortcut.length > 0 ? <Kbd keys={shortcut} tone="subtle" /> : null}
        </TooltipBubble>
      ) : null}
    </>
  )
}

export interface TooltipDelegateProps {
  /** Descendants matching this selector each get their own tooltip. */
  selector: string
  /** Content for the hovered descendant. */
  content: (target: HTMLElement) => ReactNode
  side?: Side
  align?: Align
  sideOffset?: number
  delayDuration?: number
  /** The container. Must accept a ref and DOM props. */
  children: ReactElement
  className?: string
}

/**
 * One tooltip for many small pointer targets (the stage dots in a grid row): hovering a
 * descendant that matches `selector` shows a tooltip anchored to it, and moving to a neighbour
 * moves the tooltip instantly. Costs one listener set per container instead of one per target.
 * For pointer targets only; keyboard users get the same information from the container's name.
 */
export function TooltipDelegate({
  selector,
  content,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  delayDuration = TOOLTIP_DELAY_MS,
  children,
  className,
}: TooltipDelegateProps) {
  const [open, setOpen] = useState<{
    key: number
    target: HTMLElement
    state: 'delayed-open' | 'instant-open'
  } | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handle = useRef<TooltipHandle>({ close: () => {} })
  const id = useId()

  const clearTimer = () => {
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
  }
  const close = () => {
    clearTimer()
    if (active === handle.current) active = null
    lastClosedAt = now()
    setOpen(null)
  }
  handle.current.close = close
  const show = (target: HTMLElement, state: 'delayed-open' | 'instant-open') => {
    clearTimer()
    if (!target.isConnected) return
    if (active && active !== handle.current) active.close()
    active = handle.current
    anchor.current = target
    setOpen((prev) => ({ key: (prev?.key ?? 0) + 1, target, state }))
  }
  const match = (node: EventTarget | null, container: HTMLElement): HTMLElement | null => {
    if (!(node instanceof Element)) return null
    const found = node.closest<HTMLElement>(selector)
    return found && container.contains(found) ? found : null
  }

  const handlers = {
    onPointerOver: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') return
      const target = match(event.target, event.currentTarget)
      if (!target) return
      clearTimer()
      if (open) {
        if (open.target !== target) show(target, 'instant-open')
        return
      }
      if (now() - lastClosedAt < SKIP_DELAY_MS || delayDuration <= 0) show(target, 'instant-open')
      else timer.current = setTimeout(() => show(target, 'delayed-open'), delayDuration)
    },
    onPointerOut: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch') return
      const from = match(event.target, event.currentTarget)
      const to = match(event.relatedTarget, event.currentTarget)
      if (!from || to) return
      clearTimer()
      if (open) timer.current = setTimeout(close, HOVER_GRACE_MS)
    },
    onPointerDown: () => {
      if (open) close()
      else clearTimer()
    },
  }

  return (
    <>
      <Slot.Root {...handlers}>{children}</Slot.Root>
      {open ? (
        <TooltipBubble
          key={open.key}
          id={id}
          anchor={anchor}
          describeAnchor
          side={side}
          align={align}
          sideOffset={sideOffset}
          state={open.state}
          className={className}
          onDismiss={close}
          onPointerEnter={clearTimer}
          onPointerLeave={() => {
            clearTimer()
            timer.current = setTimeout(close, HOVER_GRACE_MS)
          }}
        >
          <span className="min-w-0">{content(open.target)}</span>
        </TooltipBubble>
      ) : null}
    </>
  )
}

interface Placement {
  top: number
  left: number
  side: Side
}

const origins: Record<Side, string> = {
  top: 'center bottom',
  bottom: 'center top',
  left: 'right center',
  right: 'left center',
}

const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/** Places a box of size w×h next to `rect`, flipping and clamping to stay in the viewport. */
export function placeTooltip(
  rect: { top: number; left: number; width: number; height: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  side: Side,
  align: Align,
  offset: number,
): Placement {
  const pad = COLLISION_PADDING
  const fits = (s: Side) => {
    if (s === 'top') return rect.top - offset - size.height >= pad
    if (s === 'bottom')
      return rect.top + rect.height + offset + size.height <= viewport.height - pad
    if (s === 'left') return rect.left - offset - size.width >= pad
    return rect.left + rect.width + offset + size.width <= viewport.width - pad
  }
  const chosen = fits(side) || !fits(opposite[side]) ? side : opposite[side]
  const vertical = chosen === 'top' || chosen === 'bottom'

  const alignOffset = (start: number, length: number, box: number) =>
    align === 'start' ? start : align === 'end' ? start + length - box : start + (length - box) / 2

  let top: number
  let left: number
  if (vertical) {
    top = chosen === 'top' ? rect.top - offset - size.height : rect.top + rect.height + offset
    left = alignOffset(rect.left, rect.width, size.width)
  } else {
    left = chosen === 'left' ? rect.left - offset - size.width : rect.left + rect.width + offset
    top = alignOffset(rect.top, rect.height, size.height)
  }
  const clamp = (value: number, max: number) => Math.max(pad, Math.min(value, max - pad))
  if (vertical) left = clamp(left, viewport.width - size.width)
  else top = clamp(top, viewport.height - size.height)
  return { top: Math.round(top), left: Math.round(left), side: chosen }
}

interface TooltipBubbleProps {
  id: string
  anchor: { current: HTMLElement | null }
  side: Side
  align: Align
  sideOffset: number
  state: 'delayed-open' | 'instant-open'
  className: string | undefined
  /** Set aria-describedby on the anchor while open (for delegated anchors). */
  describeAnchor?: boolean
  onDismiss: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  children: ReactNode
}

function TooltipBubble({
  id,
  anchor,
  describeAnchor = false,
  side,
  align,
  sideOffset,
  state,
  className,
  onDismiss,
  onPointerEnter,
  onPointerLeave,
  children,
}: TooltipBubbleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useLayoutEffect(() => {
    const trigger = anchor.current
    const bubble = ref.current
    if (!trigger || !bubble) return
    const rect = trigger.getBoundingClientRect()
    setPlacement(
      placeTooltip(
        rect,
        { width: bubble.offsetWidth, height: bubble.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        side,
        align,
        sideOffset,
      ),
    )

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss.current()
    }
    // Like Radix: close when something that contains the trigger scrolls.
    const onScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Node && target.contains(trigger)) dismiss.current()
    }
    const onResize = () => dismiss.current()
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
    if (describeAnchor) trigger.setAttribute('aria-describedby', id)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onResize)
      if (describeAnchor && trigger.getAttribute('aria-describedby') === id) {
        trigger.removeAttribute('aria-describedby')
      }
    }
  }, [anchor, side, align, sideOffset, describeAnchor, id])

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      data-state={state}
      data-side={placement?.side ?? side}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(tooltipContentClassName, 'fixed', className)}
      style={{
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        transformOrigin: origins[placement?.side ?? side],
        visibility: placement ? undefined : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
