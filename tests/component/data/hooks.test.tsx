import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  configure,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  queryKeys,
  SAVE_FAILED_MESSAGE,
  undoToastId,
  useCalendarEvents,
  useHistory,
  useMarkLost,
  useMembers,
  useMoveStage,
  useReopen,
  useRow,
  useRowCounts,
  useRowLocation,
  useRows,
  useSearch,
  useSetWarmth,
  useSheets,
  useTagMap,
  useTags,
} from '@/data/hooks'
import { UaCrmDb } from '@/data/local/db'
import { LocalRepository } from '@/data/local/LocalRepository'
import { istInstant, seedIds } from '@/data/local/seed'
import { RepositoryProvider, useRepository } from '@/data/RepositoryContext'
import type { MutationContext, MutationResult } from '@/data/repository'
import { snapshotStage } from '@/domain/stages'
import type { Id, Row, Sheet, Warmth } from '@/domain/types'
import { freezeClock, restoreClock } from '../ui/renderUi'

vi.mock('sonner', () => ({
  toast: Object.assign(
    vi.fn(() => 'toast'),
    { error: vi.fn(() => 'toast'), dismiss: vi.fn() },
  ),
}))

// IndexedDB round trips can be slow on a busy CI runner; the default 1 s is too tight.
configure({ asyncUtilTimeout: 5000 })

const toastMock = vi.mocked(toast)
const toastError = vi.mocked(toast.error)

const DAWAR = seedIds.members.dawar
const CUSTOMERS = seedIds.sheets.dawarCustomers

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** Holds mutations at a gate so the optimistic state can be observed, and can fail them. */
class GatedRepository extends LocalRepository {
  gate: Promise<void> = Promise.resolve()
  failNext = false

  private async pass(): Promise<void> {
    await this.gate
    if (this.failNext) {
      this.failNext = false
      throw new Error('IndexedDB is unavailable')
    }
  }

  override async updateStage(
    rowId: Id,
    stageIndex: number,
    ctx: MutationContext,
  ): Promise<MutationResult> {
    await this.pass()
    return super.updateStage(rowId, stageIndex, ctx)
  }

  override async updateWarmth(
    rowId: Id,
    warmth: Warmth | null,
    ctx: MutationContext,
    options?: { undo?: boolean },
  ): Promise<MutationResult> {
    await this.pass()
    return super.updateWarmth(rowId, warmth, ctx, options)
  }
}

class Boundary extends Component<{ children: ReactNode }, { message: string | null }> {
  override state = { message: null as string | null }
  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }
  override render() {
    return this.state.message ? <p>{this.state.message}</p> : this.props.children
  }
}

let dbCounter = 0
let repo: GatedRepository
let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <RepositoryProvider repository={repo}>{children}</RepositoryProvider>
    </QueryClientProvider>
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  // Mutations stamp today's IST date from the clock; freeze it at 5 Nov 2026, 10:00 IST so the
  // expectations do not depend on when the suite runs (only Date is faked).
  freezeClock()
  dbCounter += 1
  repo = new GatedRepository(new UaCrmDb(`ua-crm-hooks-${dbCounter}-${Date.now()}`))
  await repo.ensureSeeded()
  qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
      mutations: { retry: false },
    },
  })
})

afterEach(async () => {
  cleanup()
  qc.clear()
  repo.db.close()
  await repo.db.delete()
  restoreClock()
})

function lastToastAction(): { label: ReactNode; onClick: () => void } {
  const options = toastMock.mock.calls.at(-1)?.[1]
  const action = options?.action as { label: ReactNode; onClick: () => void } | undefined
  if (!action) throw new Error('No toast action')
  return action
}

async function customersSheet(): Promise<Sheet> {
  const sheet = await repo.getSheet(CUSTOMERS)
  if (!sheet) throw new Error('Missing sheet')
  return sheet
}

