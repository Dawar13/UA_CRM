import { ArrowUpRight } from 'lucide-react'
import { useJumpToRow } from '@/app/navigation'
import { AvatarInitials } from '@/components/crm/AvatarInitials'
import { useRowLocation } from '@/data/hooks'
import type { LinkRef } from '@/domain/types'

const chipClass =
  'inline-flex h-7 max-w-full items-center gap-1.5 rounded-control bg-bg pl-1 pr-2.5 text-sm text-text shadow-[inset_0_0_0_1px_var(--border)]'

/** A link to another row that jumps to it, even in another member's tab. */
function RowLinkChip({ rowId }: { rowId: string }) {
  const { data: location } = useRowLocation(rowId)
  const jump = useJumpToRow()
  if (!location) return null
  const { row, sheet, member } = location
  return (
    <button
      type="button"
      onClick={() => jump({ member, sheet, rowId: row.id })}
      className={`${chipClass} transition-[background-color,box-shadow] duration-[var(--duration-fast)] hover:bg-surface-hover hover:shadow-[inset_0_0_0_1px_var(--border-strong)]`}
      data-testid="link-chip"
    >
      <AvatarInitials name={row.name} size="sm" className="size-5 rounded-[4px] text-[9px]" />
      <span className="truncate">{row.name}</span>
      <span className="truncate text-xs text-muted">{`${member.name} · ${sheet.name}`}</span>
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted" />
    </button>
  )
}

export function LinkChip({ link }: { link: LinkRef }) {
  if (link.kind === 'row') return <RowLinkChip rowId={link.rowId} />
  return (
    <span className={`${chipClass} pl-2.5 text-secondary`} data-testid="link-chip">
      <span className="truncate">{link.text}</span>
    </span>
  )
}
