import { useCallback, useEffect } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { useEditGate } from '@/auth/useCan'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useMembers, useRows, useSheets } from '@/data/hooks'
import type { Member, Row, Sheet } from '@/domain/types'
import { SheetGrid } from '@/features/grid/SheetGrid'
import { ExpandedRow } from '@/features/row-detail/ExpandedRow'
import { SheetSummary, SheetSummarySkeleton } from '@/features/sheet-summary/SheetSummary'
import { Header } from './Header'
import { NotFound } from './NotFound'
import { pickSheet, rememberLocation, sheetPath } from './navigation'
import { RightPanel } from './RightPanel'
import { SheetBar } from './SheetBar'
import { useUiStore } from './uiStore'

function GridSkeleton() {
  return (
    <div
      role="status"
      className="flex flex-col"
      data-testid="grid-skeleton"
      aria-busy="true"
      aria-label="Loading rows"
    >
      <div className="h-10 border-b border-border" />
      {Array.from({ length: 8 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows.
        <div key={i} className="flex h-10 items-center gap-6 border-b border-border px-3">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-2 w-24" />
        </div>
      ))}
    </div>
  )
}

/** The left column: folder tabs on top, then one folder holding the front and the grid. */
const COLUMN = 'flex min-w-0 flex-1 flex-col px-5 pb-5 pt-[18px]'
const FOLDER =
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[0_10px_10px_10px] border border-t-0 border-border bg-bg'

/** Loading frame with the real chrome so nothing jumps when data arrives. */
export function ShellSkeleton() {
  const summaryOpen = useUiStore((s) => s.summaryOpen)
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-6 border-b border-border px-5">
        <Skeleton className="size-7 rounded-brand" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className={COLUMN}>
        <div className="flex h-[var(--sheet-bar-height)] shrink-0 items-end gap-[3px]">
          <Skeleton className="h-full w-32 rounded-none rounded-tl-tab" />
          <Skeleton className="h-[31px] w-28 rounded-none rounded-tl-tab" />
          <Skeleton className="h-[31px] w-40 rounded-none rounded-tl-tab" />
        </div>
        <div className={FOLDER}>
          <SheetSummarySkeleton index={0} open={summaryOpen} />
          <GridSkeleton />
        </div>
      </div>
    </div>
  )
}

/** "customer" for Customers, "contact" for anything else. */
function singular(sheet: Sheet): string {
  const words: Partial<Record<Sheet['template'], string>> = {
    customers: 'customer',
    investors: 'investor',
    advisors: 'advisor',
    connectors: 'connector',
    serviceProviders: 'service provider',
  }
  return words[sheet.template] ?? 'contact'
}

function SheetContent({ member, sheet, index }: { member: Member; sheet: Sheet; index: number }) {
  const { data: rows, isPending } = useRows(sheet.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const expandedRowId = searchParams.get('row')
  const flashRowId = useUiStore((s) => s.flashRowId)
  const clearFlash = useUiStore((s) => s.clearFlash)
  const summaryOpen = useUiStore((s) => s.summaryOpen)
  const setSummaryOpen = useUiStore((s) => s.setSummaryOpen)
  const gate = useEditGate(member)

  useEffect(() => {
    if (!flashRowId) return
    const timer = window.setTimeout(clearFlash, 1400)
    return () => window.clearTimeout(timer)
  }, [flashRowId, clearFlash])

  useEffect(() => {
    if (!isPending) document.documentElement.dataset.appReady = 'true'
  }, [isPending])

  const onExpandedChange = useCallback(
    (rowId: string | null) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params)
          if (rowId) next.set('row', rowId)
          else next.delete('row')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const renderExpanded = useCallback(
    (row: Row) => <ExpandedRow row={row} sheet={sheet} member={member} editable={gate.editable} />,
    [sheet, member, gate.editable],
  )

  if (isPending) {
    return (
      <>
        <SheetSummarySkeleton index={index} open={summaryOpen} />
        <GridSkeleton />
      </>
    )
  }
  const list = rows ?? []
  return (
    <>
      <SheetSummary
        member={member}
        sheet={sheet}
        rows={list}
        index={index}
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        viewOnly={gate.viewOnly}
      />
      {/* The grid scrolls inside whatever height the front leaves. */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          {list.length === 0 ? (
            <div className="grid h-full place-items-center p-8">
              <EmptyState
                title={gate.viewOnly ? 'No one here yet.' : `Add your first ${singular(sheet)}.`}
                description={
                  gate.viewOnly
                    ? `${member.name} has not added anyone to ${sheet.name} yet.`
                    : `${sheet.name} has no rows yet.`
                }
                art
              />
            </div>
          ) : (
            <SheetGrid
              key={sheet.id}
              sheet={sheet}
              rows={list}
              member={member}
              expandedRowId={expandedRowId}
              onExpandedChange={onExpandedChange}
              flashRowId={flashRowId}
              renderExpanded={renderExpanded}
              editable={gate.editable}
              onRefuse={gate.refuse}
            />
          )}
        </div>
      </div>
    </>
  )
}

export function MainView() {
  const { memberSlug = '', sheetSlug = '' } = useParams()
  const { data: members, isPending: membersPending } = useMembers()
  const member = members?.find((m) => m.slug === memberSlug)
  const { data: sheets, isPending: sheetsPending } = useSheets(member?.id)
  const sheet = sheets?.find((s) => s.slug === sheetSlug)
  const panelOpen = useUiStore((s) => s.panelOpen)

  useEffect(() => {
    if (member && sheet) rememberLocation(member.id, sheet.id)
  }, [member, sheet])

  if (membersPending) return <ShellSkeleton />
  if (!members || !member) return <NotFound />
  if (sheetsPending) return <ShellSkeleton />
  if (!sheet) {
    const fallback = pickSheet(member.id, sheets ?? [])
    return fallback ? <Navigate to={sheetPath(member.slug, fallback.slug)} replace /> : <NotFound />
  }
  const list = sheets ?? []
  const index = Math.max(0, list.indexOf(sheet))

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <Header members={members} member={member} />
      <main className="flex min-h-0 flex-1">
        <div className={COLUMN}>
          <SheetBar member={member} sheets={list} sheet={sheet} />
          <section aria-label={`${member.name} · ${sheet.name}`} className={FOLDER}>
            <SheetContent member={member} sheet={sheet} index={index} />
          </section>
        </div>
        {panelOpen ? <RightPanel member={member} /> : null}
      </main>
    </div>
  )
}

/** /m/:memberSlug → the member's remembered sheet, or the first. */
export function MemberRedirect() {
  const { memberSlug = '' } = useParams()
  const { data: members, isPending } = useMembers()
  const member = members?.find((m) => m.slug === memberSlug)
  const { data: sheets, isPending: sheetsPending } = useSheets(member?.id)
  if (isPending || (member && sheetsPending)) return <ShellSkeleton />
  if (!member) return <NotFound />
  const sheet = pickSheet(member.id, sheets ?? [])
  return sheet ? <Navigate to={sheetPath(member.slug, sheet.slug)} replace /> : <NotFound />
}