describe('RepositoryProvider', () => {
  it('renders the fallback while seeding, then the children', async () => {
    const gate = deferred()
    const slow = new LocalRepository(new UaCrmDb(`ua-crm-slow-${Date.now()}`))
    const ensure = slow.ensureSeeded.bind(slow)
    slow.ensureSeeded = async () => {
      await gate.promise
      await ensure()
    }
    render(
      <RepositoryProvider repository={slow} fallback={<p>Getting ready</p>}>
        <p>Ready</p>
      </RepositoryProvider>,
    )
    expect(screen.getByText('Getting ready')).toBeInTheDocument()
    gate.resolve()
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    expect(await slow.db.members.count()).toBe(2)
    cleanup()
    slow.db.close()
    await slow.db.delete()
  })

  it('surfaces a seeding failure to the error boundary', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = new LocalRepository(new UaCrmDb(`ua-crm-broken-${Date.now()}`))
    broken.ensureSeeded = () => Promise.reject(new Error('Storage is blocked'))
    render(
      <Boundary>
        <RepositoryProvider repository={broken}>
          <p>Ready</p>
        </RepositoryProvider>
      </Boundary>,
    )
    expect(await screen.findByText('Storage is blocked')).toBeInTheDocument()
    consoleError.mockRestore()
  })

  it('useRepository needs a provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useRepository())).toThrow(
      'useRepository must be used inside a RepositoryProvider.',
    )
    consoleError.mockRestore()
  })
})

describe('query hooks', () => {
  it('read members, sheets, counts, rows, tags, history and events', async () => {
    const range = {
      from: istInstant('2026-11-05', '00:00'),
      to: istInstant('2026-11-12', '00:00'),
    }
    const { result } = renderHook(
      () => ({
        members: useMembers(),
        sheets: useSheets(DAWAR),
        idleSheets: useSheets(undefined),
        counts: useRowCounts(DAWAR),
        rows: useRows(CUSTOMERS),
        row: useRow(seedIds.rows.rohanMehta),
        missing: useRow('r-missing'),
        location: useRowLocation(seedIds.arvindMenon.dhruv),
        tags: useTags(),
        tagMap: useTagMap(),
        history: useHistory(seedIds.rows.sunitaKulkarni),
        events: useCalendarEvents(DAWAR, range),
      }),
      { wrapper },
    )
    await waitFor(() => {
      const r = result.current
      const queries: { isSuccess: boolean }[] = r
        ? [r.members, r.sheets, r.counts, r.rows, r.row, r.missing, r.location, r.tags]
        : []
      if (r) queries.push(r.history, r.events)
      expect(queries.length > 0 && queries.every((q) => q.isSuccess)).toBe(true)
    })
    const r = result.current
    expect(r.members.data?.map((m) => m.name)).toEqual(['Dawar', 'Dhruv'])
    expect(r.sheets.data).toHaveLength(5)
    expect(r.idleSheets.fetchStatus).toBe('idle')
    expect(r.idleSheets.data).toBeUndefined()
    expect(r.counts.data?.[CUSTOMERS]).toBe(12)
    expect(r.rows.data).toHaveLength(12)
    expect(r.row.data?.name).toBe('Rohan Mehta')
    expect(r.missing.data).toBeUndefined()
    expect(r.location.data?.member.name).toBe('Dhruv')
    expect(r.tags.data).toHaveLength(8)
    await waitFor(() =>
      expect(result.current.tagMap.get(seedIds.tags.foundry)?.name).toBe('foundry'),
    )
    expect(r.history.data?.[0]?.kind).toBe('email')
    expect(r.events.data?.map((e) => e.id)).toEqual([
      'e-dawar-01',
      'e-dawar-02',
      'e-dawar-03',
      'e-dawar-04',
      'e-dawar-05',
    ])
  })

  it('searches only for a non-blank query', async () => {
    const { result, rerender } = renderHook(({ q }: { q: string }) => useSearch(q), {
      wrapper,
      initialProps: { q: '  ' },
    })
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()

    rerender({ q: 'menon' })
    await waitFor(() => expect(result.current.data?.length).toBeGreaterThanOrEqual(2))
    const names = result.current.data
      ?.slice(0, 2)
      .map((s) => s.row.name)
      .sort()
    expect(names).toEqual(['Arvind Menon', 'Cdr Arvind Menon'])

    rerender({ q: 'menon c' })
    // The previous results stay visible while the new query runs.
    expect(result.current.data?.length).toBeGreaterThanOrEqual(2)
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false))
    expect(result.current.data?.map((s) => s.row.name)).toContain('Cdr Arvind Menon')
  })
})

