/**
 * Your Trash, in the side panel: rows, columns and sheets deleted in the last 30 days, newest
 * first, each with Restore. Nobody else sees it (CLAUDE.md §2.13).
 */
import { ArrowLeft, Columns3, FolderClosed, Rows3 } from 'lucide-react'
import { useUiStore } from '@/app/uiStore'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { useRestoreFromTrash, useSheets, useTrash } from '@/data/hooks'
import { TRASH_DAYS, type TrashItem } from '@/data/repository'
import { daysBetween, formatFuzzyDate, istDateOf, todayIst } from '@/domain/dates'
import { useNow } from '@/lib/useNow'

const kindIcon = {
  row: Rows3,
  column: Columns3,
  sheet: FolderClosed,
} as const

function where(item: TrashItem, sheetName: (id: string) => string | undefined): string {
  if (item.kind === 'sheet') return 'Sheet'
  const sheet = sheetName(item.sheetId)
  const kind = item.kind === 'row' ? 'Row' : 'Column'
  return sheet ? `${kind} · ${sheet}` : kind
}

export function TrashPanel() {
  const showCalendar = useUiStore((s) => s.showCalendar)
  const actor = useActor()
  const now = useNow()
  const { data: items, isPending } = useTrash(actor?.id)
  const { data: sheets = [] } = useSheets(actor?.id)
  const restore = useRestoreFromTrash()
  const sheetName = (id: string) => sheets.find((s) => s.id === id)?.name

  return (
    <section aria-labelledby="trash-panel-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-1.5 px-2.5 pt-3 pb-1">
        <IconButton
          aria-label="Back to this week"
          tooltip="Back to this week"
          onClick={() => {
            showCalendar()
            requestAnimationFrame(() => document.getElementById('calendar-panel-title')?.focus())
          }}
        >
          <ArrowLeft className="size-4" />
        </IconButton>
        <h2
          id="trash-panel-title"
          className="font-mono text-[11.5px] font-semibold tracking-[0.1em] text-text uppercase"
        >
          Trash
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-8" data-testid="trash-panel">
        <p className="pt-1 pb-3 text-xs text-muted">
          Only you see your Trash. Items stay for {TRASH_DAYS} days.
        </p>
        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !items || items.length === 0 ? (
          <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-secondary">
            Trash is empty. Deleted rows, columns and sheets wait here for {TRASH_DAYS} days.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => {
              const Icon = kindIcon[item.kind]
              const deleted = istDateOf(item.deletedAt)
              const left = TRASH_DAYS - daysBetween(deleted, todayIst(now))
              return (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface-raised px-3 py-2.5 shadow-card"
                  data-testid="trash-item"
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-muted" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] font-medium text-text">
                      {item.label}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted">
                      {where(item, sheetName)} ·{' '}
                      {formatFuzzyDate({ date: deleted, precision: 'day' }, now)}
                      {left <= 7 ? ` · ${Math.max(left, 0)} days left` : ''}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    disabled={!actor || restore.isPending}
                    onClick={() => actor && restore.mutate({ item, actorId: actor.id })}
                  >
                    Restore
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
