/**
 * Export (CLAUDE.md §2.11): the current view of a sheet (visible columns, the tag filter, the
 * sort) to Excel or PDF, from any tab; and "Export everything", one workbook with a tab per sheet.
 */
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useUiStore } from '@/app/uiStore'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import { useRows, useTagMap } from '@/data/hooks'
import { useRepository } from '@/data/RepositoryContext'
import type { Repository } from '@/data/repository'
import type { CellTextContext } from '@/domain/cellInput'
import type { Member, Row, Sheet, Tag } from '@/domain/types'
import { compareSortValues, sortValue, visibleColumns } from '@/features/grid/columnModel'
import { readJson, storageKeys } from '@/lib/storage'
import {
  buildPdf,
  buildXlsx,
  download,
  type ExportView,
  exportFileName,
  XLSX_TYPE,
} from './workbook'

interface SortEntry {
  id: string
  desc: boolean
}

function isSort(value: unknown): value is SortEntry[] {
  return Array.isArray(value)
}

/** Rows as the grid shows them: filtered by tag, then in the grid's sort. */
export function viewRows(
  sheet: Sheet,
  rows: readonly Row[],
  tagMap: ReadonlyMap<string, Tag>,
  filterTag: string | null,
): Row[] {
  let list = filterTag ? rows.filter((r) => r.tagIds.includes(filterTag)) : [...rows]
  const sort = readJson(storageKeys.sort(sheet.id), isSort)?.[0]
  const def = sort ? sheet.columns.find((c) => c.id === sort.id) : undefined
  if (sort && def) {
    const ctx = { sheet, tagMap, rowName: () => undefined }
    list = list.sort((a, b) => {
      const order = compareSortValues(sortValue(def, a, ctx), sortValue(def, b, ctx))
      return sort.desc ? -order : order
    })
  }
  return list
}

function textContext(
  sheet: Sheet,
  rows: readonly Row[],
  tagMap: ReadonlyMap<string, Tag>,
): CellTextContext {
  const names = new Map(rows.map((r) => [r.id, r.name]))
  return {
    now: new Date(),
    tagMap,
    rowName: (id) => names.get(id),
    stageNames: sheet.stages.map((s) => s.name),
  }
}

export function ExportMenu({ member, sheet }: { member: Member; sheet: Sheet }) {
  const { data: rows = [] } = useRows(sheet.id)
  const tagMap = useTagMap()
  const filterTag = useUiStore((s) => s.tagFilters[sheet.id] ?? null)

  const view = (): ExportView => {
    const shown = viewRows(sheet, rows, tagMap, filterTag)
    return {
      title: `${member.name} · ${sheet.name}`,
      columns: visibleColumns(sheet),
      rows: shown,
      ctx: textContext(sheet, rows, tagMap),
    }
  }

  const run = async (kind: 'xlsx' | 'pdf') => {
    const id = toast.loading('Preparing the export…')
    try {
      const v = view()
      const bytes = kind === 'xlsx' ? await buildXlsx([v]) : await buildPdf(v)
      download(
        bytes,
        exportFileName(v.title, kind, new Date()),
        kind === 'xlsx' ? XLSX_TYPE : 'application/pdf',
      )
      toast.success(`Exported ${v.rows.length} rows`, { id })
    } catch {
      toast.error("Couldn't make the export.", { id })
    }
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label="Export" tooltip="Export this view">
          <Download className="size-4" />
        </IconButton>
      </MenuTrigger>
      <MenuContent align="end" className="w-56">
        <MenuItem onSelect={() => void run('xlsx')}>
          <FileSpreadsheet aria-hidden />
          Excel (.xlsx)
        </MenuItem>
        <MenuItem onSelect={() => void run('pdf')}>
          <FileText aria-hidden />
          PDF (A4 landscape)
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** Every sheet of every member, one tab each ("Member · Sheet"). */
export async function exportEverything(repo: Repository): Promise<void> {
  const id = toast.loading('Preparing everything…')
  try {
    const [members, tags] = await Promise.all([repo.listMembers(), repo.listTags()])
    const tagMap = new Map(tags.map((t) => [t.id, t]))
    const views: ExportView[] = []
    for (const member of members) {
      for (const sheet of await repo.listSheets(member.id)) {
        const rows = await repo.listRows(sheet.id)
        views.push({
          title: `${member.name} · ${sheet.name}`,
          columns: visibleColumns(sheet),
          rows,
          ctx: textContext(sheet, rows, tagMap),
        })
      }
    }
    const bytes = await buildXlsx(views)
    download(bytes, exportFileName('Everything', 'xlsx', new Date()), XLSX_TYPE)
    toast.success(`Exported ${views.length} sheets`, { id })
  } catch {
    toast.error("Couldn't make the export.", { id })
  }
}

export function useExportEverything() {
  const repo = useRepository()
  return () => exportEverything(repo)
}
