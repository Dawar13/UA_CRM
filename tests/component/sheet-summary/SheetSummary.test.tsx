import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSummaryOpen, SUMMARY_OPEN_KEY, useUiStore } from '@/app/uiStore'
import { buildSeed, seedIds } from '@/data/local/seed'
import type { Member, Row, Sheet } from '@/domain/types'
import { SheetSummary } from '@/features/sheet-summary/SheetSummary'
import { freezeClock, renderUi, restoreClock } from '../ui/renderUi'

const seed = buildSeed()

function sheetOf(id: string): Sheet {
  const sheet = seed.sheets.find((s) => s.id === id)
  if (!sheet) throw new Error(`No sheet ${id}`)
  return sheet
}

function rowsOf(sheetId: string): Row[] {
  return seed.rows.filter((r) => r.sheetId === sheetId)
}

const dawar = seed.members.find((m) => m.id === seedIds.members.dawar) as Member
const customers = sheetOf(seedIds.sheets.dawarCustomers)
const investors = sheetOf(seedIds.sheets.dawarInvestors)
const connectors = sheetOf(seedIds.sheets.dawarConnectors)
const dhruvCustomers = sheetOf(seedIds.sheets.dhruvCustomers)

/** The summary wired to the real UI store, as MainView does. */
function Connected({ sheet, index = 0 }: { sheet: Sheet; index?: number }) {
  const open = useUiStore((s) => s.summaryOpen)
  const setOpen = useUiStore((s) => s.setSummaryOpen)
  return (
    <SheetSummary
      member={dawar}
      sheet={sheet}
      rows={rowsOf(sheet.id)}
      index={index}
      open={open}
      onOpenChange={setOpen}
    />
  )
}

