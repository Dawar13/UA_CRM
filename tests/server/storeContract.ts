/**
 * One suite for the calendar store, run against the in-memory store (always) and the Supabase
 * store (CI, against the local stack), so the two keep the same rules: a state is used once, the
 * sync lock holds, meetings are logged once and only in the owner's rows, and a member's token
 * reaches their own rows only.
 */
import { describe, expect, it } from 'vitest'
import { type CalendarStore, OwnershipError, type RowGateway } from '../../api/_lib/store'
import type { StoredEvent } from '../../src/domain/calendar/google'
import type { EventLink } from '../../src/domain/calendar/logging'

export interface StoreFixture {
  store: CalendarStore
  /** Rows as the member's own token reaches them. */
  gatewayFor(memberId: string): Promise<RowGateway>
  a: { id: string; email: string; slug: string }
  b: { id: string }
  /** A's row: rohan@hpf.example, next action "Send ROI note" on 13 Nov, sheet "customers". */
  rowA: string
  /** B's row. */
  rowB: string
  addLink(memberId: string, link: EventLink): Promise<void>
  history(rowId: string): Promise<{ kind: string; source: string; text: string }[]>
  cleanup(): Promise<void>
}

const T = new Date('2026-11-10T06:30:00.000Z')
const later = (ms: number) => new Date(T.getTime() + ms)

function event(id: string, startAt: string, endAt: string, extra: Partial<StoredEvent> = {}) {
  return {
    googleEventId: id,
    recurringEventId: null,
    status: 'confirmed',
    summary: `Event ${id}`,
    location: '',
    htmlLink: `https://calendar.example/event?eid=${id}`,
    startAt,
    endAt,
    allDay: false,
    startDate: null,
    endDate: null,
    timeZone: 'Asia/Kolkata',
    attendees: [{ email: 'rohan@hpf.example', responseStatus: 'accepted' }],
    selfResponse: 'accepted',
    uaRowId: null,
    uaKind: null,
    googleUpdatedAt: '2026-11-09T10:00:00.000Z',
    ...extra,
  } satisfies StoredEvent
}

