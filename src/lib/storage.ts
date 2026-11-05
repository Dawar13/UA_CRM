/**
 * localStorage access that never throws (private windows and blocked storage return null).
 * Every key is namespaced "ua-crm:".
 */
export const STORAGE_PREFIX = 'ua-crm:'

export const storageKeys = {
  theme: `${STORAGE_PREFIX}theme`,
  lastMember: `${STORAGE_PREFIX}last-member`,
  lastSheet: (memberId: string) => `${STORAGE_PREFIX}last-sheet:${memberId}`,
  panelOpen: `${STORAGE_PREFIX}panel-open`,
  sort: (sheetId: string) => `${STORAGE_PREFIX}sort:${sheetId}`,
} as const

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the preference is simply not remembered.
  }
}

export function readJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = readStorage(key)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  writeStorage(key, JSON.stringify(value))
}
