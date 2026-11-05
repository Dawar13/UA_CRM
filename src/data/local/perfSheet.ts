/**
 * A deterministic 2,000-row Customers sheet for the performance smoke test and the developer
 * menu. Invented names only. A fixed-seed PRNG keeps every run identical.
 */
import { customerArchetypes, templates, turnoverBands } from '@/domain/templates'
import type {
  FuzzyDate,
  HistoryEntry,
  Id,
  IsoDate,
  Member,
  Row,
  Sheet,
  Warmth,
} from '@/domain/types'
import { buildSheet, istInstant, seedIds } from './seed'

export const PERF_SHEET_SLUG = 'customers-2000'
export const PERF_SHEET_NAME = 'Customers (2,000)'
export const PERF_ROW_COUNT = 2000

export function perfSheetId(member: Pick<Member, 'slug'>): Id {
  return `s-${member.slug}-${PERF_SHEET_SLUG}`
}

/** mulberry32: small, fast, deterministic. */
function createRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)]
  if (item === undefined) throw new Error('pick() needs a non-empty list')
  return item
}

function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const FIRST_NAMES = [
  'Aarav',
  'Aditya',
  'Akash',
  'Amit',
  'Anand',
  'Ankit',
  'Ashok',
  'Bhavna',
  'Chetan',
  'Deepa',
  'Dinesh',
  'Gita',
  'Harsh',
  'Isha',
  'Jatin',
  'Jyoti',
  'Kamal',
  'Kunal',
  'Leela',
  'Madhav',
  'Manoj',
  'Nandini',
  'Nitin',
  'Pallavi',
  'Pankaj',
  'Pradeep',
  'Rachna',
  'Rakesh',
  'Ravi',
  'Sachin',
  'Sameer',
  'Sangeeta',
  'Shreya',
  'Sunil',
  'Swati',
  'Tanvi',
  'Uday',
  'Varun',
  'Yamini',
  'Zubin',
] as const

const LAST_NAMES = [
  'Acharya',
  'Ahuja',
  'Bhatt',
  'Chauhan',
  'Chopra',
  'Dalal',
  'Dutta',
  'Gadgil',
  'Ghosh',
  'Goyal',
  'Hegde',
  'Jain',
  'Kamath',
  'Kaul',
  'Khatri',
  'Kohli',
  'Kulkarni',
  'Lal',
  'Mahajan',
  'Mathur',
  'Mishra',
  'Modi',
  'Naidu',
  'Narang',
  'Oberoi',
  'Pandey',
  'Parekh',
  'Patil',
  'Prasad',
  'Puri',
  'Rana',
  'Rathore',
  'Sabharwal',
  'Sahni',
  'Sengupta',
  'Sethi',
  'Shetty',
  'Sinha',
  'Sood',
  'Talwar',
  'Thakur',
  'Tiwari',
  'Trivedi',
  'Upadhyay',
  'Vaidya',
  'Varma',
  'Wadhwa',
  'Yadav',
  'Zaveri',
  'Bedi',
] as const

const PLACES = [
  'Hosur',
  'Pune',
  'Chakan',
  'Rajkot',
  'Vapi',
  'Coimbatore',
  'Ludhiana',
  'Nashik',
  'Aurangabad',
  'Jamshedpur',
  'Belagavi',
  'Ankleshwar',
  'Baddi',
  'Sanand',
  'Manesar',
  'Peenya',
  'Ambattur',
  'Faridabad',
  'Bhiwadi',
  'Kolhapur',
] as const

const COMPANY_KINDS = [
  'Forgings',
  'Castings',
  'Precision Works',
  'Auto Components',
  'Polymers',
  'Electronics',
  'Chemicals',
  'Steel Processors',
  'Appliances',
  'Coatings',
  'Pharma',
  'Foods',
  'Engineering',
  'Fasteners',
  'Gears',
] as const

const TITLES = [
  'Plant Head',
  'Operations Director',
  'Maintenance Manager',
  'Quality Head',
  'Managing Director',
  'Production Manager',
  'Purchase Head',
  'VP Manufacturing',
] as const

const NEXT_ACTIONS = [
  'Send ROI note',
  'Follow up on the intro',
  'Plan the plant visit',
  'Share pilot results',
  'Confirm pilot scope',
  'Send case study',
  'Book a demo',
  'Check budget timing',
] as const

const PAINS = [
  'Unplanned downtime',
  'Scrap and rework',
  'Slow changeovers',
  'Paper batch records',
  'Energy cost per unit',
  'Quote turnaround',
] as const

const WARMTHS: readonly (Warmth | null)[] = ['warm', 'waiting', 'cold', null]
const ROLES = templates.customers.extraColumns.find((c) => c.key === 'roleInDeal')?.options ?? []
const WEDGES = templates.customers.extraColumns.find((c) => c.key === 'wedgeAgent')?.options ?? []
const TAG_IDS: readonly Id[] = Object.values(seedIds.tags)

