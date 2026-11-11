import { RotateCcw, X } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, useId, useLayoutEffect, useRef } from 'react'
import { Kbd } from '@/components/ui/Kbd'
import { exactDate, formatFuzzyDate } from '@/domain/dates'
import { stageRampStep } from '@/domain/stages'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import {
  formatStageDate,
  type StageBlockKind,
  type StageViewItem,
  stageBlockKind,
  stageFill,
  stageInk,
} from './StageDots'

export interface StageTrackerProps {
  stages: readonly StageViewItem[]
  /** Set when the relationship is closed as lost. */
  lost: { afterStageName: string; date: string } | null
  /** Move to the stage at `index` (forward or back). */
  onMove: (index: number) => void
  onMarkLost: () => void
  onReopen: () => void
  disabled?: boolean
  /** Another member's row: the stages show as they are, with no controls at all. */
  readOnly?: boolean
  className?: string
}

/** Mono caps section label, shared with the expanded row's other sections. */
export const trackerTitleClassName =
  'font-mono text-[10.5px] font-semibold tracking-[0.08em] text-secondary uppercase'

const toggleClassName = cn(
  'inline-flex h-[30px] shrink-0 cursor-default items-center gap-1.5 rounded-control bg-bg px-2.5',
  'text-[12.5px] font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_var(--border)]',
  'transition-colors duration-(--duration-fast) ease-out hover:bg-surface-hover',
  'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0',
)

/** The small line under a block's name: its date, "Skipped", or a dash when not reached. */
function blockSubText(
  stage: StageViewItem,
  kind: StageBlockKind,
  lost: StageTrackerProps['lost'],
  now: Date,
): string {
  if (kind === 'lost') return lost ? formatFuzzyDate(exactDate(lost.date), now) : '—'
  if (kind === 'future') return '—'
  if (stage.date) return formatStageDate(stage.date, now)
  return stage.state === 'done' ? 'Skipped' : '—'
}

/**
 * The full stage tracker in the expanded row: a joined row of blocks, one per stage, coloured
 * like the grid bar and showing each stage's name and date ("Skipped" when reached without one).
 * Other stages are buttons that move the row there; the current stage (or the won one) is
 * marked with aria-current and a ring. Above the blocks: the "Stage" label, the lost line when
 * lost, the `[` and `]` hints (they work here too) and Mark lost or Reopen. Renders nothing for
 * a sheet without stages.
 */
