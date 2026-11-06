/**
 * Importing (CLAUDE.md §2.11), into your own tab only:
 *
 * - any .xlsx or .csv into a sheet, with a column-mapping preview (remembered per sheet) and the
 *   values that will not fit listed;
 * - the founders' old spreadsheet: your block and the Common rows you pick, sorted by Type into
 *   Investors, Advisors and experts and Connectors (Industry and anything else chosen here),
 *   rows someone else already has marked.
 *
 * Everything imported goes through the duplicate check afterwards.
 */
import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { usePeople, useSheets } from '@/data/hooks'
import { saveErrorMessage } from '@/data/hooks/rowEdits'
import { useRepository } from '@/data/RepositoryContext'
import type { MutationContext } from '@/data/repository'
import { pluralise } from '@/domain/format'
import { normaliseName } from '@/domain/identity'
import {
  type FounderRow,
  founderRowValues,
  mapFounderType,
  readFoundersWorkbook,
  type WorkbookTab,
} from '@/domain/importer/founders'
import { autoMap, lineToRow } from '@/domain/importer/table'
import { templates } from '@/domain/templates'
import type { Member, Row, Sheet, TemplateKey } from '@/domain/types'
import { reviewNewRows } from '@/features/quick-add/DuplicateReview'
import { readJson, STORAGE_PREFIX, writeJson } from '@/lib/storage'
import { readTable } from './workbook'

const selectClass = 'h-8 rounded-control border border-border bg-surface-raised px-2 text-sm'
const mapKey = (sheetId: string) => `${STORAGE_PREFIX}import-map:${sheetId}`
const isMap = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null

