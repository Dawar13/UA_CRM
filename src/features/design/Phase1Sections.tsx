/**
 * Phase 1 surfaces on /design: a folder front as another member sees it (view only), the history
 * timeline with every kind of touch, and the duplicate-check choices. Sample data comes from the
 * seed, so the specimens match what the app shows.
 */
import { useMemo, useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { buildSeed, istInstant, seedIds } from '@/data/local/seed'
import type { DuplicateCandidate } from '@/data/repository'
import type { HistoryEntry, Member, Row, Sheet } from '@/domain/types'
import { type DuplicateChoice, DuplicateChoices } from '@/features/quick-add/DuplicateChoices'
import { HistoryList } from '@/features/row-detail/HistoryList'
import { SheetSummary } from '@/features/sheet-summary/SheetSummary'
import { Section, Specimen } from './layout'

interface Sample {
  dawar: Member
  dhruv: Member
  members: ReadonlyMap<string, Member>
  dhruvCustomers: Sheet
  dhruvCustomerRows: Row[]
  dawarCustomers: Sheet
  rohan: Row
}

function useSample(): Sample {
  return useMemo(() => {
    const seed = buildSeed()
    const member = (id: string) => seed.members.find((m) => m.id === id) as Member
    const sheet = (id: string) => seed.sheets.find((s) => s.id === id) as Sheet
    const dhruvCustomers = sheet(seedIds.sheets.dhruvCustomers)
    return {
      dawar: member(seedIds.members.dawar),
      dhruv: member(seedIds.members.dhruv),
      members: new Map(seed.members.map((m) => [m.id, m])),
      dhruvCustomers,
      dhruvCustomerRows: seed.rows.filter((r) => r.sheetId === dhruvCustomers.id && !r.deletedAt),
      dawarCustomers: sheet(seedIds.sheets.dawarCustomers),
      rohan: seed.rows.find((r) => r.id === seedIds.rows.rohanMehta) as Row,
    }
  }, [])
}

export function ViewOnlySection() {
  const sample = useSample()
  const [open, setOpen] = useState(true)
  return (
    <Section
      id="view-only"
      title="View only"
      caption="Another member's folder front: the same figures and pipeline, a quiet note in place of the owner line, and no editing controls (CLAUDE.md §2.14)."
    >
      <Specimen title="Dhruv's Customers, seen by Dawar" bodyClassName="p-0">
        <SheetSummary
          member={sample.dhruv}
          sheet={sample.dhruvCustomers}
          rows={sample.dhruvCustomerRows}
          index={0}
          open={open}
          onOpenChange={setOpen}
          viewOnly
        />
      </Specimen>
    </Section>
  )
}

function entry(
  id: string,
  kind: HistoryEntry['kind'],
  date: string,
  time: string,
  text: string,
  memberId: string,
  extra: Partial<HistoryEntry> = {},
): HistoryEntry {
  return {
    id: `design-h-${id}`,
    rowId: seedIds.rows.rohanMehta,
    kind,
    source: kind === 'stage' || kind === 'warmth' || kind === 'created' ? 'system' : 'manual',
    at: istInstant(date, time),
    fuzzyDate: null,
    text,
    memberId,
    ...extra,
  }
}

export function HistorySection() {
  const { members, dawar } = useSample()
  const entries = useMemo<HistoryEntry[]>(
    () => [
      entry(
        'call',
        'call',
        '2026-11-05',
        '16:10',
        'Wants a pilot on line 3, quote by 15 Nov',
        dawar.id,
      ),
      entry('stage', 'stage', '2026-11-05', '16:12', 'Moved to Pilot scoped', dawar.id, {
        meta: { fromStageIndex: 3, toStageIndex: 4 },
      }),
      entry('missed', 'meeting', '2026-11-04', '16:00', 'Call with Rohan Mehta', dawar.id, {
        source: 'calendar',
        meta: { calendarEventId: 'design-missed', missed: true },
      }),
      entry('whatsapp', 'whatsapp', '2026-11-04', '11:30', 'Sent the ROI note', dawar.id),
      entry('meeting', 'meeting', '2026-11-03', '10:00', 'Plant visit, Hosur', dawar.id, {
        source: 'calendar',
        meta: { calendarEventId: 'design-held', missed: false },
      }),
      entry('warmth', 'warmth', '2026-11-03', '10:05', 'Warmth set to Warm', dawar.id, {
        meta: { fromWarmth: 'waiting', toWarmth: 'warm' },
      }),
      entry('email', 'email', '2026-10-30', '09:15', 'Shared the downtime case study', dawar.id),
      entry('note', 'note', '2026-10-28', '18:40', 'Unplanned downtime is his KPI', dawar.id),
      entry('imported', 'imported', '2026-10-15', '00:00', 'From the old spreadsheet', dawar.id, {
        fuzzyDate: { date: '2026-10-15', precision: 'mid-month' },
      }),
      entry('created', 'created', '2026-10-15', '00:01', 'Added', dawar.id),
    ],
    [dawar.id],
  )
  return (
    <Section
      id="history"
      title="History"
      caption="Every kind of touch, newest first. Touches you logged by hand can be edited or deleted: hover or focus one. Stage, warmth and created entries are written by the app and cannot. A meeting the calendar logged can be marked missed (ochre, not a touch) or held again."
    >
      <Specimen title="Rohan Mehta" bodyClassName="px-5 py-1">
        <HistoryList
          entries={entries}
          members={members}
          onEdit={() => toast('Edit opens in place, in the expanded row')}
          onDelete={() => toast('Deleted, with Undo for 8 seconds')}
          onMarkMeeting={(_entry, outcome) => toast(`Marked ${outcome}, with Undo for 8 seconds`)}
        />
      </Specimen>
    </Section>
  )
}

export function DuplicatesSection() {
  const sample = useSample()
  const [choices, setChoices] = useState<Record<string, DuplicateChoice>>({})
  const candidates: { key: string; title: string; candidate: DuplicateCandidate }[] = [
    {
      key: 'hard-mine',
      title: 'Hard match, in your tab: blocks saving until you choose',
      candidate: {
        location: { row: sample.rohan, sheet: sample.dawarCustomers, member: sample.dawar },
        level: 'hard',
        reason: 'phone',
      },
    },
    {
      key: 'soft-theirs',
      title: "Soft match, in another member's tab: a note, never Merge",
      candidate: {
        location: { row: sample.rohan, sheet: sample.dhruvCustomers, member: sample.dhruv },
        level: 'soft',
        reason: 'name',
      },
    },
  ]
  return (
    <Section
      id="duplicates"
      title="Duplicate check"
      caption="Shown in the quick-add preview, on paste and on import, across every member's sheets (CLAUDE.md §2.7)."
    >
      {candidates.map(({ key, title, candidate }) => (
        <Specimen key={key} title={title}>
          <DuplicateChoices
            candidate={candidate}
            actorId={sample.dawar.id}
            choice={choices[key]}
            onChoose={(choice) => setChoices((all) => ({ ...all, [key]: choice }))}
          />
        </Specimen>
      ))}
    </Section>
  )
}
