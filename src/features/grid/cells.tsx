import { Check, Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'
import { DateText } from '@/components/crm/DateText'
import { StageDots } from '@/components/crm/StageDots'
import { TagList } from '@/components/crm/TagChip'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { Pill } from '@/components/ui/Pill'
import { useRow } from '@/data/hooks'
import { formatFuzzyDate } from '@/domain/dates'
import { formatCurrency, formatNumber } from '@/domain/format'
import { formatPhone } from '@/domain/identity'
import { stageView } from '@/domain/stages'
import type { ColumnDef, FuzzyDate, LinkRef, Row, Sheet, Tag, Warmth } from '@/domain/types'
import { useNow } from '@/lib/useNow'
import { isFuzzyDate, isLinkRef } from './columnModel'

/** libphonenumber parsing is the costliest part of a row, so formatted numbers are cached. */
const phoneDisplayCache = new Map<string, string>()
function displayPhone(stored: string): string {
  let shown = phoneDisplayCache.get(stored)
  if (shown === undefined) {
    shown = formatPhone(stored)
    if (phoneDisplayCache.size > 5000) phoneDisplayCache.clear()
    phoneDisplayCache.set(stored, shown)
  }
  return shown
}

export interface CellContext {
  sheet: Sheet
  tagMap: ReadonlyMap<string, Tag>
  onWarmthChange: (row: Row, warmth: Warmth | null) => void
}

function Truncate({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`block min-w-0 truncate ${className ?? ''}`}>{children}</span>
}

/** Name of a linked row; empty while loading or when the row is gone. */
export function LinkedRowName({ rowId }: { rowId: string }) {
  const { data } = useRow(rowId)
  return data?.name ?? ''
}

function LinkText({ link }: { link: LinkRef }) {
  return link.kind === 'row' ? <LinkedRowName rowId={link.rowId} /> : link.text
}

/** Next-action dates and last touch read in Geist Mono with tabular figures. */
const DUE_DATE_CLASS = 'font-mono text-xs font-medium'

/** A 56px date slot (it grows for longer dates such as "Early Dec"), then the action text. */
function NextActionCell({ row }: { row: Row }) {
  const next = row.nextAction
  if (!next || (!next.text && !next.date)) return null
  return (
    <span className="flex w-full min-w-0 items-center gap-2.5">
      <span className="min-w-14 shrink-0">
        {next.date ? <DateText date={next.date} variant="due" className={DUE_DATE_CLASS} /> : null}
      </span>
      <Truncate className="text-[13.5px] text-text">{next.text}</Truncate>
    </span>
  )
}

/** One line, like a spreadsheet: just the name. Company and Title have their own columns. */
function NameCell({ row }: { row: Row }) {
  return (
    <Truncate className="text-[13.5px] leading-[1.3] font-[550] tracking-[-0.005em] text-text">
      {row.name}
    </Truncate>
  )
}

function SystemCell({ def, row, ctx }: { def: ColumnDef; row: Row; ctx: CellContext }) {
  switch (def.key) {
    case 'name':
      return <NameCell row={row} />
    case 'company':
    case 'title':
    case 'email':
    case 'linkedin':
    case 'notes':
      return <Truncate className="text-secondary">{row[def.key]}</Truncate>
    case 'phone':
      return row.phone ? (
        <Truncate className="text-secondary tabular-nums">{displayPhone(row.phone)}</Truncate>
      ) : null
    case 'links':
      return <Truncate className="text-secondary">{row.links.join(', ')}</Truncate>
    case 'warmth':
      return (
        <WarmthChip
          value={row.warmth}
          onChange={(next) => ctx.onWarmthChange(row, next)}
          tabbable={false}
          size="sm"
        />
      )
    case 'stage':
      return ctx.sheet.stages.length > 0 ? (
        <StageDots stages={stageView(row, ctx.sheet)} lost={row.lost !== null} />
      ) : null
    case 'tags': {
      const tags = row.tagIds
        .map((id) => ctx.tagMap.get(id))
        .filter((t): t is Tag => t !== undefined)
      // Sheets with stages have less room: one tag and a count; two otherwise.
      return tags.length > 0 ? (
        <TagList tags={tags} max={ctx.sheet.stages.length > 0 ? 1 : 2} className="w-full" />
      ) : null
    }
    case 'lastTouch':
      return row.lastTouchAt ? (
        <DateText date={row.lastTouchAt} className="font-mono text-[12.5px] text-secondary" />
      ) : null
    case 'nextAction':
      return <NextActionCell row={row} />
    case 'nextDate':
      return row.nextAction?.date ? (
        <DateText date={row.nextAction.date} variant="due" className={DUE_DATE_CLASS} />
      ) : null
    case 'introducedBy':
      return row.introducedBy ? (
        <Truncate className="text-secondary">
          <LinkText link={row.introducedBy} />
        </Truncate>
      ) : null
    case 'connectsTo':
      return row.connectsTo.length > 0 ? (
        <Truncate className="text-secondary">
          {row.connectsTo.map((link, i) => (
            <span key={link.kind === 'row' ? link.rowId : `${link.text}-${i}`}>
              {i > 0 ? ', ' : ''}
              <LinkText link={link} />
            </span>
          ))}
        </Truncate>
      ) : null
    case 'files':
      return row.files.length > 0 ? (
        <span className="inline-flex items-center gap-1 text-secondary tabular-nums">
          <Paperclip aria-hidden className="size-3.5" />
          {row.files.length}
        </span>
      ) : null
    default:
      return null
  }
}

function FuzzyDateCell({ date }: { date: FuzzyDate }) {
  const now = useNow()
  return <span className="text-secondary">{formatFuzzyDate(date, now)}</span>
}

function CustomCell({ def, row }: { def: ColumnDef; row: Row }) {
  const value = row.fields[def.key]
  if (value === null || value === undefined || value === '') return null
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? (
        <span className="tabular-nums text-text">{formatNumber(value)}</span>
      ) : null
    case 'currency':
      return typeof value === 'number' ? (
        <span className="tabular-nums text-text">{formatCurrency(value)}</span>
      ) : null
    case 'date':
      return isFuzzyDate(value) ? <FuzzyDateCell date={value} /> : null
    case 'dropdown':
      return (
        <Pill className="max-w-full">
          <span className="truncate">{String(value)}</span>
        </Pill>
      )
    case 'multiSelect':
      return Array.isArray(value) ? (
        <span className="flex min-w-0 gap-1 overflow-hidden">
          {value.map((v) => (
            <Pill key={String(v)} className="shrink-0">
              {String(v)}
            </Pill>
          ))}
        </span>
      ) : null
    case 'checkbox':
      return value === true ? (
        <span className="inline-flex items-center text-secondary">
          <Check aria-hidden className="size-4" />
          <span className="sr-only">Yes</span>
        </span>
      ) : null
    case 'personLink':
      return isLinkRef(value) ? (
        <Truncate className="text-secondary">
          <LinkText link={value} />
        </Truncate>
      ) : null
    case 'phone':
      return (
        <Truncate className="text-secondary tabular-nums">{displayPhone(String(value))}</Truncate>
      )
    case 'files':
      return Array.isArray(value) && value.length > 0 ? (
        <span className="inline-flex items-center gap-1 text-secondary tabular-nums">
          <Paperclip aria-hidden className="size-3.5" />
          {value.length}
        </span>
      ) : null
    default:
      return <Truncate className="text-secondary">{String(value)}</Truncate>
  }
}

/** Renders one grid cell. Empty cells render nothing: no placeholder dashes. */
export function GridCellContent({ def, row, ctx }: { def: ColumnDef; row: Row; ctx: CellContext }) {
  return def.system ? (
    <SystemCell def={def} row={row} ctx={ctx} />
  ) : (
    <CustomCell def={def} row={row} />
  )
}