function FilePicker({ onTabs }: { onTabs: (tabs: WorkbookTab[], name: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      onTabs(await readTable(file), file.name)
    } catch {
      setError("That file can't be read. Save it as .xlsx or .csv and try again.")
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-default flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-8 text-center hover:bg-surface-hover">
        <span className="text-sm font-medium text-text">Choose an .xlsx or .csv file</span>
        <span className="text-xs text-muted">
          It is read here in the browser; nothing is uploaded.
        </span>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv"
          className="sr-only"
          onChange={(e) => void onChange(e)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-cold">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// ---------- Any table into this sheet ----------

export function ImportDialog({
  sheet,
  open,
  onOpenChange,
}: {
  sheet: Sheet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actor = useActor()
  const repo = useRepository()
  const qc = useQueryClient()
  const [tabs, setTabs] = useState<WorkbookTab[] | null>(null)
  const [tabIndex, setTabIndex] = useState(0)
  const [mapping, setMapping] = useState<(string | null)[]>([])
  const [busy, setBusy] = useState(false)
  const tab = tabs?.[tabIndex]
  const headerIndex = tab ? tab.rows.findIndex((r) => r.some((c) => c.trim() !== '')) : -1
  const header = tab && headerIndex >= 0 ? (tab.rows[headerIndex] ?? []) : []
  const lines = tab ? tab.rows.slice(headerIndex + 1).filter((r) => r.some((c) => c.trim())) : []
  const columns = sheet.columns.filter(
    (c) => !c.deletedAt && c.key !== 'lastTouch' && c.key !== 'files',
  )

  const chooseTab = (all: WorkbookTab[], index: number) => {
    setTabs(all)
    setTabIndex(index)
    const t = all[index]
    const h = t ? (t.rows.find((r) => r.some((c) => c.trim() !== '')) ?? []) : []
    setMapping(autoMap(h, sheet, readJson(mapKey(sheet.id), isMap) ?? {}))
  }

  const now = useMemo(() => new Date(), [])
  const parsed = useMemo(
    () => lines.map((cells, i) => lineToRow(cells, mapping, sheet, headerIndex + i + 2, now)),
    [lines, mapping, sheet, headerIndex, now],
  )
  const importable = parsed.filter((p) => p.values.name?.trim())
  const problems = parsed.flatMap((p) => p.problems)

  const close = (next: boolean) => {
    if (!next) {
      setTabs(null)
      setMapping([])
    }
    onOpenChange(next)
  }

  const run = async () => {
    if (!actor) return
    setBusy(true)
    const ctx = (): MutationContext => ({ actorId: actor.id, now: new Date() })
    try {
      // Remember the mapping for the next file into this sheet.
      const memory: Record<string, string> = {}
      header.forEach((h, i) => {
        const id = mapping[i]
        if (id && h.trim()) memory[h.trim().toLowerCase()] = id
      })
      writeJson(mapKey(sheet.id), memory)
      const tagIds = new Map<string, string>()
      for (const name of new Set(importable.flatMap((p) => p.tagNames))) {
        tagIds.set(name.toLowerCase(), (await repo.createTag({ name }, ctx())).id)
      }
      const rows = await repo.importRows(
        {
          sheetId: sheet.id,
          rows: importable.map((p) =>
            p.tagNames.length > 0
              ? {
                  ...p.values,
                  tagIds: p.tagNames.map((n) => tagIds.get(n.toLowerCase()) ?? '').filter(Boolean),
                }
              : p.values,
          ),
        },
        ctx(),
      )
      toast(`Imported ${pluralise(rows.length, 'row')} into ${sheet.name}`)
      close(false)
      await qc.invalidateQueries()
      await reviewNewRows(repo, rows)
    } catch (error) {
      toast.error(saveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={`Import into ${sheet.name}`}
        description={
          tabs
            ? 'Check how the columns match, then import.'
            : 'Rows from a spreadsheet are added to this sheet.'
        }
        className="max-w-[680px]"
      >
        {!tabs ? (
          <FilePicker onTabs={(all) => chooseTab(all, 0)} />
        ) : (
          <div className="flex flex-col gap-3">
            {tabs.length > 1 ? (
              <label className="flex items-center gap-2 text-sm">
                Tab
                <select
                  value={tabIndex}
                  onChange={(e) => chooseTab(tabs, Number(e.target.value))}
                  className={selectClass}
                >
                  {tabs.map((t, i) => (
                    <option key={t.name} value={i}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <table className="w-full text-sm" data-testid="import-mapping">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium">In the file</th>
                  <th className="py-1 font-medium">Goes to</th>
                  <th className="py-1 font-medium">First value</th>
                </tr>
              </thead>
              <tbody>
                {header.map((h, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are in file order.
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 pr-2">{h || `Column ${i + 1}`}</td>
                    <td className="py-1.5 pr-2">
                      <select
                        aria-label={`Where ${h || `column ${i + 1}`} goes`}
                        value={mapping[i] ?? ''}
                        onChange={(e) =>
                          setMapping((m) => m.map((v, j) => (j === i ? e.target.value || null : v)))
                        }
                        className={`${selectClass} w-full`}
                      >
                        <option value="">Skip</option>
                        {columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="max-w-[200px] truncate py-1.5 text-muted">
                      {lines.find((l) => (l[i] ?? '').trim())?.[i] ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm text-secondary">
              {pluralise(importable.length, 'row')} to import
              {parsed.length > importable.length
                ? `, ${parsed.length - importable.length} without a name skipped`
                : ''}
              .
            </p>
            {problems.length > 0 ? (
              <div className="rounded-control border border-waiting-border bg-waiting-bg px-3 py-2 text-sm text-waiting">
                <p className="font-medium">
                  {pluralise(problems.length, 'value')} will not fit and will be left empty:
                </p>
                <ul className="mt-1 max-h-28 overflow-y-auto">
                  {problems.slice(0, 8).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => close(false)}>Cancel</Button>
          {tabs ? (
            <Button
              variant="primary"
              disabled={busy || importable.length === 0}
              onClick={() => void run()}
            >
              {busy ? 'Importing…' : `Import ${pluralise(importable.length, 'row')}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- The founders' old spreadsheet ----------

const TARGETS: TemplateKey[] = [
  'customers',
  'investors',
  'advisors',
  'connectors',
  'serviceProviders',
]

function defaultTarget(row: FounderRow): TemplateKey {
  return (
    mapFounderType(row.type).template ?? (/industr/i.test(row.type) ? 'customers' : 'connectors')
  )
}

export function FoundersImportDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actor = useActor()
  const repo = useRepository()
  const qc = useQueryClient()
  const { data: sheets = [] } = useSheets(member.id)
  const { data: people = [] } = usePeople()
  const [rows, setRows] = useState<FounderRow[] | null>(null)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [targets, setTargets] = useState<Record<string, TemplateKey>>({})
  const [busy, setBusy] = useState(false)
  const first = member.name.split(' ')[0]?.toLowerCase() ?? ''
  const key = (r: FounderRow) => `${r.block}:${r.line}`
  const mine = (r: FounderRow) => {
    const b = r.block.toLowerCase()
    return b === member.name.toLowerCase() || b === first
  }
  const shown = (rows ?? []).filter((r) => mine(r) || r.block.toLowerCase() === 'common')
  const elsewhere = (r: FounderRow) => {
    const name = normaliseName(r.name).spaced
    return people.find(
      (p) => normaliseName(p.name).spaced === name && !p.where.startsWith(`${member.name} ·`),
    )
  }

  const load = (tabs: WorkbookTab[]) => {
    const all = readFoundersWorkbook(tabs)
    setRows(all)
    setPicked(Object.fromEntries(all.map((r) => [key(r), mine(r)])))
    setTargets(Object.fromEntries(all.map((r) => [key(r), defaultTarget(r)])))
  }

  const chosen = shown.filter((r) => picked[key(r)])

  const close = (next: boolean) => {
    if (!next) setRows(null)
    onOpenChange(next)
  }

  const run = async () => {
    if (!actor) return
    setBusy(true)
    const ctx = (): MutationContext => ({ actorId: actor.id, now: new Date() })
    try {
      const byTemplate = new Map<TemplateKey, FounderRow[]>()
      for (const r of chosen) {
        const t = targets[key(r)] ?? defaultTarget(r)
        byTemplate.set(t, [...(byTemplate.get(t) ?? []), r])
      }
      const added: Row[] = []
      for (const [template, list] of byTemplate) {
        const sheet =
          sheets.find((s) => s.template === template) ??
          (await repo.createSheet(member.id, { name: templates[template].name, template }, ctx()))
        const now = new Date()
        const parts = list.map((r) => founderRowValues(r, template, now))
        added.push(
          ...(await repo.importRows(
            {
              sheetId: sheet.id,
              rows: parts.map((p) => p.values),
              history: parts.map((p) => p.history),
            },
            ctx(),
          )),
        )
      }
      toast(`Imported ${pluralise(added.length, 'person', 'people')}`)
      close(false)
      await qc.invalidateQueries()
      await reviewNewRows(repo, added)
    } catch (error) {
      toast.error(saveErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title="Import the old spreadsheet"
        description={
          rows
            ? `Your block is ticked. Tick the Common rows you want; each goes to the sheet shown.`
            : 'The Dawar, Dhruv and Common blocks with Name, Company, Type, Spl mentions and Date.'
        }
        className="max-w-[760px]"
      >
        {!rows ? (
          <FilePicker onTabs={(tabs) => load(tabs)} />
        ) : shown.length === 0 ? (
          <p className="text-sm text-secondary">
            No rows for {member.name} or Common in that file. Check the block names.
          </p>
        ) : (
          <div className="max-h-[56vh] overflow-y-auto">
            <table className="w-full text-sm" data-testid="founders-import">
              <thead className="sticky top-0 bg-surface-raised">
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-medium" />
                  <th className="py-1 font-medium">Name</th>
                  <th className="py-1 font-medium">Block · Type</th>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 font-medium">Goes to</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const k = key(r)
                  const already = elsewhere(r)
                  return (
                    <tr key={k} className="border-t border-border" data-testid="founders-row">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`Import ${r.name}`}
                          checked={picked[k] ?? false}
                          onChange={(e) => setPicked((p) => ({ ...p, [k]: e.target.checked }))}
                          className="accent-[var(--primary)]"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{r.name}</span>
                        {r.company ? <span className="text-muted"> · {r.company}</span> : null}
                        {already ? (
                          <span className="block text-xs text-waiting">
                            Already in {already.where}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-2 text-secondary">
                        {r.block} · {r.type || 'No type'}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{r.dateText}</td>
                      <td className="py-1.5">
                        <select
                          aria-label={`Sheet for ${r.name}`}
                          value={targets[k] ?? defaultTarget(r)}
                          onChange={(e) =>
                            setTargets((t) => ({ ...t, [k]: e.target.value as TemplateKey }))
                          }
                          className={selectClass}
                        >
                          {TARGETS.map((t) => (
                            <option key={t} value={t}>
                              {templates[t].name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => close(false)}>Cancel</Button>
          {rows ? (
            <Button
              variant="primary"
              disabled={busy || chosen.length === 0}
              onClick={() => void run()}
            >
              {busy ? 'Importing…' : `Import ${pluralise(chosen.length, 'person', 'people')}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
