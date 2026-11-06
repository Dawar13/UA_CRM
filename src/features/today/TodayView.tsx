/**
 * Today (CLAUDE.md §2.9), for the signed-in member: overdue next actions, those due today, and
 * the rows added this week. Each section folds; each item opens its row in place, with the same
 * details as in the grid. Meetings and stale relationships arrive in Phase 2.
 */
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/app/Header'
import { ShellSkeleton } from '@/app/MainView'
import { RightPanel } from '@/app/RightPanel'
import { useUiStore } from '@/app/uiStore'
import { useActor } from '@/auth/AuthContext'
import { DateText } from '@/components/crm/DateText'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { useMemberRows, useMembers, useSheets } from '@/data/hooks'
import { formatDayHeading, todayIst } from '@/domain/dates'
import { formatNumber } from '@/domain/format'
import { todayItems } from '@/domain/today'
import type { Member, Row, Sheet } from '@/domain/types'
import { ExpandedRow } from '@/features/row-detail/ExpandedRow'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'

function Item({
  row,
  sheet,
  member,
  open,
  onToggle,
}: {
  row: Row
  sheet: Sheet | undefined
  member: Member
  open: boolean
  onToggle: () => void
}) {
  const next = row.nextAction
  return (
    <li className="border-b border-grid-line last:border-b-0" data-testid="today-item">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] items-center gap-4 px-4 py-2.5 text-left hover:bg-row-hover',
          open && 'bg-row-selected hover:bg-row-selected',
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-[550] text-text">{row.name}</span>
          <span className="truncate text-xs text-muted">
            {[row.company, sheet?.name].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2.5">
          {next?.date ? (
            <DateText
              date={next.date}
              variant="due"
              className="shrink-0 font-mono text-xs font-medium"
            />
          ) : null}
          <span className="truncate text-[13.5px] text-text">{next?.text}</span>
        </span>
        <span className="flex items-center gap-2">
          {row.warmth ? <WarmthChip value={row.warmth} size="sm" /> : null}
          {open ? (
            <ChevronDown aria-hidden className="size-4 text-muted" />
          ) : (
            <ChevronRight aria-hidden className="size-4 text-muted" />
          )}
        </span>
      </button>
      {open && sheet ? (
        <div className="border-t border-border bg-surface-subtle">
          <ExpandedRow row={row} sheet={sheet} member={member} editable />
        </div>
      ) : null}
    </li>
  )
}

function Section({
  id,
  title,
  rows,
  sheets,
  member,
  openRow,
  setOpenRow,
}: {
  id: string
  title: string
  rows: Row[]
  sheets: Map<string, Sheet>
  member: Member
  openRow: string | null
  setOpenRow: (id: string | null) => void
}) {
  const [folded, setFolded] = useState(false)
  if (rows.length === 0) return null
  return (
    <section
      aria-labelledby={`today-${id}`}
      className="overflow-hidden rounded-card border border-border bg-bg"
      data-testid={`today-${id}`}
    >
      <h2 id={`today-${id}`}>
        <button
          type="button"
          aria-expanded={!folded}
          onClick={() => setFolded((f) => !f)}
          className="flex w-full items-center gap-2 bg-grid-header px-4 py-2 text-left"
        >
          {folded ? (
            <ChevronRight aria-hidden className="size-3.5" />
          ) : (
            <ChevronDown aria-hidden className="size-3.5" />
          )}
          <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-secondary uppercase">
            {title}
          </span>
          <span className="font-mono text-[11px] text-muted tabular-nums">
            {formatNumber(rows.length)}
          </span>
        </button>
      </h2>
      {folded ? null : (
        <ul>
          {rows.map((row) => (
            <Item
              key={row.id}
              row={row}
              sheet={sheets.get(row.sheetId)}
              member={member}
              open={openRow === row.id}
              onToggle={() => setOpenRow(openRow === row.id ? null : row.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function TodayView() {
  const actor = useActor()
  const now = useNow()
  const { data: members, isPending } = useMembers()
  const member = members?.find((m) => m.id === actor?.id)
  const { data: rows, isPending: rowsPending } = useMemberRows(member?.id)
  const { data: sheets = [] } = useSheets(member?.id)
  const panelOpen = useUiStore((s) => s.panelOpen)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const sheetMap = useMemo(() => new Map(sheets.map((s) => [s.id, s])), [sheets])
  const items = useMemo(() => todayItems(rows ?? [], now), [rows, now])

  useEffect(() => {
    if (!rowsPending) document.documentElement.dataset.appReady = 'true'
  }, [rowsPending])

  if (isPending || !members || !member) return <ShellSkeleton />
  const total = items.overdue.length + items.dueToday.length + items.addedThisWeek.length

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <Header members={members} member={member} today />
      <main className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-5 pt-[18px] pb-8">
          <div className="mb-4 flex items-baseline gap-3">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-text">Today</h1>
            <p className="font-mono text-xs font-medium tracking-[0.06em] text-muted uppercase">
              {formatDayHeading(todayIst(now), now)} · {member.name}
            </p>
          </div>
          {rowsPending ? null : total === 0 ? (
            <div className="grid flex-1 place-items-center">
              <EmptyState
                title="Nothing due today."
                description="Give a row a next action with a date, and it shows here when it is due."
                art
              />
            </div>
          ) : (
            <div className="flex max-w-[1100px] flex-col gap-4">
              <Section
                id="overdue"
                title="Overdue"
                rows={items.overdue}
                sheets={sheetMap}
                member={member}
                openRow={openRow}
                setOpenRow={setOpenRow}
              />
              <Section
                id="due"
                title="Due today"
                rows={items.dueToday}
                sheets={sheetMap}
                member={member}
                openRow={openRow}
                setOpenRow={setOpenRow}
              />
              <Section
                id="added"
                title="Added this week"
                rows={items.addedThisWeek}
                sheets={sheetMap}
                member={member}
                openRow={openRow}
                setOpenRow={setOpenRow}
              />
            </div>
          )}
        </div>
        {panelOpen ? <RightPanel member={member} /> : null}
      </main>
    </div>
  )
}
