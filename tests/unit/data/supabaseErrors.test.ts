import { describe, expect, it } from 'vitest'
import { isNetworkError, OfflineError, RemoteError, toDomainError } from '@/data/supabase/errors'
import { PermissionDenied } from '@/domain/permissions'

describe('Supabase errors in the domain’s terms', () => {
  it('reads a lost connection as offline', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isNetworkError('Load failed')).toBe(true)
    expect(isNetworkError(new Error('duplicate key'))).toBe(false)
    expect(toDomainError(new TypeError('Failed to fetch'))).toBeInstanceOf(OfflineError)
    expect(toDomainError({ message: 'fetch failed' })).toBeInstanceOf(OfflineError)
  })

  it('passes other plain errors through', () => {
    const error = new Error('Something else')
    expect(toDomainError(error)).toBe(error)
  })

  it('turns a row-level security refusal into PermissionDenied for the action', () => {
    const error = toDomainError(
      { code: '42501', message: 'new row violates row-level security policy for table "rows"' },
      'addRow',
    )
    expect(error).toBeInstanceOf(PermissionDenied)
    expect((error as PermissionDenied).action).toBe('addRow')
    expect((error as PermissionDenied).reason).toBe('not-owner')
  })

  it('names who uses a tag when its deletion is refused', () => {
    const error = toDomainError(
      { code: '42501', message: 'This tag is used on rows of Asha, Dhruv', hint: 'tag_in_use' },
      'deleteTag',
    ) as PermissionDenied
    expect(error.reason).toBe('tag-in-use')
    expect(error.message).toContain('Asha')
    expect(error.message).toContain('Dhruv')
  })

  it('tells the tag creator, admin and self-change refusals apart', () => {
    const reason = (message: string) =>
      (toDomainError({ code: '42501', message }) as PermissionDenied).reason
    expect(reason('Only the member who created this tag can change it')).toBe('not-tag-creator')
    expect(reason('You cannot change your own admin or active status')).toBe('self')
    expect(reason('Only an admin can add members')).toBe('not-admin')
    expect(reason('permission denied for table rows')).toBe('not-owner')
  })

  it('keeps any other refusal as a RemoteError with its code', () => {
    const error = toDomainError({ code: '23505', message: 'duplicate key value' })
    expect(error).toBeInstanceOf(RemoteError)
    expect(error.message).toBe('duplicate key value')
    expect((error as RemoteError).code).toBe('23505')
    expect(toDomainError({ code: null, message: null }).message).toBe(
      'The database refused the change',
    )
  })
})
