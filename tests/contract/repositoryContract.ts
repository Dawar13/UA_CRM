/**
 * The Repository contract: the same scenarios and the same expected results for every
 * implementation, including every permission refusal (CLAUDE.md §2.14). Each implementation has a
 * small runner (`*.contract.test.ts`) that supplies a harness with four invented members:
 *
 * - Dawar and Dhruv, admins, each with their own tab;
 * - Asha, a regular member;
 * - Gone, a deactivated member.
 *
 * Sheets, rows and tags are made through the repository itself, so the setup exercises it too.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MutationContext, Repository } from '@/data/repository'
import { MemberRuleError } from '@/domain/members'
import { type Denial, PermissionDenied } from '@/domain/permissions'
import { RowValidationError } from '@/domain/rows'
import { SheetRuleError } from '@/domain/sheets'
import type { Id, Row, Sheet, Tag } from '@/domain/types'

export type MemberKey = 'dawar' | 'dhruv' | 'asha' | 'gone'

export interface ContractHarness {
  /** The repository as seen by a signed-in member (one client per member where that matters). */
  as(member: MemberKey): Repository
  /** The repository as seen by a signed-in user who is not on the team. */
  asStranger(): Repository
  memberIds: Record<MemberKey, Id>
  /** An id no member has. */
  strangerId: Id
  cleanup(): Promise<void>
}

/** 5 Nov 2026, 10:00 IST, the reference time of every test. */
export const CONTRACT_NOW = new Date('2026-11-05T10:00:00+05:30')

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  )
}

async function expectDenied(promise: Promise<unknown>, reason: Denial): Promise<PermissionDenied> {
  const error = await refusal(promise)
  expect(error).toBeInstanceOf(PermissionDenied)
  expect((error as PermissionDenied).reason).toBe(reason)
  return error as PermissionDenied
}