/**
 * Query results are tracked: a hook re-renders only for properties read during render. A real
 * component reads `data` while rendering, so the harness does too; otherwise a refetch that
 * changes only `data` would leave `result.current` stale.
 */
function readInRender(...queries: { data: unknown }[]): void {
  for (const q of queries) q.data
}

function useStageHarness(rowId: Id) {
  const rows = useRows(CUSTOMERS)
  const row = useRow(rowId)
  const history = useHistory(rowId)
  readInRender(rows, row, history)
  return {
    rows,
    row,
    history,
    move: useMoveStage(),
    lost: useMarkLost(),
    reopen: useReopen(),
    warmth: useSetWarmth(),
  }
}

async function renderHarness(rowId: Id) {
  const view = renderHook(() => useStageHarness(rowId), { wrapper })
  await waitFor(() => {
    const r = view.result.current
    expect(r?.rows.isSuccess && r.row.isSuccess && r.history.isSuccess).toBe(true)
  })
  return view
}

function rowIn(rows: Row[] | undefined, id: Id): Row | undefined {
  return rows?.find((r) => r.id === id)
}

describe('mutation hooks', () => {
  it('moves a stage optimistically before the repository resolves', async () => {
    const id = seedIds.rows.rohanMehta
    const { result } = await renderHarness(id)
    const sheet = await customersSheet()
    const before = result.current.row.data as Row
    const gate = deferred()
    repo.gate = gate.promise

    act(() => result.current.move.mutate({ row: before, sheet, stageIndex: 4, actorId: DAWAR }))

    await waitFor(() => expect(rowIn(result.current.rows.data, id)?.stageIndex).toBe(4))
    expect(result.current.row.data?.stageIndex).toBe(4)
    expect(result.current.row.data?.stageDates[sheet.stages[4]?.id ?? '']).toBe('2026-11-05')
    expect(result.current.history.data?.[0]?.text).toBe('Stage: First call → Pilot scoped')
    // Nothing is written yet.
    expect((await repo.db.rows.get(id))?.stageIndex).toBe(2)
    expect(toastMock).not.toHaveBeenCalled()

    gate.resolve()
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true))
    expect((await repo.getRow(id))?.stageIndex).toBe(4)
    expect(toastMock).toHaveBeenCalledWith(
      'Moved to Pilot scoped',
      expect.objectContaining({
        id: undoToastId('stage', id),
        duration: 8000,
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    )
    await waitFor(() => expect(result.current.history.data?.[0]?.id).not.toMatch(/^optimistic-/))
  })

  it('undo restores the stage and logs it in history', async () => {
    const id = seedIds.rows.rohanMehta
    const { result } = await renderHarness(id)
    const sheet = await customersSheet()
    const before = result.current.row.data as Row

    act(() => result.current.move.mutate({ row: before, sheet, stageIndex: 1, actorId: DAWAR }))
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true))
    expect((await repo.getRow(id))?.stageIndex).toBe(1)

    act(() => lastToastAction().onClick())
    await waitFor(() => expect(rowIn(result.current.rows.data, id)?.stageIndex).toBe(2))
    const stored = await repo.getRow(id)
    expect(snapshotStage(stored as Row)).toEqual(snapshotStage(before))
    const history = await repo.listHistory(id)
    expect(history[0]?.meta?.undo).toBe(true)
    expect(history[0]?.text).toBe('Stage restored to First call')
    await waitFor(() => expect(result.current.history.data?.[0]?.meta?.undo).toBe(true))
  })

  it('marks lost and reopens with undo toasts', async () => {
    const id = seedIds.rows.rohanMehta
    const { result } = await renderHarness(id)
    const sheet = await customersSheet()

    act(() =>
      result.current.lost.mutate({ row: result.current.row.data as Row, sheet, actorId: DAWAR }),
    )
    await waitFor(() => expect(result.current.lost.isSuccess).toBe(true))
    expect(toastMock).toHaveBeenLastCalledWith(
      'Marked lost',
      expect.objectContaining({ id: undoToastId('stage', id) }),
    )
    await waitFor(() => expect(result.current.row.data?.lost?.date).toBe('2026-11-05'))

    act(() =>
      result.current.reopen.mutate({ row: result.current.row.data as Row, sheet, actorId: DAWAR }),
    )
    await waitFor(() => expect(result.current.reopen.isSuccess).toBe(true))
    expect(toastMock).toHaveBeenLastCalledWith('Reopened', expect.anything())
    await waitFor(() => expect(result.current.row.data?.lost).toBeNull())

    // Undo the reopen: lost again, exactly as before.
    act(() => lastToastAction().onClick())
    await waitFor(() => expect(result.current.row.data?.lost?.stageIndex).toBe(2))
  })

  it('rolls back and reports when the save fails', async () => {
    const id = seedIds.rows.sunitaKulkarni
    const { result } = await renderHarness(id)
    const before = result.current.row.data as Row
    const historyBefore = result.current.history.data
    const gate = deferred()
    repo.gate = gate.promise
    repo.failNext = true

    act(() => result.current.warmth.mutate({ row: before, warmth: 'cold', actorId: DAWAR }))
    await waitFor(() => expect(rowIn(result.current.rows.data, id)?.warmth).toBe('cold'))
    expect(result.current.history.data?.[0]?.text).toBe('Warmth: Waiting → Cold')

    gate.resolve()
    await waitFor(() => expect(result.current.warmth.isError).toBe(true))
    await waitFor(() => expect(rowIn(result.current.rows.data, id)?.warmth).toBe('waiting'))
    expect(result.current.row.data?.warmth).toBe('waiting')
    expect(result.current.history.data).toEqual(historyBefore)
    expect(toastError).toHaveBeenCalledWith(SAVE_FAILED_MESSAGE, {
      id: undoToastId('warmth', id),
    })
    expect(toastMock).not.toHaveBeenCalled()
    expect((await repo.getRow(id))?.warmth).toBe('waiting')
    expect(await repo.listHistory(id)).toHaveLength(historyBefore?.length ?? 0)
  })

  it('sets warmth, clears it and undoes with history', async () => {
    const id = seedIds.rows.sunitaKulkarni
    const { result } = await renderHarness(id)

    act(() =>
      result.current.warmth.mutate({
        row: result.current.row.data as Row,
        warmth: 'cold',
        actorId: DAWAR,
      }),
    )
    await waitFor(() => expect(result.current.warmth.isSuccess).toBe(true))
    expect(toastMock).toHaveBeenLastCalledWith(
      'Warmth set to Cold',
      expect.objectContaining({ id: undoToastId('warmth', id), duration: 8000 }),
    )

    act(() => lastToastAction().onClick())
    await waitFor(() => expect(rowIn(result.current.rows.data, id)?.warmth).toBe('waiting'))
    const history = await repo.listHistory(id)
    expect(history[0]?.meta).toMatchObject({ undo: true, toWarmth: 'waiting' })

    await waitFor(() => expect(result.current.row.data?.warmth).toBe('waiting'))
    act(() =>
      result.current.warmth.mutate({
        row: result.current.row.data as Row,
        warmth: null,
        actorId: DAWAR,
      }),
    )
    await waitFor(() =>
      expect(toastMock).toHaveBeenLastCalledWith('Warmth cleared', expect.anything()),
    )
    await waitFor(() => expect(result.current.row.data?.warmth).toBeNull())
  })

  it('invalidates search results after a change', async () => {
    const id = seedIds.rows.rohanMehta
    const { result } = renderHook(
      () => {
        const search = useSearch('rohan mehta')
        const row = useRow(id)
        readInRender(search, row)
        return { search, row, warmth: useSetWarmth() }
      },
      { wrapper },
    )
    await waitFor(() => expect(result.current?.search.data?.[0]?.row.warmth).toBe('warm'))
    await waitFor(() => expect(result.current.row.isSuccess).toBe(true))
    act(() =>
      result.current.warmth.mutate({
        row: result.current.row.data as Row,
        warmth: 'waiting',
        actorId: DAWAR,
      }),
    )
    await waitFor(() => expect(result.current.search.data?.[0]?.row.warmth).toBe('waiting'))
    expect(qc.getQueryData(queryKeys.row(id))).toMatchObject({ warmth: 'waiting' })
  })
})
