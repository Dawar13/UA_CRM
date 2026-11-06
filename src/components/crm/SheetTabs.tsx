import { Tabs } from 'radix-ui'
import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { formatNumber } from '@/domain/format'
import { folderBottom, folderNumber, folderTop, sheetNumber } from '@/features/sheet-summary/folder'
import { cn } from '@/lib/cn'

export interface SheetTabsProps {
  sheets: readonly { id: string; name: string }[]
  /** Row count per sheet id, shown after the name. */
  counts?: Record<string, number>
  value: string
  onValueChange: (id: string) => void
  /** Clicking, or pressing Enter or Space on, the tab that is already open (folds the front). */
  onActiveTabClick?: () => void
  /** Drag a tab to a new place (your own tab only): the sheet ids in their new order. */
  onReorder?: (ids: string[]) => void
  className?: string
}

const FADE_PX = 32
/** Tab heights: the open folder's tab stands taller than the rest. */
const ACTIVE_HEIGHT = 40
const IDLE_HEIGHT = 31

function fadeMask(left: boolean, right: boolean): CSSProperties | undefined {
  if (!left && !right) return undefined
  const mask = `linear-gradient(to right, ${left ? 'transparent' : 'black'} 0, black ${FADE_PX}px, black calc(100% - ${FADE_PX}px), ${right ? 'transparent' : 'black'} 100%)`
  return { maskImage: mask, WebkitMaskImage: mask }
}

/** The slanted ear after each tab face, as tall as the tab. */
function earPath(height: number): string {
  return `path('M0 0 C 6 0, 8 4, 10 10 L 18 ${height} L 0 ${height} Z')`
}

const FACE = cn(
  'bg-[image:linear-gradient(180deg,var(--tab-top),var(--tab-bottom))]',
  'group-hover/tab:brightness-[1.04] group-hover/tab:saturate-[1.05]',
)
/** Same timing as the tab's height, so the ear grows with it. */
const TAB_MOTION = 'duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none'

/**
 * The open member's sheets as coloured folder tabs: number, name and row count on a face with a
 * slanted ear. Each sheet takes one of five folder colours by its position. The open sheet's tab
 * stands taller and sits on its folder front. Arrow keys move and activate; clicking the open tab
 * again folds or unfolds the front. When the tabs overflow they scroll sideways with softly
 * fading edges, and the active tab stays in view. The number and count are visual only; each
 * tab's accessible name is the sheet name.
 */
export function SheetTabs({
  sheets,
  counts,
  value,
  onValueChange,
  onActiveTabClick,
  onReorder,
  className,
}: SheetTabsProps) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropBefore, setDropBefore] = useState<string | null>(null)
  const drop = (targetId: string | null) => {
    if (!dragging || !onReorder) return
    const ids = sheets.map((s) => s.id).filter((id) => id !== dragging)
    const at = targetId === null ? ids.length : ids.indexOf(targetId)
    ids.splice(at < 0 ? ids.length : at, 0, dragging)
    setDragging(null)
    setDropBefore(null)
    if (ids.join() !== sheets.map((s) => s.id).join()) onReorder(ids)
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })
  // Which tab a pointer press started on, and whether it was already open then. Radix activates
  // on mousedown, so by the time the click lands every clicked tab is open.
  const pressRef = useRef<{ id: string; wasActive: boolean } | null>(null)

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

  const onTabClick = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    const press = pressRef.current
    pressRef.current = null
    // A keyboard click (Enter or Space) has detail 0 and no press: the focused tab is open.
    const wasActive = event.detail > 0 && press ? press.id === id && press.wasActive : id === value
    if (wasActive) onActiveTabClick?.()
  }

  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange}
      activationMode="automatic"
      className={cn('flex h-full min-w-0 items-stretch', className)}
    >
      {/* 4px of room on every side so the focus ring is not clipped by the scroller. */}
      <div
        ref={scrollRef}
        onScroll={updateFade}
        data-fade-left={fade.left || undefined}
        data-fade-right={fade.right || undefined}
        style={fadeMask(fade.left, fade.right)}
        className="relative -m-1 flex min-w-0 items-end overflow-x-auto overflow-y-hidden overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Tabs.List
          aria-label="Sheets"
          className="flex h-[var(--sheet-bar-height)] w-max items-end gap-[3px]"
        >
          {sheets.map((sheet, index) => {
            const count = counts?.[sheet.id]
            const folder = folderNumber(index)
            const active = sheet.id === value
            const height = active ? ACTIVE_HEIGHT : IDLE_HEIGHT
            const colours = {
              '--tab-top': folderTop(folder),
              '--tab-bottom': folderBottom(folder),
            } as CSSProperties
            return (
              <Tabs.Trigger
                key={sheet.id}
                value={sheet.id}
                aria-controls={undefined}
                data-sheet-id={sheet.id}
                data-folder={folder}
                onMouseDown={() => {
                  pressRef.current = { id: sheet.id, wasActive: active }
                }}
                draggable={onReorder ? true : undefined}
                onDragStart={
                  onReorder
                    ? (event) => {
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', sheet.name)
                        setDragging(sheet.id)
                      }
                    : undefined
                }
                onDragOver={
                  onReorder && dragging
                    ? (event) => {
                        event.preventDefault()
                        const box = event.currentTarget.getBoundingClientRect()
                        const after = event.clientX > box.left + box.width / 2
                        const next = after ? (sheets[index + 1]?.id ?? '__end') : sheet.id
                        setDropBefore(next)
                      }
                    : undefined
                }
                onDrop={
                  onReorder && dragging
                    ? (event) => {
                        event.preventDefault()
                        drop(dropBefore === '__end' ? null : dropBefore)
                      }
                    : undefined
                }
                onDragEnd={() => {
                  setDragging(null)
                  setDropBefore(null)
                }}
                data-drop-before={dropBefore === sheet.id || undefined}
                data-dragging={dragging === sheet.id || undefined}
                onClick={(event) => onTabClick(sheet.id, event)}
                style={{ ...colours, height }}
                className={cn(
                  'group/tab flex shrink-0 cursor-default select-none items-stretch p-0 text-folder-fg',
                  'transition-[height]',
                  TAB_MOTION,
                  'disabled:pointer-events-none disabled:opacity-50',
                  'data-[dragging]:opacity-50',
                  'data-[drop-before]:shadow-[-3px_0_0_var(--focus)]',
                )}
              >
                <span
                  className={cn(
                    FACE,
                    'flex items-center gap-2 rounded-tl-tab pl-3 pr-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]',
                    'transition-[filter] duration-(--duration-fast) ease-out',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="font-mono text-[10.5px] font-semibold tracking-[0.04em] tabular-nums"
                  >
                    {sheetNumber(index)}
                  </span>
                  <span className="whitespace-nowrap text-sm font-semibold tracking-[-0.005em]">
                    {sheet.name}
                  </span>
                  {count !== undefined ? (
                    <span
                      aria-hidden="true"
                      className="font-mono text-2xs font-medium tabular-nums"
                    >
                      {formatNumber(count)}
                    </span>
                  ) : null}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    FACE,
                    'w-[18px] shrink-0 [transition-property:filter,clip-path]',
                    TAB_MOTION,
                  )}
                  style={{ clipPath: earPath(height) }}
                />
              </Tabs.Trigger>
            )
          })}
        </Tabs.List>
      </div>
    </Tabs.Root>
  )
}
