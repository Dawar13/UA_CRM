/**
 * Errors from Supabase, in the domain's terms: a refusal by row-level security or a guard
 * trigger becomes PermissionDenied with the same words the app uses elsewhere; a lost connection
 * becomes OfflineError. Anything else keeps its message.
 */
import { type Action, type Denial, denialMessage, PermissionDenied } from '@/domain/permissions'

export interface RemoteErrorLike {
  code?: string | null
  message?: string | null
  hint?: string | null
  details?: string | null
}

/** The request never reached the database. */
export class OfflineError extends Error {
  constructor() {
    super("You're offline. Changes are paused until the connection is back.")
    this.name = 'OfflineError'
  }
}

/** Anything else the database refused, with its own message. */
export class RemoteError extends Error {
  readonly code: string | undefined
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'RemoteError'
    this.code = code
  }
}

function denied(action: Action, reason: Denial, names?: readonly string[]): PermissionDenied {
  const permission =
    names === undefined
      ? ({ allowed: false, reason } as const)
      : ({ allowed: false, reason, names } as const)
  return new PermissionDenied(action, permission, denialMessage(permission))
}

/** "This tag is used on rows of Asha, Dhruv" → ["Asha", "Dhruv"]. */
function tagUsers(message: string): string[] {
  const match = /rows of (.+)$/.exec(message)
  return match?.[1] ? match[1].split(',').map((n) => n.trim()) : []
}

export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(
    message,
  )
}

export function toDomainError(error: RemoteErrorLike | Error, action: Action = 'editRow'): Error {
  if (error instanceof Error && !('code' in error)) {
    return isNetworkError(error) ? new OfflineError() : error
  }
  const { code, message = '', hint } = error as RemoteErrorLike
  const text = message ?? ''
  if (isNetworkError(new Error(text))) return new OfflineError()
  if (code === '42501' || /row-level security|permission denied|not yours/i.test(text)) {
    if (hint === 'tag_in_use' || /tag is used/i.test(text)) {
      return denied(action, 'tag-in-use', tagUsers(text))
    }
    if (/created this tag|tag.*creator/i.test(text)) return denied(action, 'not-tag-creator')
    if (/own admin or active/i.test(text)) return denied(action, 'self')
    if (/admin/i.test(text)) return denied(action, 'not-admin')
    return denied(action, 'not-owner')
  }
  return new RemoteError(text || 'The database refused the change', code ?? undefined)
}