function figure(name: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-figure="${name}"]`)
  if (!el) throw new Error(`No figure ${name}`)
  return el
}

beforeEach(() => {
  freezeClock()
  useUiStore.setState({ summaryOpen: true })
  // jsdom has no layout: give the capsule a real width to draw into.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(700)
})

afterEach(() => {
  restoreClock()
  vi.restoreAllMocks()
})

describe('SheetSummary', () => {
  it('shows the four figures for the sample Customers sheet', () => {
    renderUi(<Connected sheet={customers} />)
    const summary = screen.getByRole('region', { name: 'Customers summary' })
    expect(within(summary).getByRole('heading', { level: 2 })).toHaveTextContent('01 — Customers')
    expect(within(summary).getByText('Owned by Dawar · 7 stages')).toBeInTheDocument()

    expect(figure('people')).toHaveTextContent('People12')
    expect(figure('people')).toHaveTextContent('4 warm · 3 waiting · 3 cold')
    expect(figure('pipeline')).toHaveTextContent('Open pipeline₹2.2 Cr')
    expect(figure('pipeline')).toHaveTextContent('Ticket estimate · 9 open')
    expect(figure('won')).toHaveTextContent('Won₹30 L1 won · 2 lost')
    expect(figure('due')).toHaveTextContent('Due21 overdue · 1 today')
  })

  it('uses the smaller size for values longer than seven characters', () => {
    renderUi(<Connected sheet={investors} index={1} />)
    const value = (key: string) => figure(key).querySelector('dd') as HTMLElement
    expect(value('people')).toHaveTextContent('6')
    expect(value('people')).toHaveClass('text-[40px]')
    expect(value('pipeline')).toHaveTextContent('₹11.9 Cr')
    expect(value('pipeline')).toHaveClass('text-[27px]')
  })

  it('folds to one line and back, and remembers it', async () => {
    const { user } = renderUi(<Connected sheet={customers} />)
    const collapse = screen.getByRole('button', { name: 'Collapse the sheet summary' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await user.click(collapse)

    const summary = screen.getByRole('region', { name: 'Customers summary' })
    expect(summary).toHaveAttribute('data-state', 'closed')
    expect(within(summary).queryByTestId('pipeline-card')).not.toBeInTheDocument()
    expect(figure('people')).toHaveTextContent('12 people')
    expect(figure('pipeline')).toHaveTextContent('₹2.2 Cr open pipeline')
    expect(figure('won')).toHaveTextContent('₹30 L won')
    expect(document.querySelector('[data-figure="due"]')).toBeNull()
    expect(window.localStorage.getItem(SUMMARY_OPEN_KEY)).toBe('false')
    expect(readSummaryOpen()).toBe(false)

    const expand = screen.getByRole('button', { name: 'Expand the sheet summary' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expand.focus()
    await user.keyboard('{Enter}')
    expect(summary).toHaveAttribute('data-state', 'open')
    expect(screen.getByTestId('pipeline-card')).toBeInTheDocument()
    expect(window.localStorage.getItem(SUMMARY_OPEN_KEY)).toBe('true')
  })

  it('starts open on tall screens and folded on short ones until the member chooses', () => {
    const screenIs = (tall: boolean) =>
      vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) =>
          ({
            matches: tall,
            media: query,
            addEventListener() {},
            removeEventListener() {},
          }) as unknown as MediaQueryList,
      )
    screenIs(true)
    expect(readSummaryOpen()).toBe(true)
    screenIs(false)
    expect(readSummaryOpen()).toBe(false)
    // A saved choice wins over the screen height.
    localStorage.setItem(SUMMARY_OPEN_KEY, 'true')
    expect(readSummaryOpen()).toBe(true)
    localStorage.setItem(SUMMARY_OPEN_KEY, 'false')
    screenIs(true)
    expect(readSummaryOpen()).toBe(false)
    localStorage.removeItem(SUMMARY_OPEN_KEY)
  })

  it('falls back to the screen height when storage is unavailable', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    )
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readSummaryOpen()).toBe(true)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => useUiStore.getState().setSummaryOpen(false)).not.toThrow()
    expect(useUiStore.getState().summaryOpen).toBe(false)
  })

  it('takes the folder colour of its position', () => {
    const { unmount } = renderUi(<Connected sheet={customers} index={3} />)
    expect(screen.getByTestId('sheet-summary')).toHaveAttribute('data-folder', '4')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('04 — Customers')
    unmount()
    renderUi(<Connected sheet={customers} index={5} />)
    expect(screen.getByTestId('sheet-summary')).toHaveAttribute('data-folder', '1')
  })
})

describe('PipelineCard with stages', () => {
  it('draws one band per stage, with conversion between stages', () => {
    renderUi(<Connected sheet={customers} />)
    const capsule = screen.getByTestId('pipeline-capsule')
    expect(capsule).toHaveAttribute('aria-hidden', 'true')
    const bands = capsule.querySelectorAll('[data-stage-band]')
    expect(bands).toHaveLength(7)
    expect((bands[0] as SVGElement).style.fill).toBe('var(--capsule1)')
    expect((bands[3] as SVGElement).style.fill).toBe('var(--capsule5)')
    expect((bands[6] as SVGElement).style.fill).toBe('var(--capsule8)')
    expect(screen.getAllByTestId('conversion-pill').map((p) => p.textContent)).toEqual([
      '83%',
      '80%',
      '75%',
      '50%',
      '67%',
      '50%',
    ])
  })

  it('stops the band at the last stage anyone reached', () => {
    renderUi(<Connected sheet={dhruvCustomers} />)
    const bands = screen.getByTestId('pipeline-capsule').querySelectorAll('[data-stage-band]')
    // Dhruv's customers reach Plant visit (stage 4 of 7) and no further.
    expect(Array.from(bands, (b) => b.getAttribute('data-stage-band'))).toEqual([
      '0',
      '1',
      '2',
      '3',
    ])
    expect(screen.getAllByTestId('conversion-pill').map((p) => p.textContent)).toEqual([
      '60%',
      '67%',
      '50%',
    ])
  })

  it('shows who is at each stage now as warmth squares, and the lost as dots', () => {
    renderUi(<Connected sheet={customers} />)
    const firstCall = document.querySelector('[data-stage-people="2"]') as HTMLElement
    const rohan = within(firstCall).getByTitle('Rohan Mehta · last touch 29 Oct')
    expect(rohan.style.backgroundColor).toBe('var(--warm-shade3)')
    const intro = document.querySelector('[data-stage-people="1"]') as HTMLElement
    // Meera Desai: waiting, last touched more than two weeks ago, so the lightest shade.
    expect(within(intro).getByTitle('Meera Desai · last touch 12 Oct').style.backgroundColor).toBe(
      'var(--waiting-shade1)',
    )
    const identified = document.querySelector('[data-stage-people="0"]') as HTMLElement
    // No warmth: the sand square.
    expect(within(identified).getByTitle('Hitesh Patel · last touch 20 Oct')).toHaveClass(
      'bg-sand-cell',
    )
    expect(within(screen.getByTestId('lost-people')).getAllByTitle(/·/)).toHaveLength(2)
  })

  it('gives screen readers the pipeline as text', () => {
    renderUi(<Connected sheet={customers} />)
    const list = screen.getByRole('list', { name: 'Pipeline by stage' })
    const items = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toEqual([
      'Identified: 12 reached, 2 at this stage now',
      'Intro asked: 10 reached, 2 at this stage now',
      'First call: 8 reached, 1 at this stage now',
      'Plant visit: 6 reached, 2 at this stage now',
      'Pilot scoped: 3 reached, 1 at this stage now',
      'Pilot live: 2 reached, 1 at this stage now',
      'Paid: 1 reached, 1 at this stage now',
      'Lost: 2',
    ])
    expect(screen.getByText('Paid')).toHaveClass('text-won-fg')
  })

  it('draws nothing when no one is in the pipeline yet', () => {
    renderUi(
      <SheetSummary
        member={dawar}
        sheet={customers}
        rows={[]}
        index={0}
        open
        onOpenChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pipeline-capsule')).toBeEmptyDOMElement()
    expect(screen.queryAllByTestId('conversion-pill')).toHaveLength(0)
    expect(figure('people')).toHaveTextContent('No warmth set yet')
    expect(figure('due')).toHaveTextContent('Nothing due')
  })
})

describe('PipelineCard without stages', () => {
  it('groups people by the first dropdown column', () => {
    renderUi(<Connected sheet={connectors} index={3} />)
    expect(screen.getByText('Owned by Dawar · no stages')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('By relationship')
    expect(screen.queryByTestId('pipeline-capsule')).not.toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'People by group' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toEqual([
      'Friend: 1 person',
      'Alumni: 2 people',
      'Family: 1 person',
      'Professional: 2 people',
    ])
    expect(figure('next')).toHaveTextContent('Next actions33 without one')
    expect(figure('week')).toHaveTextContent('This week1touched in the last 7 days')
  })

  it('groups by warmth when the sheet has no dropdown column', () => {
    const blank: Sheet = {
      ...connectors,
      columns: connectors.columns.filter((c) => c.system),
    }
    renderUi(<Connected sheet={blank} />)
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('By warmth')
    const items = within(screen.getByRole('list', { name: 'People by group' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toEqual([
      'Warm: 4 people',
      'Waiting: 1 person',
      'Cold: 0 people',
      'Not set: 1 person',
    ])
  })
})