function nextDate(random: () => number): FuzzyDate | null {
  const r = random()
  if (r < 0.3) return null
  if (r < 0.45) return { date: '2026-11-15', precision: 'mid-month' }
  if (r < 0.55) return { date: '2026-11-25', precision: 'late-month' }
  if (r < 0.6) return { date: '2026-12-05', precision: 'early-month' }
  return { date: addDays('2026-11-01', Math.floor(random() * 40)), precision: 'day' }
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Rows for a Customers-template sheet. Every row validates against `rowSchema` and the sheet's
 * custom columns. Names are unique for up to 2,000 rows.
 */
export function generateRows(
  sheet: Sheet,
  count: number,
  options: { idPrefix?: string; seed?: number } = {},
): { rows: Row[]; history: HistoryEntry[] } {
  const random = createRandom(options.seed ?? 20261105)
  const idPrefix = options.idPrefix ?? `r-${sheet.id.replace(/^s-/, '')}`
  const owner = sheet.memberId
  const rows: Row[] = []
  const history: HistoryEntry[] = []

  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length] ?? 'Asha'
    const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length] ?? 'Rao'
    const place = pick(PLACES, random)
    const company = `${place} ${pick(COMPANY_KINDS, random)}`
    const id = `${idPrefix}-${String(i + 1).padStart(4, '0')}`

    const stageCount = sheet.stages.length
    const stageIndex = stageCount > 0 ? Math.floor(random() * stageCount) : null
    const createdOn = addDays('2026-10-01', Math.floor(random() * 5))
    const stageDates: Record<string, IsoDate | null> = {}
    if (stageIndex !== null) {
      for (let s = 0; s <= stageIndex; s++) {
        const stage = sheet.stages[s]
        if (stage) stageDates[stage.id] = addDays(createdOn, s * 5)
      }
    }
    const lost =
      stageIndex !== null && stageIndex < stageCount - 1 && i % 23 === 7
        ? { stageIndex, date: '2026-11-02' }
        : null

    const entries: HistoryEntry[] = [
      {
        id: `h-${id.slice(2)}-01`,
        rowId: id,
        kind: 'created',
        source: 'system',
        at: istInstant(createdOn, '09:30'),
        fuzzyDate: null,
        text: `Added to ${sheet.name}`,
        memberId: owner,
      },
    ]
    if (stageIndex !== null && stageIndex > 0) {
      const date = addDays(createdOn, stageIndex * 5)
      entries.push({
        id: `h-${id.slice(2)}-02`,
        rowId: id,
        kind: 'stage',
        source: 'system',
        at: istInstant(date, '17:30'),
        fuzzyDate: null,
        text: `Stage: ${sheet.stages[stageIndex - 1]?.name} → ${sheet.stages[stageIndex]?.name}`,
        memberId: owner,
        meta: { fromStageIndex: stageIndex - 1, toStageIndex: stageIndex },
      })
    }
    const lastAt = entries[entries.length - 1]?.at ?? entries[0]?.at ?? null
    const createdAt = entries[0]?.at ?? istInstant(createdOn, '09:30')
    history.push(...entries)

    const tagCount = Math.floor(random() * 3)
    const tagIds = [...new Set(Array.from({ length: tagCount }, () => pick(TAG_IDS, random)))]
    const date = nextDate(random)

    rows.push({
      id,
      sheetId: sheet.id,
      memberId: owner,
      position: i,
      name: `${first} ${last}`,
      company,
      title: pick(TITLES, random),
      phone: `+9197${String(10_000_000 + i * 37).padStart(8, '0')}`,
      email: `${slug(first)}.${slug(last)}@${slug(company)}.example`,
      linkedin: '',
      links: [],
      warmth: pick(WARMTHS, random),
      stageIndex,
      stageDates,
      lost,
      tagIds,
      nextAction: date ? { text: pick(NEXT_ACTIONS, random), date } : null,
      introducedBy: null,
      connectsTo: [],
      notes: '',
      files: [],
      fields: {
        plantLocation: place,
        archetype: customerArchetypes[i % customerArchetypes.length],
        turnoverBand: pick(turnoverBands, random),
        roleInDeal: pick(ROLES, random),
        pain: pick(PAINS, random),
        wedgeAgent: pick(WEDGES, random),
        // Rupees: ₹5 L to ₹99 L a year, in whole lakhs.
        ticketEstimate: (5 + Math.floor(random() * 95)) * 100_000,
      },
      lastTouchAt: lastAt,
      createdAt,
      updatedAt: lastAt ?? createdAt,
      createdBy: owner,
      updatedBy: owner,
      deletedAt: null,
    })
  }
  return { rows, history }
}

/** The "Customers (2,000)" sheet for `member` at `position`, with its rows and history. */
export function buildPerfSheet(
  member: Pick<Member, 'id' | 'slug'>,
  position: number,
  count: number = PERF_ROW_COUNT,
): { sheet: Sheet; rows: Row[]; history: HistoryEntry[] } {
  const sheet = buildSheet({
    id: perfSheetId(member),
    memberId: member.id,
    slug: PERF_SHEET_SLUG,
    name: PERF_SHEET_NAME,
    template: 'customers',
    position,
  })
  return { sheet, ...generateRows(sheet, count) }
}
