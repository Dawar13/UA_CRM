/** The calendar store contract against the in-memory store the handler tests use. */
import { MemoryStore } from '../../api/_lib/store'
import { runStoreContract } from './storeContract'

runStoreContract('MemoryStore', async () => {
  const store = new MemoryStore()
  const a = { id: 'm-a', email: 'a@example.test', slug: 'a' }
  const b = { id: 'm-b', email: 'b@example.test', slug: 'b' }
  for (const m of [a, b]) store.members.set(m.id, { ...m, name: m.slug, active: true })
  const row = (id: string, ownerId: string, name: string, email: string) => ({
    id,
    ownerId,
    name,
    email,
    sheetSlug: 'customers',
    nextAction: { text: 'Send ROI note', date: { date: '2026-11-13', precision: 'day' as const } },
    nextActionEvent: null,
    deleted: false,
  })
  store.rows.set('r-a', row('r-a', a.id, 'Rohan Mehta', 'rohan@hpf.example'))
  store.rows.set('r-b', row('r-b', b.id, 'Arvind Rao', 'arvind@example.test'))
  return {
    store,
    gatewayFor: async (memberId) => store.gatewayFor(memberId),
    a,
    b,
    rowA: 'r-a',
    rowB: 'r-b',
    addLink: async (memberId, link) => {
      store.links.push({ ...link, memberId })
    },
    history: async (rowId) => store.history.filter((h) => h.rowId === rowId),
    cleanup: async () => {},
  }
})
