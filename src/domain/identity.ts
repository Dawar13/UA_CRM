/**
 * Identity normalisers used by search and, in Phase 1, the duplicate check. Pure.
 *
 * CONTRACT (signatures are fixed; bodies are implemented in M0.3).
 */

/**
 * E.164 with default region IN via libphonenumber-js: "098450 12345", "+91-98450-12345",
 * "9845012345" → "+919845012345". Returns null when it does not parse as a valid number.
 */
export declare function normalisePhone(raw: string): string | null

/** Display format for a stored phone: "+91 98450 12345". Falls back to the input. */
export declare function formatPhone(stored: string): string

/** Trimmed and lowercased; null when not a plausible email. */
export declare function normaliseEmail(raw: string): string | null

/**
 * LinkedIn profile slug from a URL or bare text: "linkedin.com/in/rohanmehta/",
 * "https://www.linkedin.com/in/RohanMehta?trk=x" → "rohanmehta". Null when absent.
 */
export declare function linkedinSlug(raw: string): string | null

/** Titles stripped by normaliseName. */
export declare const nameTitles: readonly string[]

/**
 * Lowercase; strip titles (Mr, Ms, Mrs, Dr, Cdr, Capt, Col, Prof, Shri, Smt, Er, with or
 * without a trailing dot); strip punctuation; collapse spaces. Also a no-space form, so
 * "Navaneetha Krishnan" equals "Navaneethakrishnan".
 */
export declare function normaliseName(raw: string): { spaced: string; compact: string }

/**
 * Strips legal suffixes only (Pvt Ltd, Pvt. Ltd., Private Limited, Ltd, Limited, LLP, Inc,
 * LLC), lowercases and collapses spaces. Keeps words like "Industries".
 */
export declare function normaliseCompany(raw: string): string

/** Lowercased, accent-free word tokens for search ("Hosur Precision-Forge" → ["hosur", ...]). */
export declare function searchTokens(text: string): string[]

/** Initials for avatars: "Rohan Mehta" → "RM", "Cdr Arvind Menon" → "AM", "Dhruv" → "DH". */
export declare function initials(name: string): string
