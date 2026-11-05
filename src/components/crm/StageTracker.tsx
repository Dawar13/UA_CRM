import { Check, CircleOff, RotateCcw, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { exactDate, formatFuzzyDate } from '@/domain/dates'
import type { StageState } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { formatStageDate, type StageViewItem } from './StageDots'

export interface StageTrackerProps {
  stages: readonly StageViewItem[]
  /** Set when the relationship is closed as lost. */
  lost: { afterStageName: string; date: string } | null
  /** Move to the stage at `index` (forward or back). */
  onMove: (index: number) => void
  onMarkLost: () => void
  onReopen: () => void
  disabled?: boolean
  className?: string
}

function isReached(state: StageState | undefined): boolean {
  return state === 'done' || state === 'current' || state === 'won'
}

const dotClassName: Record<StageState, string> = {
  done: 'bg-stage-done text-bg',
  current: 'bg-stage-done ring-[3px] ring-stage-current-ring',
  future:
    'border-[1.5px] border-stage-future group-hover/stage:border-stage-done group-hover/stage:bg-brand-tint',
  'lost-marker': 'bg-stage-lost text-bg',
  won: 'bg-stage-won text-bg',
}

const labelClassName: Record<StageState, string> = {
  done: 'text-secondary',
  current: 'font-medium text-text',
  future: 'text-muted',
  'lost-marker': 'text-muted',
  won: 'font-medium text-text',
}

function StageDot({ state }: { state: StageState }) {
  return (
    <span
      aria-hidden="true"
      data-state={state}
      className={cn(
        'relative z-10 box-border flex size-3.5 items-center justify-center rounded-full',
        'transition-[background-color,border-color,transform] duration-(--duration-fast) ease-out',
        'group-hover/stage:scale-110',
        dotClassName[state],
      )}
    >
      {state === 'done' || state === 'won' ? (
        <Check className="size-2.5" strokeWidth={3.5} />
      ) : null}
      {state === 'lost-marker' ? <X className="size-2.5" strokeWidth={3.5} /> : null}
    </span>
  )
}

/**
 * The full stage tracker in the expanded row: 14px dots joined by a 2px line, a label and date
 * under each. Other stages are buttons that move the row there; the current stage is marked with
 * aria-current. Mark lost and Reopen sit underneath. Renders nothing for a sheet without stages.
 */
export function StageTracker({
  stages,
  lost,
  onMove,
  onMarkLost,
  onReopen,
  disabled = false,
  className,
}: StageTrackerProps) {
  const now = useNow()
  const rootRef = useRef<HTMLDivElement>(null)
  // Where focus goes after the user's own action re-renders the tracker: the stage button they
  // used becomes the (non-button) current stage, and Mark lost and Reopen replace each other.
  // The change arrives a render or two after the click (the mutation re-renders first), so the
  // request stays pending briefly and acts only once focus has actually fallen to the page.
  const restoreFocus = useRef<{ target: 'current' | 'lost-toggle'; at: number } | null>(null)
  const requestFocus = (target: 'current' | 'lost-toggle') => {
    restoreFocus.current = { target, at: Date.now() }
  }
  useLayoutEffect(() => {
    const pending = restoreFocus.current
    const root = rootRef.current
    if (!pending || !root) return
    if (Date.now() - pending.at > 2000) {
      restoreFocus.current = null
      return
    }
    const active = document.activeElement
    if (active && active !== document.body) return
    const el =
      (pending.target === 'lost-toggle'
        ? root.querySelector<HTMLElement>('[data-lost-toggle]')
        : null) ?? root.querySelector<HTMLElement>('[data-current-stage]')
    if (el) {
      restoreFocus.current = null
      el.focus()
    }
  })

  if (stages.length === 0) return null

  const currentIndex = stages.findIndex((s) => s.state === 'current' || s.state === 'won')
  const won = stages.some((s) => s.state === 'won')

  return (
    <div
      ref={rootRef}
      className={cn('w-full max-w-[560px]', className)}
      data-testid="stage-tracker"
    >
      <ol aria-label="Stages" className="flex w-full items-start">
        {stages.map((stage, i) => {
          const isCurrent = i === currentIndex
          const leftDone = isReached(stage.state)
          const rightDone = isReached(stages[i + 1]?.state)
          const reached = isReached(stage.state)
          const dateText = reached ? formatStageDate(stage.date, now) : ''
          const label = (
            <>
              <span className="flex h-5 items-center justify-center">
                <StageDot state={stage.state} />
              </span>
              <span
                className={cn(
                  'mt-1.5 line-clamp-2 text-center text-xs leading-tight break-words',
                  labelClassName[stage.state],
                  !isCurrent && 'group-hover/stage:text-text',
                )}
              >
                {stage.name}
              </span>
            </>
          )
          // Outside the button, so the button's name ("Move to Plant visit") matches its text.
          const date = (
            <span
              className={cn(
                'mt-0.5 h-4 text-2xs leading-4 whitespace-nowrap tabular-nums text-muted',
                !stage.date && 'italic',
              )}
            >
              {dateText}
            </span>
          )
          return (
            <li
              key={stage.id}
              aria-current={isCurrent ? 'step' : undefined}
              data-state={stage.state}
              className="relative flex min-w-0 flex-1 flex-col items-center"
            >
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-[9px] left-0 h-0.5 w-[calc(50%-12px)] rounded-full',
                    leftDone ? 'bg-stage-done' : 'bg-stage-line',
                  )}
                />
              ) : null}
              {i < stages.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute top-[9px] right-0 h-0.5 w-[calc(50%-12px)] rounded-full',
                    rightDone ? 'bg-stage-done' : 'bg-stage-line',
                  )}
                />
              ) : null}
              {isCurrent ? (
                <div
                  // Focus lands here after a move so keyboard users keep their place.
                  tabIndex={-1}
                  data-current-stage=""
                  className="flex w-full flex-col items-center rounded-control px-1"
                >
                  {label}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={
                    currentIndex >= 0 && i < currentIndex
                      ? `Move back to ${stage.name}`
                      : `Move to ${stage.name}`
                  }
                  onClick={() => {
                    requestFocus('current')
                    onMove(i)
                  }}
                  className={cn(
                    'group/stage flex w-full cursor-default flex-col items-center rounded-control px-1',
                    'disabled:pointer-events-none disabled:opacity-60',
                  )}
                >
                  {label}
                </button>
              )}
              {date}
            </li>
          )
        })}
      </ol>

      <div className="mt-3 flex min-h-7 items-center justify-between gap-3">
        {lost ? (
          <>
            <p className="text-sm text-lost" data-testid="lost-line">
              Lost after {lost.afterStageName.toLowerCase()} ·{' '}
              {formatFuzzyDate(exactDate(lost.date), now)}
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              data-lost-toggle=""
              onClick={() => {
                requestFocus('lost-toggle')
                onReopen()
              }}
            >
              <RotateCcw aria-hidden="true" />
              Reopen
            </Button>
          </>
        ) : won ? null : (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            data-lost-toggle=""
            onClick={() => {
              requestFocus('lost-toggle')
              onMarkLost()
            }}
            className="ml-auto text-secondary hover:bg-cold-bg hover:text-cold"
          >
            <CircleOff aria-hidden="true" />
            Mark lost
          </Button>
        )}
      </div>
    </div>
  )
}
