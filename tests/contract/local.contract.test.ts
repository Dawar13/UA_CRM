import { UaCrmDb } from '@/data/local/db'
import { LocalRepository } from '@/data/local/LocalRepository'
import type { Member } from '@/domain/types'
import { CONTRACT_NOW, type MemberKey, runRepositoryContract } from './repositoryContract'

let counter = 0

const team: { key: MemberKey; name: string; isAdmin: boolean; active: boolean }[] = [
  { key: 'dawar', name: 'Dawar', isAdmin: true, active: true },
  { key: 'dhruv', name: 'Dhruv', isAdmin: true, active: true },
  { key: 'asha', name: 'Asha', isAdmin: false, active: true },
  { key: 'gone', name: 'Gone', isAdmin: true, active: false },
]

runRepositoryContract('LocalRepository', async () => {
  counter += 1
  const db = new UaCrmDb(`ua-crm-contract-${counter}-${Date.now()}`)
  const members: Member[] = team.map((m, position) => ({
    id: `m-${m.key}`,
    slug: m.key,
    name: m.name,
    email: `${m.key}@example.test`,
    position,
    isAdmin: m.isAdmin,
    active: m.active,
    createdAt: CONTRACT_NOW.toISOString(),
  }))
  await db.members.bulkPut(members)
  // Local mode has one repository; the actor comes from each call's context.
  const repo = new LocalRepository(db)
  return {
    as: () => repo,
    asStranger: () => repo,
    memberIds: { dawar: 'm-dawar', dhruv: 'm-dhruv', asha: 'm-asha', gone: 'm-gone' },
    strangerId: 'm-stranger',
    cleanup: async () => {
      db.close()
      await db.delete()
    },
  }
})
