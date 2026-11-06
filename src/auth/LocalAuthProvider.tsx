/**
 * Local mode: the browser acts as one member of the sample team, remembered across reloads. The
 * first active member by default; tests pick one through `window.__uaTest.signInAs`, and the
 * Developer menu offers the others.
 */
import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { useMembers } from '@/data/hooks'
import { readStorage, storageKeys, writeStorage } from '@/lib/storage'
import { AuthContext, type AuthValue } from './AuthContext'

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const { data: members } = useMembers()
  const [actorId, setActorId] = useState<string | null>(() => readStorage(storageKeys.localActor))

  const signInAs = useCallback((memberId: string) => {
    writeStorage(storageKeys.localActor, memberId)
    setActorId(memberId)
  }, [])

  const member = useMemo(() => {
    if (!members) return null
    return (
      members.find((m) => m.id === actorId && m.active) ?? members.find((m) => m.active) ?? null
    )
  }, [members, actorId])

  const value = useMemo<AuthValue>(
    () => ({
      mode: 'local',
      status: members ? 'signed-in' : 'loading',
      member,
      notice: null,
      signIn: async () => null,
      signOut: async () => {},
      changePassword: async () => null,
      signInAs,
    }),
    [members, member, signInAs],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
