import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useMemo } from 'react'
import { useUiStore } from '@/app/uiStore'
import { DateText } from '@/components/crm/DateText'
import { StageTracker } from '@/components/crm/StageTracker'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { Button } from '@/components/ui/Button'
import {
  useHistory,
  useMarkLost,
  useMembers,
  useMoveStage,
  useReopen,
  useSetWarmth,
} from '@/data/hooks'
import { stageView } from '@/domain/stages'
import type { Member, Row, Sheet } from '@/domain/types'
import { HistoryList } from './HistoryList'
import { LinkChip } from './LinkChip'

const RECENT_HISTORY = 5

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      {children}
    </section>
  )
}

export function ExpandedRow({ row, sheet, member }: { row: Row; sheet: Sheet; member: Member }) {
  const reduceMotion = useReducedMotion()
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
  const links = row.connectsTo

  return (
    <motion.div
      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
      data-testid="expanded-row"
    >
      <div className="@container px-4 pt-4 pb-5 pl-[52px]">
        <div className="grid gap-x-10 gap-y-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <div className="flex min-w-0 flex-col gap-5">
            {sheet.stages.length > 0 ? (
              <StageTracker
                stages={stages}
                lost={
                  row.lost && lostStage
                    ? { afterStageName: lostStage.name, date: row.lost.date }
                    : null
                }
                onMove={(index) => moveStage.mutate({ row, sheet, stageIndex: index, actorId })}
                onMarkLost={() => markLost.mutate({ row, sheet, actorId })}
                onReopen={() => reopen.mutate({ row, sheet, actorId })}
              />
            ) : null}

            <div className="flex flex-wrap gap-x-10 gap-y-5">
              <Section title="Warmth">
                <div>
                  <WarmthChip
                    value={row.warmth}
                    onChange={(next) => setWarmth.mutate({ row, warmth: next, actorId })}
                  />
                </div>
              </Section>
              <Section title="Next action">
                {row.nextAction && (row.nextAction.text || row.nextAction.date) ? (
                  <p className="flex flex-wrap items-baseline gap-x-2 text-base text-text">
                    {row.nextAction.date ? (
                      <DateText date={row.nextAction.date} variant="due" className="font-medium" />
                    ) : null}
                    <span>{row.nextAction.text}</span>
                  </p>
                ) : (
                  <p className="text-base text-muted">None set</p>
                )}
              </Section>
            </div>

            {row.notes ? (
              <Section title="Notes">
                <p className="max-w-prose whitespace-pre-line text-base leading-[var(--line-height-long)] text-secondary">
                  {row.notes}
                </p>
              </Section>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Section title="History">
              {recent.length > 0 ? (
                <HistoryList entries={recent} members={memberMap} />
              ) : (
                <p className="text-sm text-muted">No touches logged yet.</p>
              )}
              {history.length > RECENT_HISTORY ? (
                <div>
                  <Button variant="ghost" size="sm" onClick={() => showHistory(row.id)}>
                    Show all {history.length}
                  </Button>
                </div>
              ) : null}
            </Section>

            {row.introducedBy ? (
              <Section title="Introduced by">
                <div className="flex flex-wrap gap-2">
                  <LinkChip link={row.introducedBy} />
                </div>
              </Section>
            ) : null}

            {links.length > 0 ? (
              <Section title="Connects to">
                <div className="flex flex-wrap gap-2">
                  {links.map((link, i) => (
                    <LinkChip
                      key={link.kind === 'row' ? link.rowId : `${link.text}-${i}`}
                      link={link}
                    />
                  ))}
                </div>
              </Section>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
