/**
 * Merging a new contact into a row you already have (CLAUDE.md §2.7): the new values fill empty
 * fields only; where both have a value and they differ, the row keeps its own and the conflict
 * is listed so the member sees both side by side. Tags, links and connections are added. Pure.
 */
import type { NewRowValues, RowPatch } from '../rows'
import type { LinkRef, Row } from '../types'

export interface MergeConflict {
  label: string
  kept: string
  offered: string
}

const TEXT_FIELDS = [
  ['name', 'Name'],
  ['company', 'Company'],
  ['title', 'Title'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['linkedin', 'LinkedIn'],
] as const

const linkKey = (l: LinkRef) =>
  l.kind === 'row' ? `row:${l.rowId}` : `text:${l.text.toLowerCase()}`

export function mergeIntoRow(
  row: Row,
  incoming: NewRowValues,
): { patch: RowPatch; conflicts: MergeConflict[] } {
  const patch: RowPatch = {}
  const conflicts: MergeConflict[] = []
  for (const [key, label] of TEXT_FIELDS) {
    const offered = (incoming[key] ?? '').trim()
    if (!offered) continue
    const kept = row[key].trim()
    if (!kept) Object.assign(patch, { [key]: offered })
    else if (kept.toLowerCase() !== offered.toLowerCase()) conflicts.push({ label, kept, offered })
  }
  if (incoming.notes?.trim()) {
    const kept = row.notes.trim()
    if (!kept) patch.notes = incoming.notes.trim()
    else if (!kept.includes(incoming.notes.trim())) {
      conflicts.push({ label: 'Notes', kept, offered: incoming.notes.trim() })
    }
  }
  if (incoming.links?.length) {
    const all = [...new Set([...row.links, ...incoming.links])]
    if (all.length !== row.links.length) patch.links = all
  }
  if (incoming.tagIds?.length) {
    const all = [...new Set([...row.tagIds, ...incoming.tagIds])]
    if (all.length !== row.tagIds.length) patch.tagIds = all
  }
  if (incoming.connectsTo?.length) {
    const seen = new Set(row.connectsTo.map(linkKey))
    const added = incoming.connectsTo.filter((l) => !seen.has(linkKey(l)))
    if (added.length > 0) patch.connectsTo = [...row.connectsTo, ...added]
  }
  if (incoming.introducedBy && !row.introducedBy) patch.introducedBy = incoming.introducedBy
  if (incoming.nextAction && !row.nextAction) patch.nextAction = incoming.nextAction
  if (incoming.fields) {
    const fields = { ...row.fields }
    let changed = false
    for (const [key, value] of Object.entries(incoming.fields)) {
      const current = fields[key]
      if (current === undefined || current === null || current === '') {
        fields[key] = value
        changed = true
      } else if (JSON.stringify(current) !== JSON.stringify(value)) {
        conflicts.push({ label: key, kept: String(current), offered: String(value) })
      }
    }
    if (changed) patch.fields = fields
  }
  return { patch, conflicts }
}