export function runStoreContract(name: string, make: () => Promise<StoreFixture>): void {
  describe(`Calendar store contract: ${name}`, () => {
    const withFixture = (test: (f: StoreFixture) => Promise<void>) => async () => {
      const f = await make()
      try {
        await test(f)
      } finally {
        await f.cleanup()
      }
    }

    it(
      'reads a member and uses an OAuth state once, before it expires',
      withFixture(async ({ store, a }) => {
        expect(await store.getMember(a.id)).toMatchObject({
          id: a.id,
          email: a.email,
          slug: a.slug,
        })
        const state = (nonce: string, expiresAt: Date) => ({
          nonce,
          memberId: a.id,
          codeVerifier: `verifier-${nonce}`,
          returnPath: '/m/a/customers',
          expiresAt: expiresAt.toISOString(),
        })
        await store.createState(state('fresh', later(600_000)))
        await store.createState(state('stale', later(-1_000)))

        const taken = await store.takeState('fresh', T)
        expect(taken).toMatchObject({
          ok: true,
          state: { memberId: a.id, codeVerifier: 'verifier-fresh', returnPath: '/m/a/customers' },
        })
        expect(await store.takeState('fresh', T)).toEqual({ ok: false, reason: 'state_used' })
        expect(await store.takeState('stale', T)).toEqual({ ok: false, reason: 'state_expired' })
        expect(await store.takeState('nobody', T)).toEqual({ ok: false, reason: 'state_unknown' })
      }),
    )

    it(
      'keeps a connection, its lock and its sealed secret',
      withFixture(async ({ store, a }) => {
        await store.upsertConnection({
          memberId: a.id,
          googleEmail: 'a@gmail.example',
          scopes: 's',
        })
        await store.updateConnection(a.id, {
          lastSyncedAt: T.toISOString(),
          lastResult: { fetched: 3, logged: 1 },
          channelId: 'channel-a',
          channelTokenHash: 'hash',
        })
        expect(await store.getConnection(a.id)).toMatchObject({
          status: 'active',
          googleEmail: 'a@gmail.example',
          lastSyncedAt: T.toISOString(),
          lastResult: { fetched: 3, logged: 1 },
        })
        expect((await store.findConnectionByChannel('channel-a'))?.memberId).toBe(a.id)
        expect(await store.findConnectionByChannel('channel-x')).toBeNull()
        expect((await store.listConnections('active')).map((c) => c.memberId)).toContain(a.id)

        expect(await store.acquireLock(a.id, T, later(90_000))).toBe(true)
        expect(await store.acquireLock(a.id, later(1_000), later(91_000))).toBe(false)
        expect(await store.acquireLock(a.id, later(100_000), later(190_000))).toBe(true)
        await store.releaseLock(a.id)
        expect(await store.acquireLock(a.id, later(101_000), later(191_000))).toBe(true)
        await store.releaseLock(a.id)

        await store.saveSecret(a.id, { ciphertext: 'c1', iv: 'i1', keyVersion: 1 })
        await store.saveSecret(a.id, { ciphertext: 'c2', iv: 'i2', keyVersion: 2 })
        expect(await store.getSecret(a.id)).toEqual({ ciphertext: 'c2', iv: 'i2', keyVersion: 2 })
      }),
    )

    it(
      'stores events once per Google id, and deletes and purges them',
      withFixture(async ({ store, a, b }) => {
        await store.upsertConnection({
          memberId: a.id,
          googleEmail: 'a@gmail.example',
          scopes: 's',
        })
        await store.upsertEvents(a.id, [
          event('e2', '2026-11-12T05:30:00.000Z', '2026-11-12T06:00:00.000Z'),
          event('e1', '2026-11-11T05:30:00.000Z', '2026-11-11T06:00:00.000Z'),
          event('old', '2026-10-01T05:30:00.000Z', '2026-10-01T06:00:00.000Z'),
        ])
        await store.upsertEvents(a.id, [
          event('e1', '2026-11-11T05:30:00.000Z', '2026-11-11T06:00:00.000Z', {
            summary: 'Plant visit',
            allDay: false,
          }),
        ])
        const listed = await store.listEvents(a.id)
        expect(listed.map((e) => e.googleEventId)).toEqual(['old', 'e1', 'e2'])
        expect(listed[1]).toMatchObject({
          summary: 'Plant visit',
          attendees: [{ email: 'rohan@hpf.example' }],
        })
        expect(await store.listEvents(b.id)).toEqual([])

        expect(await store.deleteEvents(a.id, ['e2', 'missing'])).toBe(1)
        expect(await store.purgeEvents(a.id, '2026-10-11T00:00:00.000Z')).toBe(1)
        expect((await store.listEvents(a.id)).map((e) => e.googleEventId)).toEqual(['e1'])
      }),
    )

    it(
      'lists only the member’s own rows, with the next action and its sheet',
      withFixture(async ({ store, a, rowA, rowB }) => {
        const own = await store.listOwnRows(a.id)
        expect(own.map((r) => r.id)).toEqual([rowA])
        expect(own[0]).toMatchObject({
          ownerId: a.id,
          email: 'rohan@hpf.example',
          name: 'Rohan Mehta',
          sheetSlug: 'customers',
          nextAction: { text: 'Send ROI note', date: { date: '2026-11-13', precision: 'day' } },
          nextActionEvent: null,
        })
        expect(own.some((r) => r.id === rowB)).toBe(false)
      }),
    )

    it(
      'logs a meeting once, and only into the owner’s row',
      withFixture(async ({ store, a, rowA, rowB, history }) => {
        const at = '2026-11-09T05:30:00.000Z'
        expect(await store.logMeeting(a.id, rowA, 'evt-1', at, 'Plant visit')).toBe(true)
        expect(await store.logMeeting(a.id, rowA, 'evt-1', at, 'Plant visit')).toBe(false)
        expect(await store.logMeeting(a.id, rowA, 'evt-2', at, '  ')).toBe(true)
        await expect(store.logMeeting(a.id, rowB, 'evt-1', at, 'Plant visit')).rejects.toThrow(
          OwnershipError,
        )
        const entries = await history(rowA)
        expect(
          entries
            .filter((h) => h.source === 'calendar')
            .map((h) => h.text)
            .sort(),
        ).toEqual(['Meeting', 'Plant visit'])
        expect(entries.every((h) => h.kind === 'meeting')).toBe(true)
        expect(await history(rowB)).toEqual([])
      }),
    )

    it(
      'links a next action to its event through the member’s own token only',
      withFixture(async ({ store, gatewayFor, a, b, rowA, rowB, history }) => {
        const mine = await gatewayFor(a.id)
        expect(await mine.getRow(rowB)).toBeNull()
        await expect(
          mine.setNextActionEvent(rowB, { id: 'evt-x', time: null, state: 'linked' }),
        ).rejects.toThrow(OwnershipError)
        await expect((await gatewayFor(b.id)).getRow(rowA)).resolves.toBeNull()

        await mine.setNextActionEvent(
          rowA,
          { id: 'evt-9', time: '16:00', state: 'linked' },
          '2026-11-14',
        )
        expect(await mine.getRow(rowA)).toMatchObject({
          nextAction: { text: 'Send ROI note', date: { date: '2026-11-14', precision: 'day' } },
          nextActionEvent: { id: 'evt-9', time: '16:00', state: 'linked' },
        })

        // Moved in Google: the date follows, with a note; a stale event id changes nothing.
        const note = 'Next action moved in Google Calendar to Fri 20 Nov'
        expect(
          await store.moveNextAction(
            a.id,
            rowA,
            'evt-old',
            '2026-11-21',
            null,
            note,
            T.toISOString(),
          ),
        ).toBe(false)
        expect(
          await store.moveNextAction(
            a.id,
            rowA,
            'evt-9',
            '2026-11-20',
            '10:00',
            note,
            T.toISOString(),
          ),
        ).toBe(true)
        expect(
          await store.moveNextAction(
            b.id,
            rowA,
            'evt-9',
            '2026-11-22',
            null,
            note,
            T.toISOString(),
          ),
        ).toBe(false)
        const [row] = await store.listOwnRows(a.id)
        expect(row).toMatchObject({
          nextAction: { date: { date: '2026-11-20', precision: 'day' } },
          nextActionEvent: { id: 'evt-9', time: '10:00', state: 'linked' },
        })
        expect((await history(rowA)).map((h) => h.text)).toContain(note)

        // Deleted in Google: marked once.
        expect(await store.markRemoved(a.id, rowA, 'evt-9')).toBe(true)
        expect(await store.markRemoved(a.id, rowA, 'evt-9')).toBe(false)
        expect((await store.listOwnRows(a.id))[0]?.nextActionEvent?.state).toBe('removed_in_google')

        await mine.setNextActionEvent(rowA, null)
        expect((await mine.getRow(rowA))?.nextActionEvent).toBeNull()
      }),
    )

    it(
      'wipes a member’s secret, events and links on disconnect, and nobody else’s',
      withFixture(async ({ store, a, b, rowA, rowB, addLink }) => {
        for (const member of [a.id, b.id]) {
          await store.upsertConnection({
            memberId: member,
            googleEmail: 'x@gmail.example',
            scopes: 's',
          })
          await store.saveSecret(member, { ciphertext: 'c', iv: 'i', keyVersion: 1 })
          await store.upsertEvents(member, [
            event('e1', '2026-11-11T05:30:00.000Z', '2026-11-11T06:00:00.000Z'),
          ])
        }
        const link = (rowId: string): EventLink => ({
          googleEventId: 'e1',
          recurringEventId: null,
          rowId,
          kind: 'confirmed',
        })
        await addLink(a.id, link(rowA))
        await addLink(b.id, link(rowB))
        expect(await store.listLinks(a.id)).toEqual([link(rowA)])

        await store.wipe(a.id)
        expect(await store.getSecret(a.id)).toBeNull()
        expect(await store.listEvents(a.id)).toEqual([])
        expect(await store.listLinks(a.id)).toEqual([])
        expect(await store.getSecret(b.id)).not.toBeNull()
        expect(await store.listEvents(b.id)).toHaveLength(1)
        expect(await store.listLinks(b.id)).toEqual([link(rowB)])
      }),
    )
  })
}
