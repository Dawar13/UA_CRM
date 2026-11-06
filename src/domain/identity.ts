/**
 * Identity normalisers used by search and, in Phase 1, the duplicate check. Pure.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js'

const DEFAULT_COUNTRY = 'IN'

/**
 * E.164 with default region IN via libphonenumber-js: "098450 12345", "+91-98450-12345",
 * "9845012345" → "+919845012345". Returns null when it does not parse as a valid number.
 */
export function normalisePhone(raw: string): string | null {
  const text = raw.trim()
  if (text === '') return null
  const parsed = parsePhoneNumberFromString(text, DEFAULT_COUNTRY)
  return parsed?.isValid() ? parsed.number : null
}

/** Display format for a stored phone: "+91 98450 12345". Falls back to the input. */
export function formatPhone(stored: string): string {
  const parsed = parsePhoneNumberFromString(stored.trim(), DEFAULT_COUNTRY)
  return parsed?.isValid() ? parsed.formatInternational() : stored
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/

/** Trimmed and lowercased ("mailto:" removed); null when not a plausible email. */
export function normaliseEmail(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/^mailto:/i, '')
    .toLowerCase()
  return EMAIL_RE.test(text) ? text : null
}

const LINKEDIN_URL_RE = /linkedin\.com\/(?:in|pub)\/([^/?#\s]+)/i
const LINKEDIN_PATH_RE = /^\/?in\/([^/?#\s]+)\/?$/i
const BARE_SLUG_RE = /^@?([\p{L}\p{N}][\p{L}\p{N}_-]{1,99})$/u

function cleanSlug(slug: string): string | null {
  let decoded = slug
  try {
    decoded = decodeURIComponent(slug)
  } catch {
    // Malformed escapes: keep the raw text.
  }
  const result = decoded.trim().toLowerCase()
  return result === '' ? null : result
}

/**
 * LinkedIn profile slug from a URL or bare text: "linkedin.com/in/rohanmehta/",
 * "https://www.linkedin.com/in/RohanMehta?trk=x" → "rohanmehta". Also accepts "in/rohanmehta"
 * and a bare slug ("rohanmehta", no spaces, dots or slashes). Null when absent.
 */
export function linkedinSlug(raw: string): string | null {
  const text = raw.trim()
  if (text === '') return null
  const url = LINKEDIN_URL_RE.exec(text)
  if (url) return cleanSlug(url[1] ?? '')
  const path = LINKEDIN_PATH_RE.exec(text)
  if (path) return cleanSlug(path[1] ?? '')
  const bare = BARE_SLUG_RE.exec(text)
  if (bare) return cleanSlug(bare[1] ?? '')
  return null
}

/** Titles stripped by normaliseName. */
export const nameTitles: readonly string[] = [
  'Mr',
  'Ms',
  'Mrs',
  'Dr',
  'Cdr',
  'Capt',
  'Col',
  'Prof',
  'Shri',
  'Smt',
  'Er',
]

const TITLE_SET = new Set(nameTitles.map((t) => t.toLowerCase()))

/** Removes accents (combining marks) after compatibility decomposition. */
function stripAccents(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}+/gu, '')
}

/** Splits into letter and number runs, keeping the original case. */
function wordRuns(text: string): string[] {
  return stripAccents(text).match(/[\p{L}\p{N}]+/gu) ?? []
}

/** Drops leading titles ("Prof Dr A Kumar" → "A Kumar"), but never every word. */
function withoutTitles(words: string[]): string[] {
  let start = 0
  while (start < words.length - 1 && TITLE_SET.has((words[start] ?? '').toLowerCase())) start++
  return words.slice(start)
}

/**
 * Lowercase; strip leading titles (Mr, Ms, Mrs, Dr, Cdr, Capt, Col, Prof, Shri, Smt, Er, with
 * or without a trailing dot); strip punctuation and accents; collapse spaces. Also a no-space
 * form, so "Navaneetha Krishnan" equals "Navaneethakrishnan".
 */
export function normaliseName(raw: string): { spaced: string; compact: string } {
  const words = withoutTitles(wordRuns(raw.toLowerCase()))
  return { spaced: words.join(' '), compact: words.join('') }
}

/** Legal suffixes as word sequences, longest first. */
const COMPANY_SUFFIXES: readonly (readonly string[])[] = [
  ['private', 'limited'],
  ['private', 'ltd'],
  ['pvt', 'limited'],
  ['pvt', 'ltd'],
  ['p', 'ltd'],
  ['limited'],
  ['ltd'],
  ['pvt'],
  ['llp'],
  ['incorporated'],
  ['inc'],
  ['llc'],
]

function endsWith(words: string[], suffix: readonly string[]): boolean {
  if (suffix.length >= words.length) return false
  const tail = words.slice(words.length - suffix.length)
  return suffix.every((w, i) => tail[i] === w)
}

/**
 * Strips legal suffixes only (Pvt Ltd, Pvt. Ltd., Private Limited, Ltd, Limited, LLP, Inc,
 * LLC), lowercases, removes punctuation and accents, and collapses spaces. "&" becomes "and".
 * Keeps words like "Industries". A name made only of a suffix is kept as it is.
 */
export function normaliseCompany(raw: string): string {
  const words = wordRuns(raw.toLowerCase().replace(/&/g, ' and '))
  let stripped = true
  while (stripped) {
    stripped = false
    for (const suffix of COMPANY_SUFFIXES) {
      if (endsWith(words, suffix)) {
        words.splice(words.length - suffix.length, suffix.length)
        stripped = true
        break
      }
    }
  }
  return words.join(' ')
}

/**
 * Lowercased, accent-free word tokens for search ("Hosur Precision-Forge" → ["hosur", ...]).
 * Duplicates are removed; first-seen order is kept.
 */
export function searchTokens(text: string): string[] {
  return [...new Set(wordRuns(text.toLowerCase()))]
}