export function runRepositoryContract(
  name: string,
  makeHarness: () => Promise<ContractHarness>,
): void {
  describe(`Repository contract: ${name}`, () => {
    let h: ContractHarness
    let dawar: Repository
    let dhruv: Repository
    let asha: Repository
    let gone: Repository
    let ctx: (member: MemberKey, minutes?: number) => MutationContext
    let dawarCustomers: Sheet
    let dhruvConnectors: Sheet
    let rohan: Row
    let krithik: Row

    beforeEach(async () => {
      h = await makeHarness()
      dawar = h.as('dawar')
      dhruv = h.as('dhruv')
      asha = h.as('asha')
      gone = h.as('gone')
      // Each call can step the clock on, so histories stay in a known order.
      ctx = (member, minutes = 0) => ({
        actorId: h.memberIds[member],
        now: new Date(CONTRACT_NOW.getTime() + minutes * 60_000),
      })
      dawarCustomers = await dawar.createSheet(
        h.memberIds.dawar,
        { name: 'Customers', template: 'customers' },
        ctx('dawar'),
      )
      dhruvConnectors = await dhruv.createSheet(
        h.memberIds.dhruv,
        { name: 'Connectors', template: 'connectors' },
        ctx('dhruv'),
      )
      rohan = (
        await dawar.createRow(
          {
            sheetId: dawarCustomers.id,
            values: {
              name: '  Rohan Mehta ',
              company: 'Hosur Precision Forge',
              phone: '+91 98450 12345',
              warmth: 'warm',
              stageIndex: 2,
            },
          },
          ctx('dawar'),
        )
      ).row
      krithik = (
        await dhruv.createRow(
          { sheetId: dhruvConnectors.id, values: { name: 'Krithik Rao' } },
          ctx('dhruv'),
        )
      ).row
    })

    afterEach(async () => {
      await h.cleanup()
    })

    describe('reading', () => {
      it('every member reads every tab', async () => {
        for (const repo of [dawar, dhruv, asha]) {
          expect((await repo.listSheets(h.memberIds.dawar)).map((s) => s.name)).toEqual([
            'Customers',
          ])
          expect((await repo.listRows(dhruvConnectors.id)).map((r) => r.name)).toEqual([
            'Krithik Rao',
          ])
          expect((await repo.listHistory(rohan.id)).map((e) => e.kind)).toEqual(['created'])
        }
        const team = await dhruv.listMembers()
        expect(team.map((m) => m.name)).toEqual(['Dawar', 'Dhruv', 'Asha', 'Gone'])
        expect(team.map((m) => [m.isAdmin, m.active])).toEqual([
          [true, true],
          [true, true],
          [false, true],
          [true, false],
        ])
      })
    })

    describe('rows', () => {
      it('a new row is tidied, owned by the sheet owner and logged as created', async () => {
        expect(rohan).toMatchObject({
          name: 'Rohan Mehta',
          phone: '+919845012345',
          memberId: h.memberIds.dawar,
          sheetId: dawarCustomers.id,
          warmth: 'warm',
          stageIndex: 2,
          createdBy: h.memberIds.dawar,
          deletedAt: null,
        })
        const [first, second, third] = dawarCustomers.stages
        expect(rohan.stageDates).toEqual({
          [first?.id ?? '']: null,
          [second?.id ?? '']: null,
          [third?.id ?? '']: '2026-11-05',
        })
        expect(rohan.lastTouchAt).not.toBeNull()
        const [created] = await dawar.listHistory(rohan.id)
        expect(created).toMatchObject({
          kind: 'created',
          text: 'Added to Customers',
          memberId: h.memberIds.dawar,
        })
      })

      it('rows are added at the end of the sheet', async () => {
        const second = await dawar.createRow(
          { sheetId: dawarCustomers.id, values: { name: 'Sunita Kulkarni' } },
          ctx('dawar', 1),
        )
        expect(second.row.position).toBeGreaterThan(rohan.position)
        expect((await dawar.listRows(dawarCustomers.id)).map((r) => r.name)).toEqual([
          'Rohan Mehta',
          'Sunita Kulkarni',
        ])
      })

      it('another member cannot add a row to your sheet', async () => {
        await expectDenied(
          dhruv.createRow({ sheetId: dawarCustomers.id, values: { name: 'Sneaky' } }, ctx('dhruv')),
          'not-owner',
        )
        expect(await dawar.listRows(dawarCustomers.id)).toHaveLength(1)
      })

      it('a row needs a name and a stage on its sheet', async () => {
        const unnamed = await refusal(
          dawar.createRow({ sheetId: dawarCustomers.id, values: { name: ' ' } }, ctx('dawar')),
        )
        expect(unnamed).toBeInstanceOf(RowValidationError)
        expect((unnamed as Error).message).toBe('A row needs a name')
        const noStages = await refusal(
          dhruv.createRow(
            { sheetId: dhruvConnectors.id, values: { name: 'X', stageIndex: 0 } },
            ctx('dhruv'),
          ),
        )
        expect((noStages as Error).message).toBe('This sheet has no stages')
      })

      it('the owner edits cells; the patch cannot move ownership or touch derived fields', async () => {
        const updated = await dawar.updateRow(
          rohan.id,
          {
            title: 'Plant Head',
            fields: { plantLocation: 'Hosur' },
            ...({ memberId: h.memberIds.dhruv, lastTouchAt: null, warmth: 'cold' } as object),
          },
          ctx('dawar', 1),
        )
        expect(updated).toMatchObject({
          title: 'Plant Head',
          fields: { plantLocation: 'Hosur' },
          memberId: h.memberIds.dawar,
          warmth: 'warm',
          lastTouchAt: rohan.lastTouchAt,
        })
        expect(await dhruv.getRow(rohan.id)).toMatchObject({ title: 'Plant Head' })
      })

      it('custom fields are checked against their column type', async () => {
        const error = await refusal(
          dawar.updateRow(rohan.id, { fields: { ticketEstimate: 'lots' } }, ctx('dawar')),
        )
        expect(error).toBeInstanceOf(RowValidationError)
      })

      it('another member cannot edit, stage, warm or delete your row', async () => {
        await expectDenied(dhruv.updateRow(rohan.id, { title: 'X' }, ctx('dhruv')), 'not-owner')
        await expectDenied(dhruv.updateStage(rohan.id, 3, ctx('dhruv')), 'not-owner')
        await expectDenied(dhruv.updateWarmth(rohan.id, 'cold', ctx('dhruv')), 'not-owner')
        await expectDenied(dhruv.markLost(rohan.id, ctx('dhruv')), 'not-owner')
        await expectDenied(dhruv.deleteRows([rohan.id], ctx('dhruv')), 'not-owner')
        expect(await dawar.getRow(rohan.id)).toMatchObject({
          title: '',
          stageIndex: 2,
          warmth: 'warm',
          deletedAt: null,
        })
      })

      it('the owner still changes stage and warmth, with history', async () => {
        await dawar.updateStage(rohan.id, 3, ctx('dawar', 1))
        await dawar.updateWarmth(rohan.id, 'waiting', ctx('dawar', 2))
        expect((await dawar.listHistory(rohan.id)).map((e) => e.kind)).toEqual([
          'warmth',
          'stage',
          'created',
        ])
      })

      it('deleting is all or nothing, and Trash is private to the owner', async () => {
        await expectDenied(dawar.deleteRows([rohan.id, krithik.id], ctx('dawar')), 'not-owner')
        expect(await dawar.getRow(rohan.id)).toBeDefined()

        await dawar.deleteRows([rohan.id], ctx('dawar', 1))
        expect(await dawar.getRow(rohan.id)).toBeUndefined()
        expect(await dhruv.listRows(dawarCustomers.id)).toEqual([])
        expect(await dawar.listTrash(ctx('dawar', 2))).toEqual([
          expect.objectContaining({ kind: 'row', id: rohan.id, label: 'Rohan Mehta' }),
        ])
        expect(await dhruv.listTrash(ctx('dhruv', 2))).toEqual([])
        expect((await dhruv.search('rohan')).map((r) => r.row.id)).not.toContain(rohan.id)

        await expectDenied(dhruv.restoreRows([rohan.id], ctx('dhruv', 3)), 'not-owner')
        await dawar.restoreRows([rohan.id], ctx('dawar', 3))
        expect(await dhruv.getRow(rohan.id)).toMatchObject({ name: 'Rohan Mehta', deletedAt: null })
        expect(await dawar.listTrash(ctx('dawar', 4))).toEqual([])
      })

      it('Trash forgets what was deleted more than 30 days ago', async () => {
        await dawar.deleteRows([rohan.id], ctx('dawar'))
        expect(await dawar.listTrash(ctx('dawar', 29 * 24 * 60))).toHaveLength(1)
        expect(await dawar.listTrash(ctx('dawar', 31 * 24 * 60))).toEqual([])
      })
    })

    describe('copy to my sheet', () => {
      it("copies another member's contact into your sheet, linked as the same person", async () => {
        const copy = await dhruv.copyRow(rohan.id, dhruvConnectors.id, ctx('dhruv', 1))
        expect(copy.row).toMatchObject({
          name: 'Rohan Mehta',
          company: 'Hosur Precision Forge',
          phone: '+919845012345',
          memberId: h.memberIds.dhruv,
          sheetId: dhruvConnectors.id,
          warmth: null,
          stageIndex: null,
          samePerson: [rohan.id],
        })
        expect(await dawar.listSamePersonOf(rohan.id)).toEqual([copy.row.id])
        // Nothing changes on their row.
        expect((await dawar.getRow(rohan.id))?.samePerson ?? []).toEqual([])
      })

      it('refuses copying your own row, or into a sheet that is not yours', async () => {
        await expectDenied(
          dawar.copyRow(rohan.id, dawarCustomers.id, ctx('dawar')),
          'already-yours',
        )
        await expectDenied(asha.copyRow(rohan.id, dhruvConnectors.id, ctx('asha')), 'not-owner')
      })
    })

    describe('duplicates', () => {
      it('finds hard and soft matches in every tab, and forgets pairs marked different', async () => {
        const hard = await dhruv.findDuplicates({ name: 'Someone', phone: '098450 12345' })
        expect(
          hard.map((c) => [c.level, c.reason, c.location.row.id, c.location.member.id]),
        ).toEqual([['hard', 'phone', rohan.id, h.memberIds.dawar]])
        const soft = await dhruv.findDuplicates({ name: 'Dr Rohan Mehta' })
        expect(soft.map((c) => [c.level, c.reason])).toEqual([['soft', 'name']])
        expect(await dhruv.findDuplicates({ name: 'Rohan' })).toEqual([])

        // Different person: Dhruv keeps his own Rohan Mehta and the pair is remembered.
        const mine = await dhruv.createRow(
          { sheetId: dhruvConnectors.id, values: { name: 'Rohan Mehta' } },
          ctx('dhruv', 1),
        )
        expect(
          (await dhruv.findDuplicates({ name: 'Rohan Mehta' }, { selfId: mine.row.id })).map(
            (c) => c.location.row.id,
          ),
        ).toEqual([rohan.id])
        await dhruv.markNotDuplicate(mine.row.id, rohan.id, ctx('dhruv', 2))
        expect(
          await dhruv.findDuplicates({ name: 'Rohan Mehta' }, { selfId: mine.row.id }),
        ).toEqual([])
        await expectDenied(asha.markNotDuplicate(mine.row.id, rohan.id, ctx('asha')), 'not-owner')
      })
    })

    describe('files', () => {
      it('the owner attaches and removes files; others can open them', async () => {
        const data = new Blob(['UA pilot proposal'], { type: 'text/plain' })
        const file = await dawar.attachFile(
          rohan.id,
          { name: 'proposal.txt', type: 'text/plain', size: data.size, data },
          ctx('dawar', 1),
        )
        expect(file).toMatchObject({
          name: 'proposal.txt',
          size: data.size,
          mimeType: 'text/plain',
        })
        const seen = await dhruv.getRow(rohan.id)
        expect(seen?.files.map((f) => f.name)).toEqual(['proposal.txt'])
        expect(await dhruv.fileUrl(seen?.files[0] ?? file)).toMatch(/^(data:|https?:)/)

        await expectDenied(
          dhruv.attachFile(
            rohan.id,
            { name: 'x.txt', type: 'text/plain', size: data.size, data },
            ctx('dhruv'),
          ),
          'not-owner',
        )
        await expectDenied(dhruv.removeFile(rohan.id, file.id, ctx('dhruv')), 'not-owner')

        await dawar.removeFile(rohan.id, file.id, ctx('dawar', 2))
        expect((await dawar.getRow(rohan.id))?.files).toEqual([])
      })
    })

    describe('history', () => {
      it('the owner logs a touch and last touch follows it', async () => {
        const entry = await dawar.addHistory(
          rohan.id,
          { kind: 'call', at: '2026-11-05T05:00:00.000Z', text: ' Wants a pilot on line 3 ' },
          ctx('dawar', 1),
        )
        expect(entry).toMatchObject({
          kind: 'call',
          source: 'manual',
          text: 'Wants a pilot on line 3',
          memberId: h.memberIds.dawar,
        })
        const later = await dawar.addHistory(
          rohan.id,
          { kind: 'meeting', at: '2026-11-06T05:00:00.000Z', text: 'Plant visit' },
          ctx('dawar', 2),
        )
        expect((await dawar.getRow(rohan.id))?.lastTouchAt).toBe(later.at)

        await dawar.deleteHistory(later.id, ctx('dawar', 3))
        expect((await dawar.getRow(rohan.id))?.lastTouchAt).toBe(entry.at)

        const moved = await dawar.updateHistory(
          entry.id,
          { at: '2026-11-07T05:00:00.000Z', text: 'Called back' },
          ctx('dawar', 4),
        )
        expect(moved.text).toBe('Called back')
        expect((await dawar.getRow(rohan.id))?.lastTouchAt).toBe('2026-11-07T05:00:00.000Z')
      })

      it('another member cannot log, edit or delete history on your row', async () => {
        const entry = await dawar.addHistory(
          rohan.id,
          { kind: 'note', at: '2026-11-05T05:00:00.000Z', text: 'Note' },
          ctx('dawar', 1),
        )
        await expectDenied(
          dhruv.addHistory(rohan.id, { kind: 'note', at: entry.at, text: 'x' }, ctx('dhruv')),
          'not-owner',
        )
        await expectDenied(dhruv.updateHistory(entry.id, { text: 'x' }, ctx('dhruv')), 'not-owner')
        await expectDenied(dhruv.deleteHistory(entry.id, ctx('dhruv')), 'not-owner')
        expect(await dawar.listHistory(rohan.id)).toHaveLength(2)
      })

      it('automatic entries are kept as they are', async () => {
        const [created] = await dawar.listHistory(rohan.id)
        const error = await refusal(dawar.deleteHistory(created?.id ?? '', ctx('dawar')))
        expect(error).toBeInstanceOf(RowValidationError)
      })
    })

    describe('sheets', () => {
      it('a sheet starts from its template and is placed last', async () => {
        expect(dawarCustomers).toMatchObject({
          memberId: h.memberIds.dawar,
          slug: 'customers',
          template: 'customers',
          deletedAt: null,
        })
        expect(dawarCustomers.stages.map((s) => s.name)).toEqual([
          'Identified',
          'Intro asked',
          'First call',
          'Plant visit',
          'Pilot scoped',
          'Pilot live',
          'Paid',
        ])
        expect(dawarCustomers.columns.some((c) => c.key === 'archetype')).toBe(true)
        const second = await dawar.createSheet(
          h.memberIds.dawar,
          { name: 'Customers', template: 'blank' },
          ctx('dawar', 1),
        )
        expect(second.slug).toBe('customers-2')
        expect(second.position).toBeGreaterThan(dawarCustomers.position)
      })

      it('the owner renames, reorders, deletes and restores sheets', async () => {
        const investors = await dawar.createSheet(
          h.memberIds.dawar,
          { name: 'Investors', template: 'investors' },
          ctx('dawar', 1),
        )
        const renamed = await dawar.updateSheet(
          dawarCustomers.id,
          { name: 'Plants' },
          ctx('dawar', 2),
        )
        expect(renamed).toMatchObject({ name: 'Plants', slug: 'plants' })
        await dawar.reorderSheets(
          h.memberIds.dawar,
          [investors.id, dawarCustomers.id],
          ctx('dawar', 3),
        )
        expect((await dhruv.listSheets(h.memberIds.dawar)).map((s) => s.name)).toEqual([
          'Investors',
          'Plants',
        ])

        await dawar.deleteSheet(investors.id, ctx('dawar', 4))
        expect((await dhruv.listSheets(h.memberIds.dawar)).map((s) => s.name)).toEqual(['Plants'])
        expect(await dhruv.getSheet(investors.id)).toBeUndefined()
        expect(await dawar.listTrash(ctx('dawar', 5))).toEqual([
          expect.objectContaining({ kind: 'sheet', id: investors.id, label: 'Investors' }),
        ])
        await dawar.restoreSheet(investors.id, ctx('dawar', 6))
        expect((await dhruv.listSheets(h.memberIds.dawar)).map((s) => s.name)).toEqual([
          'Plants',
          'Investors',
        ])
      })

      it('a row in a trashed sheet disappears for others along with it', async () => {
        await dawar.deleteSheet(dawarCustomers.id, ctx('dawar', 1))
        expect(await dhruv.getRow(rohan.id)).toBeUndefined()
        expect(await dhruv.getRowLocation(rohan.id)).toBeUndefined()
        expect((await dhruv.search('rohan')).map((r) => r.row.id)).not.toContain(rohan.id)
      })

      it('another member cannot create, rename, reorder or delete your sheets', async () => {
        await expectDenied(
          dhruv.createSheet(h.memberIds.dawar, { name: 'X', template: 'blank' }, ctx('dhruv')),
          'not-owner',
        )
        await expectDenied(
          dhruv.updateSheet(dawarCustomers.id, { name: 'X' }, ctx('dhruv')),
          'not-owner',
        )
        await expectDenied(
          dhruv.reorderSheets(h.memberIds.dawar, [dawarCustomers.id], ctx('dhruv')),
          'not-owner',
        )
        await expectDenied(dhruv.deleteSheet(dawarCustomers.id, ctx('dhruv')), 'not-owner')
        expect(await dawar.getSheet(dawarCustomers.id)).toMatchObject({ name: 'Customers' })
      })

      it('the owner edits stages; rows keep their stage or move where chosen', async () => {
        const [identified, introAsked, firstCall, ...rest] = dawarCustomers.stages
        if (!identified || !introAsked || !firstCall) throw new Error('stages')
        // Remove First call (Rohan is there) and send its rows to Intro asked; add a stage.
        const sheet = await dawar.editStages(
          dawarCustomers.id,
          [identified, introAsked, ...rest, { id: crypto.randomUUID(), name: 'Renewed' }],
          { [firstCall.id]: introAsked.id },
          ctx('dawar', 1),
        )
        expect(sheet.stages.map((s) => s.name)).toEqual([
          'Identified',
          'Intro asked',
          'Plant visit',
          'Pilot scoped',
          'Pilot live',
          'Paid',
          'Renewed',
        ])
        const moved = await dhruv.getRow(rohan.id)
        expect(moved?.stageIndex).toBe(1)
        expect(moved?.stageDates[introAsked.id]).toBe('2026-11-05')
        await expectDenied(
          dhruv.editStages(dawarCustomers.id, [identified], {}, ctx('dhruv')),
          'not-owner',
        )
      })

      it('the owner changes a column type and values convert', async () => {
        const sheet = await dawar.addColumn(
          dawarCustomers.id,
          { label: 'Budget', type: 'text' },
          ctx('dawar', 1),
        )
        const budget = sheet.columns.find((c) => c.label === 'Budget')
        await dawar.updateRow(rohan.id, { fields: { budget: '25L' } }, ctx('dawar', 2))
        const converted = await dawar.convertColumn(
          dawarCustomers.id,
          budget?.id ?? '',
          'currency',
          ctx('dawar', 3),
        )
        expect(converted.columns.find((c) => c.id === budget?.id)?.type).toBe('currency')
        expect((await dawar.getRow(rohan.id))?.fields.budget).toBe(2_500_000)
        await expectDenied(
          dhruv.convertColumn(dawarCustomers.id, budget?.id ?? '', 'text', ctx('dhruv')),
          'not-owner',
        )
      })

      it('stages can be renamed in place', async () => {
        const stages = dawarCustomers.stages.map((s, i) =>
          i === 0 ? { ...s, name: 'Spotted' } : s,
        )
        const sheet = await dawar.updateSheet(dawarCustomers.id, { stages }, ctx('dawar', 1))
        expect(sheet.stages[0]?.name).toBe('Spotted')
        expect(sheet.stages.map((s) => s.id)).toEqual(dawarCustomers.stages.map((s) => s.id))
      })
    })

    describe('columns', () => {
      it('the owner adds, edits, hides, deletes and restores a custom column', async () => {
        let sheet = await dawar.addColumn(
          dawarCustomers.id,
          { label: 'Plant size', type: 'dropdown', options: ['Small', 'Large', 'small'] },
          ctx('dawar', 1),
        )
        const column = sheet.columns.find((c) => c.label === 'Plant size')
        expect(column).toMatchObject({
          key: 'plantSize',
          system: false,
          options: ['Small', 'Large'],
        })
        const id = column?.id ?? ''

        sheet = await dawar.updateColumn(
          dawarCustomers.id,
          id,
          { label: 'Plant scale', hidden: true },
          ctx('dawar', 2),
        )
        expect(sheet.columns.find((c) => c.id === id)).toMatchObject({
          label: 'Plant scale',
          hidden: true,
        })

        sheet = await dawar.deleteColumn(dawarCustomers.id, id, ctx('dawar', 3))
        expect(sheet.columns.find((c) => c.id === id)?.deletedAt).toBeTruthy()
        expect(await dawar.listTrash(ctx('dawar', 4))).toEqual([
          expect.objectContaining({ kind: 'column', id, sheetId: dawarCustomers.id }),
        ])
        sheet = await dawar.restoreColumn(dawarCustomers.id, id, ctx('dawar', 5))
        expect(sheet.columns.find((c) => c.id === id)?.deletedAt ?? null).toBeNull()
      })

      it('system columns can be hidden but not deleted, and Name is always shown', async () => {
        const company = dawarCustomers.columns.find((c) => c.key === 'company')
        const name = dawarCustomers.columns.find((c) => c.key === 'name')
        const hidden = await dawar.updateColumn(
          dawarCustomers.id,
          company?.id ?? '',
          { hidden: true },
          ctx('dawar', 1),
        )
        expect(hidden.columns.find((c) => c.key === 'company')?.hidden).toBe(true)
        const deleted = await refusal(
          dawar.deleteColumn(dawarCustomers.id, company?.id ?? '', ctx('dawar', 2)),
        )
        expect(deleted).toBeInstanceOf(SheetRuleError)
        const nameHidden = await refusal(
          dawar.updateColumn(dawarCustomers.id, name?.id ?? '', { hidden: true }, ctx('dawar', 3)),
        )
        expect((nameHidden as Error).message).toBe('The Name column is always shown')
      })

      it('a change that would orphan typed values is refused', async () => {
        await dawar.updateRow(rohan.id, { fields: { pain: 'Unplanned downtime' } }, ctx('dawar', 1))
        const pain = dawarCustomers.columns.find((c) => c.key === 'pain')
        const error = await refusal(
          dawar.updateColumn(
            dawarCustomers.id,
            pain?.id ?? '',
            { type: 'number' },
            ctx('dawar', 2),
          ),
        )
        expect((error as Error).message).toBe('1 row has a value that would not fit')
      })

      it('the owner reorders columns', async () => {
        const ids = dawarCustomers.columns
          .slice()
          .sort((a, b) => b.position - a.position)
          .map((c) => c.id)
        const sheet = await dawar.reorderColumns(dawarCustomers.id, ids, ctx('dawar', 1))
        const order = sheet.columns
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((c) => c.id)
        expect(order).toEqual(ids)
      })

      it('another member cannot change your columns', async () => {
        const company = dawarCustomers.columns.find((c) => c.key === 'company')?.id ?? ''
        await expectDenied(
          dhruv.addColumn(dawarCustomers.id, { label: 'X', type: 'text' }, ctx('dhruv')),
          'not-owner',
        )
        await expectDenied(
          dhruv.updateColumn(dawarCustomers.id, company, { hidden: true }, ctx('dhruv')),
          'not-owner',
        )
        await expectDenied(
          dhruv.reorderColumns(dawarCustomers.id, [company], ctx('dhruv')),
          'not-owner',
        )
      })
    })

    describe('tags', () => {
      let foundry: Tag

      beforeEach(async () => {
        foundry = await dawar.createTag({ name: '#foundry' }, ctx('dawar'))
        await dawar.updateRow(rohan.id, { tagIds: [foundry.id] }, ctx('dawar'))
      })

      it('one shared vocabulary: the same name, in any case, is the same tag', async () => {
        expect(foundry).toMatchObject({ name: 'foundry', createdBy: h.memberIds.dawar })
        expect(await dhruv.createTag({ name: 'Foundry' }, ctx('dhruv'))).toMatchObject({
          id: foundry.id,
        })
        expect((await asha.listTags()).map((t) => t.name)).toEqual(['foundry'])
      })

      it('only the creator renames or recolours, while nobody else uses it', async () => {
        await expectDenied(
          dhruv.updateTag(foundry.id, { name: 'forge' }, ctx('dhruv')),
          'not-tag-creator',
        )
        expect(
          await dawar.updateTag(foundry.id, { name: 'forging', colour: 'teal' }, ctx('dawar', 1)),
        ).toMatchObject({ name: 'forging', colour: 'teal' })

        await dhruv.updateRow(krithik.id, { tagIds: [foundry.id] }, ctx('dhruv', 2))
        const denied = await expectDenied(
          dawar.updateTag(foundry.id, { colour: 'pink' }, ctx('dawar', 3)),
          'tag-in-use',
        )
        expect(denied.message).toBe("This tag is used on Dhruv's rows")
        await expectDenied(dawar.deleteTag(foundry.id, ctx('dawar', 4)), 'tag-in-use')
      })

      it("deleting a tag takes it off the creator's rows", async () => {
        await dawar.deleteTag(foundry.id, ctx('dawar', 1))
        expect(await dhruv.listTags()).toEqual([])
        expect((await dawar.getRow(rohan.id))?.tagIds).toEqual([])
      })

      it('another member cannot tag your row', async () => {
        await expectDenied(dhruv.updateRow(rohan.id, { tagIds: [] }, ctx('dhruv')), 'not-owner')
      })
    })

    describe('members', () => {
      it('an admin adds a member, active and not an admin', async () => {
        const krithikMember = await dawar.createMember(
          { name: ' Krithik  Rao ', email: 'Krithik@Example.test' },
          ctx('dawar'),
        )
        expect(krithikMember).toMatchObject({
          name: 'Krithik Rao',
          email: 'krithik@example.test',
          slug: 'krithik-rao',
          isAdmin: false,
          active: true,
        })
        const twice = await refusal(
          dhruv.createMember({ name: 'K', email: 'KRITHIK@example.test' }, ctx('dhruv')),
        )
        expect(twice).toBeInstanceOf(MemberRuleError)
      })

      it('a regular member cannot add or change members', async () => {
        await expectDenied(
          asha.createMember({ name: 'X', email: 'x@example.test' }, ctx('asha')),
          'not-admin',
        )
        await expectDenied(
          asha.updateMember(h.memberIds.dawar, { active: false }, ctx('asha')),
          'not-admin',
        )
        expect(
          await asha.updateMember(h.memberIds.asha, { name: 'Asha R' }, ctx('asha')),
        ).toMatchObject({ name: 'Asha R' })
      })

      it('nobody changes their own admin or active status', async () => {
        await expectDenied(
          dawar.updateMember(h.memberIds.dawar, { active: false }, ctx('dawar')),
          'self',
        )
        await expectDenied(
          asha.updateMember(h.memberIds.asha, { isAdmin: true }, ctx('asha')),
          'self',
        )
      })

      it('admins deactivate and reactivate; a deactivated member changes nothing', async () => {
        const deactivated = await dhruv.updateMember(
          h.memberIds.asha,
          { active: false },
          ctx('dhruv'),
        )
        expect(deactivated.active).toBe(false)
        await expectDenied(
          gone.createSheet(h.memberIds.gone, { name: 'X', template: 'blank' }, ctx('gone')),
          'inactive',
        )
        await dhruv.updateMember(h.memberIds.asha, { active: true }, ctx('dhruv', 1))
        expect((await dawar.listMembers()).find((m) => m.id === h.memberIds.asha)?.active).toBe(
          true,
        )
      })

      it('someone who is not a member changes nothing', async () => {
        await expectDenied(
          h
            .asStranger()
            .createSheet(
              h.memberIds.dawar,
              { name: 'X', template: 'blank' },
              { actorId: h.strangerId, now: CONTRACT_NOW },
            ),
          'signed-out',
        )
      })
    })
  })
}
