import { Tabs } from 'radix-ui'
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { NavTabLabel, navTabTriggerClassName } from '@/components/ui/Tabs'
import { formatNumber } from '@/domain/format'
import { cn } from '@/lib/cn'

export interface SheetTabsProps {
  sheets: readonly { id: string; name: string }[]
  /** Row count per sheet id, shown after the name. */
  counts?: Record<string, number>
  value: string
  onValueChange: (id: string) => void
  className?: string
}

const FADE_PX = 32

function fadeMask(left: boolean, right: boolean): CSSProperties | undefined {
  if (!left && !right) return undefined
  const mask = `linear-gradient(to right, ${left ? 'transparent' : 'black'} 0, black ${FADE_PX}px, black calc(100% - ${FADE_PX}px), ${right ? 'transparent' : 'black'} 100%)`
  return { maskImage: mask, WebkitMaskImage: mask }
}

/**
 * Sheet tabs for the open member, in the 40px sheet bar. Arrow keys move and activate. When the
 * tabs overflow they scroll sideways with softly fading edges, and the active tab stays in view.
 * Counts are visual only; each tab's accessible name is the sheet name.
 */
export function SheetTabs({ sheets, counts, value, onValueChange, className }: SheetTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })

  const updateFade = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateFade()
    const observer = new ResizeObserver(updateFade)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [updateFade])

  // Keep the active tab clear of the fades when it changes (from the palette, a link chip or the
  // keyboard). Scrolls only this strip, never the page.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const tabs = el.querySelectorAll<HTMLElement>('[data-sheet-id]')
    const active = Array.from(tabs).find((tab) => tab.dataset.sheetId === value)
    if (active) {
      const start = active.offsetLeft - FADE_PX
      const end = active.offsetLeft + active.offsetWidth + FADE_PX - el.clientWidth
      if (el.scrollLeft > start) el.scrollLeft = Math.max(0, start)
      else if (el.scrollLeft < end) el.scrollLeft = end
    }
    updateFade()
  }, [value, updateFade])

  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange}
      activationMode="automatic"
      className={cn('flex h-full min-w-0 items-stretch', className)}
    >
      <div
        ref={scrollRef}
        onScroll={updateFade}
        data-fade-left={fade.left || undefined}
        data-fade-right={fade.right || undefined}
        style={fadeMask(fade.left, fade.right)}
        className="relative flex h-full min-w-0 items-stretch overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Tabs.List aria-label="Sheets" className="flex h-full w-max items-stretch gap-0.5 px-1">
          {sheets.map((sheet) => {
            const count = counts?.[sheet.id]
            return (
              <Tabs.Trigger
                key={sheet.id}
                value={sheet.id}
                aria-controls={undefined}
                data-sheet-id={sheet.id}
                className={cn(navTabTriggerClassName, 'h-full text-sm')}
              >
                <NavTabLabel>
                  {sheet.name}
                  {count !== undefined ? (
                    <span
                      aria-hidden="true"
                      className="text-xs font-normal tabular-nums text-muted group-data-[state=active]/tab:text-secondary"
                    >
                      {formatNumber(count)}
                    </span>
                  ) : null}
                </NavTabLabel>
              </Tabs.Trigger>
            )
          })}
        </Tabs.List>
      </div>
    </Tabs.Root>
  )
}
