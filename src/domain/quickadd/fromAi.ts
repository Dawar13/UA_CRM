/**
 * Contacts read by AI (D-055), written back as quick-add text, so they go through the same
 * preview, confidence colours, duplicate check and save as anything typed, and can be edited
 * first. Values are cleaned so they cannot be read as a key, a #tag or a new contact.
 */
import type { Sheet } from '../types'
import { quickAddKeyFor } from './parse'

export interface AiContact {
  name: string
  title: string
  company: string
  location: string
  phones: string[]
  emails: string[]
  linkedin: string
  links: string[]
  warmth: 'warm' | 'waiting' | 'cold' | ''
  stage: string
  tags: string[]
  introducedBy: string
  nextAction: string
  nextDate: string
  notes: string
  fields: { label: string; value: string }[]
}

/** One line of plain text: no line breaks, no #tags, no "key: " that would start a new value. */
export function cleanValue(value: string): string {
  return value
    .replace(/\s*\n+\s*/g, '; ')
    .replace(/#/g, 'no. ')
    .replace(/(\S):(\s)/g, '$1 -$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First-line parts cannot hold the separators of `Name / Title @ Company, Location`. */
function cleanPart(value: string): string {
  return cleanValue(value)
    .replace(/\s*\/\s*/g, ' & ')
    .replace(/@/g, 'at')
    .replace(/,/g, '')
}

function tagWord(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * The sheet's own columns an AI field may fill, by label (system columns have their own keys),
 * each with the key quick add reads for it, or null when no key reaches it.
 */
function customColumns(sheet: Sheet): Map<string, { label: string; key: string | null }> {
  return new Map(
    sheet.columns
      .filter((c) => !c.system && !c.deletedAt)
      .map((c) => [c.label.toLowerCase(), { label: c.label, key: quickAddKeyFor(c, sheet) }]),
  )
}

export function aiContactToQuickAdd(contact: AiContact, sheet: Sheet): string {
  const lines: string[] = []
  let first = cleanPart(contact.name)
  if (contact.title.trim()) first += ` / ${cleanPart(contact.title)}`
  if (contact.company.trim()) first += ` @ ${cleanPart(contact.company)}`
  if (contact.location.trim()) {
    // A location needs the "@ Company" before it; without one it goes in by key.
    if (contact.company.trim()) first += `, ${cleanPart(contact.location)}`
    else lines.push(`loc: ${cleanValue(contact.location)}`)
  }
  lines.unshift(first)

  const reach = [
    ...contact.phones.map(cleanValue),
    ...contact.emails.map(cleanValue),
    ...(contact.linkedin.trim() ? [cleanValue(contact.linkedin)] : []),
    ...contact.links.map(cleanValue),
  ].filter((v) => v !== '')
  if (reach.length > 0) lines.push(reach.join('  '))

  const meta: string[] = []
  if (contact.introducedBy.trim()) meta.push(`via: ${cleanValue(contact.introducedBy)}`)
  if (contact.warmth) meta.push(`#${contact.warmth}`)
  const tags = [...new Set(contact.tags.map(tagWord).filter((t) => t !== ''))]
  meta.push(...tags.map((t) => `#${t}`))
  if (contact.stage.trim() && sheet.stages.length > 0)
    meta.push(`stage: ${cleanValue(contact.stage)}`)
  if (meta.length > 0) lines.push(meta.join('  '))

  const columns = customColumns(sheet)
  const unkeyed: string[] = []
  for (const field of contact.fields) {
    const column = columns.get(field.label.trim().toLowerCase())
    const value = cleanValue(field.value)
    if (!column || !value) continue
    // A column no key reaches keeps its value in Notes: nothing read is dropped.
    if (column.key) lines.push(`${column.key}: ${value}`)
    else unkeyed.push(`${column.label} - ${value}`)
  }

  const action = cleanValue(contact.nextAction)
  const date = cleanValue(contact.nextDate)
  if (action || date) lines.push(`next: ${[date, action].filter(Boolean).join(' ')}`)

  const notes = [...unkeyed, cleanValue(contact.notes)].filter(Boolean).join('; ')
  if (notes) lines.push(`note: ${notes}`)
  return lines.join('\n')
}

/** Several contacts: a blank line between each, as quick add expects. */
export function aiContactsToQuickAdd(contacts: readonly AiContact[], sheet: Sheet): string {
  return contacts
    .filter((c) => c.name.trim() !== '')
    .map((c) => aiContactToQuickAdd(c, sheet))
    .join('\n\n')
}
