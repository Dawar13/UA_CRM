import { useCallback, useEffect } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useMembers, useRows, useSheets } from '@/data/hooks'
import type { Member, Row, Sheet } from '@/domain/types'
import { SheetGrid } from '@/features/grid/SheetGrid'
import { ExpandedRow } from '@/features/row-detail/ExpandedRow'
import { Header } from './Header'
import { NotFound } from './NotFound'
import { pickSheet, rememberLocation, sheetPath } from './navigation'
import { RightPanel } from './RightPanel'
import { SheetBar } from './SheetBar'
import { useUiStore } from './uiStore'

function GradientStrip() {
  return (
    <div aria-hidden className="h-[var(--strip-height)] shrink-0 bg-[image:var(--soft-gradient)]" />
  )
}

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

/** Loading frame with the real chrome so nothing jumps when data arrives. */
export function ShellSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <GradientStrip />
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-6 border-b border-border px-4">
        <Skeleton className="size-7 rounded-brand" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex h-[var(--sheet-bar-height)] shrink-0 items-center gap-6 border-b border-border px-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-20" />
      </div>
      <GridSkeleton />
    </div>
  )
}

function SheetContent({ member, sheet }: { member: Member; sheet: Sheet }) {
  const { data: rows, isPending } = useRows(sheet.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const expandedRowId = searchParams.get('row')
  const flashRowId = useUiStore((s) => s.flashRowId)
  const clearFlash = useUiStore((s) => s.clearFlash)

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
    (row: Row) => <ExpandedRow row={row} sheet={sheet} member={member} />,
    [sheet, member],
  )

  if (isPending) return <GridSkeleton />
  if (!rows || rows.length === 0) {
    return (
      <div className="grid h-full place-items-center p-8">
        <EmptyState title="No one here yet." description={`${sheet.name} has no rows yet.`} art />
      </div>
    )
  }
  return (
    <SheetGrid
      key={sheet.id}
      sheet={sheet}
      rows={rows}
      member={member}
      expandedRowId={expandedRowId}
      onExpandedChange={onExpandedChange}
      flashRowId={flashRowId}
      renderExpanded={renderExpanded}
    />
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

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <GradientStrip />
      <Header members={members} member={member} />
      <SheetBar member={member} sheets={sheets ?? []} sheet={sheet} />
      <main className="flex min-h-0 flex-1">
        <section aria-label={`${member.name} · ${sheet.name}`} className="min-w-0 flex-1">
          <SheetContent member={member} sheet={sheet} />
        </section>
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
