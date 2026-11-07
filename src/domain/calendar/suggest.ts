/**
 * Title suggestions (Phase 2, C3): when no guest's email matches, an event whose title holds the
 * full name, or the company, of exactly one of the member's own rows suggests "Possibly <name>?".
 * Suggestions never log history until confirmed. Browser only (it uses the app's normalisers).
 */
import { normaliseCompany, normaliseName } from '../identity'

export interface SuggestRow {
  id: string
  name: string
  company: string
}

/** Whole-word containment of `needle` (already normalised) in a normalised title. */
function containsWords(title: string, needle: string): boolean {
  if (needle === '') return false
  return ` ${title} `.includes(` ${needle} `)
}

/**
 * The one own row an event title names, or null. A full name (two or more words, so a lone first
 * name never matches) wins; otherwise a company of at least four characters. Ambiguity (two rows)
 * gives no suggestion.
 */
export function suggestRowForTitle(title: string, rows: readonly SuggestRow[]): string | null {
  const normalised = normaliseName(title).spaced
  if (normalised === '') return null
  const byName = rows.filter((row) => {
    const name = normaliseName(row.name).spaced
    return name.includes(' ') && containsWords(normalised, name)
  })
  if (byName.length === 1) return byName[0]?.id ?? null
  if (byName.length > 1) return null
  const companyTitle = normaliseCompany(title)
  const byCompany = new Map<string, string[]>()
  for (const row of rows) {
    const company = normaliseCompany(row.company)
    if (company.length < 4 || !containsWords(companyTitle, company)) continue
    byCompany.set(row.id, [company])
  }
  return byCompany.size === 1 ? ([...byCompany.keys()][0] ?? null) : null
}
