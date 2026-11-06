/**
 * The duplicate check (CLAUDE.md §2.7), across every sheet of every member. Pure.
 *
 * - Hard: the same phone (E.164), email (lowercased) or LinkedIn slug. Blocks a save until the
 *   member chooses.
 * - Soft: a similar full name after normalisation (Jaro-Winkler ≥ 0.92, also with the spaces
 *   removed), or the same first name at the same company. A banner, not a block.
 * - Anything else (one word in common) is not a duplicate.
 */
import {
  linkedinSlug,
  normaliseCompany,
  normaliseEmail,
  normaliseName,
  normalisePhone,
} from '../identity'
import type { Id, Row } from '../types'

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1
  if (a.length === 0 || b.length === 0) return 0
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatched = new Array<boolean>(a.length).fill(false)
  const bMatched = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const from = Math.max(0, i - range)
    const to = Math.min(i + range + 1, b.length)
    for (let j = from; j < to; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue
      aMatched[i] = true
      bMatched[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue
    while (!bMatched[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  const m = matches
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3
  let prefix = 0
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  return jaro + prefix * 0.1 * (1 - jaro)
}

export const SOFT_NAME_THRESHOLD = 0.92

export interface DedupeInput {
  name: string
  phone?: string
  email?: string
  linkedin?: string
  company?: string
}

export type MatchReason = 'phone' | 'email' | 'linkedin' | 'name' | 'first-name-company'

export interface DuplicateMatch {
  rowId: Id
  level: 'hard' | 'soft'
  reason: MatchReason
}

type Comparable = Pick<Row, 'id' | 'name' | 'phone' | 'email' | 'linkedin' | 'company'>

/** The same pair either way round. */
export function pairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** How `input` matches `row`, or null. */
export function scoreDuplicate(input: DedupeInput, row: Comparable): DuplicateMatch | null {
  const phone = input.phone ? normalisePhone(input.phone) : null
  if (phone && phone === normalisePhone(row.phone))
    return { rowId: row.id, level: 'hard', reason: 'phone' }
  const email = input.email ? normaliseEmail(input.email) : null
  if (email && email === normaliseEmail(row.email))
    return { rowId: row.id, level: 'hard', reason: 'email' }
  const slug = input.linkedin ? linkedinSlug(input.linkedin) : null
  if (slug && slug === linkedinSlug(row.linkedin)) {
    return { rowId: row.id, level: 'hard', reason: 'linkedin' }
  }

  const a = normaliseName(input.name)
  const b = normaliseName(row.name)
  if (!a.spaced || !b.spaced) return null
  const companyA = input.company ? normaliseCompany(input.company) : ''
  const companyB = normaliseCompany(row.company)
  const firstA = a.spaced.split(' ')[0]
  const firstB = b.spaced.split(' ')[0]
  if (companyA && companyA === companyB && firstA && firstA === firstB) {
    return { rowId: row.id, level: 'soft', reason: 'first-name-company' }
  }
  if (a.compact === b.compact) return { rowId: row.id, level: 'soft', reason: 'name' }
  // A single word ("Rohan") only matches a single word: one common word is not a match.
  const several = (s: string) => s.includes(' ')
  if (several(a.spaced) !== several(b.spaced)) return null
  const similar =
    jaroWinkler(a.spaced, b.spaced) >= SOFT_NAME_THRESHOLD ||
    jaroWinkler(a.compact, b.compact) >= SOFT_NAME_THRESHOLD
  if (similar) return { rowId: row.id, level: 'soft', reason: 'name' }
  return null
}

/**
 * Every row `input` may duplicate, hard matches first. Rows remembered as a different person
 * (by `selfId`, a row already saved) are left out, as is the row itself.
 */
export function findDuplicateMatches(
  input: DedupeInput,
  rows: readonly Comparable[],
  options: { notDuplicate?: ReadonlySet<string>; selfId?: Id } = {},
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []
  for (const row of rows) {
    if (row.id === options.selfId) continue
    if (options.selfId && options.notDuplicate?.has(pairKey(options.selfId, row.id))) continue
    const match = scoreDuplicate(input, row)
    if (match) matches.push(match)
  }
  return matches.sort((x, y) => (x.level === y.level ? 0 : x.level === 'hard' ? -1 : 1))
}

export const matchReasonText: Record<MatchReason, string> = {
  phone: 'Same phone',
  email: 'Same email',
  linkedin: 'Same LinkedIn',
  name: 'Similar name',
  'first-name-company': 'Same first name and company',
}