export function StageTracker({
  stages,
  lost,
  onMove,
  onMarkLost,
  onReopen,
  disabled = false,
  readOnly = false,
  className,
}: StageTrackerProps) {
  const now = useNow()
  const dateIdBase = useId()
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

  const count = stages.length
  const currentIndex = stages.findIndex((s) => s.state === 'current' || s.state === 'won')
  const won = stages.some((s) => s.state === 'won')
  const isLost = lost !== null

  // `]` and `[` move to the next and previous stage from anywhere in the tracker, as they do
  // on the grid's active row. Nothing moves while the row is lost (Reopen first).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ']' && event.key !== '[') return
    if (event.metaKey || event.ctrlKey || event.altKey || disabled || readOnly || isLost) return
    const target =
      event.key === ']'
        ? currentIndex < 0
          ? 0
          : currentIndex + 1
        : currentIndex > 0
          ? currentIndex - 1
          : -1
    if (target < 0 || target >= count || target === currentIndex) return
    event.preventDefault()
    requestFocus('current')
    onMove(target)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions: `[` and `]` bubble up from the stage buttons inside.
    <div
      ref={rootRef}
      className={cn('w-full', className)}
      data-testid="stage-tracker"
      onKeyDown={onKeyDown}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className={trackerTitleClassName}>Stage</h3>
          {lost ? (
            <p className="text-[12.5px] font-medium text-lost" data-testid="lost-line">
              Lost after {lost.afterStageName.toLowerCase()} ·{' '}
              {formatFuzzyDate(exactDate(lost.date), now)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {isLost || readOnly ? null : (
            // The shortcut sheet and command palette name these keys for assistive tech.
            <span aria-hidden="true" className="flex items-center gap-1.5 text-xs text-muted">
              Previous <Kbd keys={['[']} /> Next <Kbd keys={[']']} />
            </span>
          )}
          {readOnly ? null : lost ? (
            <button
              type="button"
              disabled={disabled}
              data-lost-toggle=""
              onClick={() => {
                requestFocus('lost-toggle')
                onReopen()
              }}
              className={cn(toggleClassName, 'text-text')}
            >
              <RotateCcw aria-hidden="true" />
              Reopen
            </button>
          ) : won ? null : (
            <button
              type="button"
              disabled={disabled}
              data-lost-toggle=""
              onClick={() => {
                requestFocus('lost-toggle')
                onMarkLost()
              }}
              className={cn(toggleClassName, 'text-lost')}
            >
              <X aria-hidden="true" />
              Mark lost
            </button>
          )}
        </div>
      </div>

      {/* On a phone each stage keeps a readable width and the bar scrolls sideways. */}
      <div className="max-md:-mx-3 max-md:overflow-x-auto max-md:px-3 max-md:py-1 max-md:[scrollbar-width:none]">
        <ol
          aria-label="Stages"
          className="grid gap-0.5 max-md:min-w-[calc(var(--stage-count)*84px)]"
          style={
            {
              gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
              '--stage-count': count,
            } as CSSProperties
          }
        >
          {stages.map((stage, i) => {
            const isCurrent = i === currentIndex
            const kind = stageBlockKind(stage, isLost)
            const step = stageRampStep(i, count)
            const blockClassName = cn(
              'relative flex h-[54px] w-full min-w-0 flex-col items-start justify-between px-[11px] py-[9px] text-left',
              !readOnly &&
                'transition-transform duration-(--duration-fast) ease-out hover:-translate-y-px motion-reduce:hover:translate-y-0',
              i === 0 && 'rounded-l-control',
              i === count - 1 && 'rounded-r-control',
              isCurrent && !isLost && 'z-[1] shadow-[0_0_0_2px_var(--bg),0_0_0_3.5px_var(--text)]',
            )
            const blockStyle = {
              background: stageFill(kind, step, true),
              color: stageInk(kind, step),
            }
            const nameText = (
              <span className="max-w-full truncate text-[12.5px] leading-tight font-semibold">
                {kind === 'lost' ? 'Lost' : stage.name}
              </span>
            )
            const dateClassName =
              'max-w-full truncate font-mono text-2xs leading-tight font-medium tabular-nums'
            const dateText = blockSubText(stage, kind, lost, now)
            const dateId = `${dateIdBase}-${i}`
            return (
              <li
                key={stage.id}
                aria-current={isCurrent ? 'step' : undefined}
                data-state={stage.state}
                data-kind={kind}
                className="group relative flex min-w-0"
              >
                {isCurrent || readOnly ? (
                  <div
                    // Focus lands here after a move so keyboard users keep their place.
                    tabIndex={isCurrent && !readOnly ? -1 : undefined}
                    data-current-stage={isCurrent && !readOnly ? '' : undefined}
                    className={blockClassName}
                    style={blockStyle}
                  >
                    {nameText}
                    <span className={dateClassName}>{dateText}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    // The visible text inside the button is the stage name, which the name contains;
                    // the date sits beside it in the same block and describes the button.
                    aria-describedby={disabled ? undefined : dateId}
                    aria-label={
                      disabled
                        ? // Not actionable: the name is exactly what the block shows.
                          `${kind === 'lost' ? 'Lost' : stage.name} ${dateText}`
                        : kind === 'lost'
                          ? `Lost, move to ${stage.name}`
                          : currentIndex >= 0 && i < currentIndex
                            ? `Move back to ${stage.name}`
                            : `Move to ${stage.name}`
                    }
                    onClick={() => {
                      requestFocus('current')
                      onMove(i)
                    }}
                    className={cn(
                      blockClassName,
                      'cursor-default disabled:pointer-events-none disabled:opacity-60',
                    )}
                    style={blockStyle}
                  >
                    {nameText}
                    {/* A disabled control is exempt from the name and contrast rules, so its date
                      can stay inside and dim with it. */}
                    {disabled ? (
                      <>
                        {/* The space keeps the name and date apart in the accessible text. */}{' '}
                        <span className={dateClassName}>{dateText}</span>
                      </>
                    ) : null}
                  </button>
                )}
                {isCurrent || disabled || readOnly ? null : (
                  <span
                    id={dateId}
                    className={cn(
                      dateClassName,
                      'pointer-events-none absolute right-[11px] bottom-[9px] left-[11px] transition-transform duration-(--duration-fast) ease-out group-hover:-translate-y-px motion-reduce:group-hover:translate-y-0',
                    )}
                    style={{ color: blockStyle.color }}
                  >
                    {dateText}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
