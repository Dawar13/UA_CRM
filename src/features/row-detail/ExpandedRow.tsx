import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useMemo } from 'react'
import { useUiStore } from '@/app/uiStore'
import { DateText } from '@/components/crm/DateText'
import { StageTracker, trackerTitleClassName } from '@/components/crm/StageTracker'
import { WarmthRadioGroup } from '@/components/crm/WarmthChip'
import { Button } from '@/components/ui/Button'
import {
  useHistory,
  useMarkLost,
  useMembers,
  useMoveStage,
  useReopen,
  useSetWarmth,
} from '@/data/hooks'
import { formatFuzzyDate } from '@/domain/dates'
import { formatCurrency, formatNumber, pluralise } from '@/domain/format'
import { formatPhone } from '@/domain/identity'
import { stageView } from '@/domain/stages'
import type { ColumnDef, Member, Row, Sheet } from '@/domain/types'
import { isFuzzyDate, isLinkRef } from '@/features/grid/columnModel'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { HistoryList } from './HistoryList'
import { LinkChip } from './LinkChip'

const RECENT_HISTORY = 5

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <h3 className={trackerTitleClassName}>{title}</h3>
      {children}
    </section>
  )
}

/** A custom field's value as text (or a link chip), or null when it is empty. */
function fieldValue(def: ColumnDef, value: unknown, now: Date): ReactNode {
  if (value === null || value === undefined || value === '') return null
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? formatNumber(value) : null
    case 'currency':
      return typeof value === 'number' ? formatCurrency(value) : null
    case 'date':
      return isFuzzyDate(value) ? formatFuzzyDate(value, now) : null
    case 'multiSelect':
      return Array.isArray(value) && value.length > 0 ? value.map(String).join(', ') : null
    case 'checkbox':
      return value === true ? 'Yes' : value === false ? 'No' : null
    case 'personLink':
      return isLinkRef(value) ? <LinkChip link={value} /> : null
    case 'phone':
      return formatPhone(String(value))
    case 'files':
      return Array.isArray(value) && value.length > 0 ? pluralise(value.length, 'file') : null
    default:
      return String(value)
  }
}

/**
 * The details under an expanded row: the stage tracker across the top, then two columns. Left:
 * warmth, next action, notes and the sheet's own fields; right: history.
 */
export function ExpandedRow({ row, sheet, member }: { row: Row; sheet: Sheet; member: Member }) {
  const reduceMotion = useReducedMotion()
  const now = useNow()
  const moveStage = useMoveStage()
  const markLost = useMarkLost()
  const reopen = useReopen()
  const setWarmth = useSetWarmth()
  const { data: history = [] } = useHistory(row.id)
  const { data: members = [] } = useMembers()
  const showHistory = useUiStore((s) => s.showHistory)

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const stages = useMemo(() => stageView(row, sheet), [row, sheet])
  const lostStage = row.lost ? sheet.stages[row.lost.stageIndex] : undefined
  const actorId = member.id
  const recent = history.slice(0, RECENT_HISTORY)
  const next =
    row.nextAction && (row.nextAction.text || row.nextAction.date) ? row.nextAction : null

  const fields: { id: string; label: string; value: ReactNode }[] = []
  for (const def of [...sheet.columns].sort((a, b) => a.position - b.position)) {
    if (def.system) continue
    const value = fieldValue(def, row.fields[def.key], now)
    if (value !== null) fields.push({ id: def.id, label: def.label, value })
  }
  if (row.introducedBy) {
    fields.push({
      id: 'introducedBy',
      label: 'Introduced by',
      value: <LinkChip link={row.introducedBy} />,
    })
  }
  if (row.connectsTo.length > 0) {
    fields.push({
      id: 'connectsTo',
      label: 'Connects to',
      value: (
        <span className="flex flex-wrap gap-1.5">
          {row.connectsTo.map((link, i) => (
            <LinkChip key={link.kind === 'row' ? link.rowId : `${link.text}-${i}`} link={link} />
          ))}
        </span>
      ),
    })
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
      data-testid="expanded-row"
    >
      <div className="flex flex-col gap-6 px-6 pt-[22px] pb-[26px]">
        {sheet.stages.length > 0 ? (
          <StageTracker
            stages={stages}
            lost={
              row.lost && lostStage ? { afterStageName: lostStage.name, date: row.lost.date } : null
            }
            onMove={(index) => moveStage.mutate({ row, sheet, stageIndex: index, actorId })}
            onMarkLost={() => markLost.mutate({ row, sheet, actorId })}
            onReopen={() => reopen.mutate({ row, sheet, actorId })}
          />
        ) : null}

        <div className="flex flex-wrap gap-x-11 gap-y-7">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-[18px]">
            <Section title="Warmth">
              <WarmthRadioGroup
                value={row.warmth}
                onChange={(warmth) => setWarmth.mutate({ row, warmth, actorId })}
              />
            </Section>

            <Section title="Next action">
              {next ? (
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base text-text">
                  {next.date ? (
                    <DateText
                      date={next.date}
                      variant="due"
                      className="font-mono text-xs font-medium"
                    />
                  ) : null}
                  <span>{next.text}</span>
                </p>
              ) : (
                <p className="text-[13.5px] text-muted">None set</p>
              )}
            </Section>

            {row.notes ? (
              <Section title="Notes" className="gap-1.5">
                <p className="max-w-prose whitespace-pre-line text-base leading-[var(--line-height-long)] text-text">
                  {row.notes}
                </p>
              </Section>
            ) : null}

            {fields.length > 0 ? (
              <dl className="grid grid-cols-[132px_minmax(0,1fr)] items-baseline gap-x-4 gap-y-[9px] border-t border-border pt-3.5">
                {fields.map((field) => (
                  <div key={field.id} className="contents">
                    <dt className="text-[12.5px] text-muted">{field.label}</dt>
                    <dd className="min-w-0 text-[13.5px] break-words text-text">{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          <section className="flex min-w-0 flex-[1_1_420px] flex-col">
            <div className="flex items-baseline gap-2">
              <h3 className={trackerTitleClassName}>History</h3>
              {history.length > 0 ? (
                <span className="font-mono text-2xs text-muted tabular-nums">{history.length}</span>
              ) : null}
            </div>
            {recent.length > 0 ? (
              <HistoryList entries={recent} members={memberMap} className="mt-2" />
            ) : (
              <p className="mt-2 text-sm text-muted">No touches logged yet.</p>
            )}
            {history.length > RECENT_HISTORY ? (
              <div className="mt-2">
                <Button variant="ghost" size="sm" onClick={() => showHistory(row.id)}>
                  Show all {history.length}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </motion.div>
  )
}
