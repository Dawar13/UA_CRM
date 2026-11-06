/**
 * Who is signed in. Supabase mode signs in with email and password (D-035); local mode acts as a
 * member picked in the browser (sample data, tests and previews). Every write in the app is made
 * as `member`, and `can()` decides what they may do.
 */
import { createContext, useContext } from 'react'
import type { Member } from '@/domain/types'
import type { DataMode } from '@/lib/env'

export type AuthStatus =
  /** Checking the stored session. */
  'loading' | 'signed-out' | 'signed-in'

export interface AuthValue {
  mode: DataMode
  status: AuthStatus
  /** The signed-in member; null unless signed in. */
  member: Member | null
  /** A message for the sign-in screen (not on the team, deactivated, signed out elsewhere). */
  notice: string | null
  /** Resolves to an error message, or null when signed in. */
  signIn(email: string, password: string): Promise<string | null>
  signOut(): Promise<void>
  /** Resolves to an error message, or null when changed. */
  changePassword(password: string): Promise<string | null>
  /** Local mode only: act as another member. */
  signInAs?(memberId: string): void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an auth provider.')
  return value
}

/** The signed-in member, or null (also outside an auth provider, as in isolated component tests). */
export function useActor(): Member | null {
  return useContext(AuthContext)?.member ?? null
}

export const NOT_ON_TEAM = "This account isn't on the UA team list. Ask a founder to add you."
export const DEACTIVATED = 'This account is no longer active on the UA team. Ask a founder.'
