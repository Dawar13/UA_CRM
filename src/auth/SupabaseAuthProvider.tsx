/**
 * Supabase mode: email and password sign-in (D-035). After sign-in the app reads the member the
 * account belongs to; an account that is not on the team, or a deactivated member, is told so
 * and signed out. The session persists across reloads until the member signs out.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { isNetworkError } from '@/data/supabase/errors'
import { parseMember } from '@/data/supabase/mappers'
import type { Member } from '@/domain/types'
import { AuthContext, type AuthValue, DEACTIVATED, NOT_ON_TEAM } from './AuthContext'

const UNREACHABLE = "Couldn't reach the CRM. Check the connection and try again."

interface MemberCheck {
  userId: string
  member: Member | null
  failed: boolean
}

function signInError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match."
  if (/email not confirmed/i.test(message)) return 'This account has not been confirmed yet.'
  if (isNetworkError(new Error(message))) return UNREACHABLE
  return message
}

export function SupabaseAuthProvider({
  client,
  children,
}: {
  client: SupabaseClient
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [check, setCheck] = useState<MemberCheck | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void client.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client])

  const userId = session?.user.id ?? null

  // Which member is this account? Asked again after each sign-in (`attempt`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the check on purpose.
  useEffect(() => {
    if (!userId) return
    let active = true
    void client.rpc('api_me').then(
      ({ data, error }) => {
        if (!active) return
        if (error) setCheck({ userId, member: null, failed: true })
        else setCheck({ userId, member: data ? parseMember(data) : null, failed: false })
      },
      () => {
        if (active) setCheck({ userId, member: null, failed: true })
      },
    )
    return () => {
      active = false
    }
  }, [client, userId, attempt])

  const checked = check !== null && check.userId === userId ? check : null

  // Not on the team, or deactivated: say so and sign out.
  useEffect(() => {
    if (!checked || checked.failed || checked.member?.active) return
    setNotice(checked.member ? DEACTIVATED : NOT_ON_TEAM)
    void client.auth.signOut()
  }, [client, checked])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setNotice(null)
      try {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
        if (error) return signInError(error.message)
        setAttempt((n) => n + 1)
        return null
      } catch (error) {
        return signInError(error instanceof Error ? error.message : String(error))
      }
    },
    [client],
  )

  const signOut = useCallback(async () => {
    await client.auth.signOut()
    queryClient.clear()
  }, [client, queryClient])

  const changePassword = useCallback(
    async (password: string) => {
      const { error } = await client.auth.updateUser({ password })
      if (!error) return null
      const least = /at least (\d+)/i.exec(error.message)
      if (least) return `Use at least ${least[1]} characters.`
      if (/different from the old/i.test(error.message))
        return 'Choose a password you have not used here.'
      return error.message
    },
    [client],
  )

  const value = useMemo<AuthValue>(() => {
    let status: AuthValue['status'] = 'loading'
    let member: Member | null = null
    let shownNotice = notice
    if (session === null) status = 'signed-out'
    else if (session && checked) {
      if (checked.failed) {
        status = 'signed-out'
        shownNotice = UNREACHABLE
      } else if (checked.member?.active) {
        status = 'signed-in'
        member = checked.member
      }
    }
    return {
      mode: 'supabase',
      status,
      member,
      notice: shownNotice,
      signIn,
      signOut,
      changePassword,
    }
  }, [session, checked, notice, signIn, signOut, changePassword])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
