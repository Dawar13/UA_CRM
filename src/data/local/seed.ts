/**
 * Deterministic sample data for Phase 0. Invented people and companies only (every email uses an
 * `.example` domain). No randomness and no clock: the same seed is produced on every launch.
 *
 * Reference "today" is Thu 5 Nov 2026 (IST). History runs from 1 Oct to 5 Nov 2026, never later
 * than 09:45 IST on 5 Nov, so it is all in the past when tests freeze the clock at 10:00 IST.
 */

import { pickTagColour } from '@/domain/tags'
import { buildSheetSchema, templates } from '@/domain/templates'
import type {
  CalendarAttendee,
  CalendarEvent,
  FuzzyDate,
  HistoryEntry,
  HistoryKind,
  Id,
  IsoDate,
  IsoDateTime,
  LinkRef,
  Member,
  Row,
  Sheet,
  Tag,
  TemplateKey,
  Warmth,
} from '@/domain/types'

/** Bump when the seed changes; existing local databases are then reseeded. */
export const SEED_VERSION = 3

export interface SeedData {
  members: Member[]
  sheets: Sheet[]
  tags: Tag[]
  rows: Row[]
  history: HistoryEntry[]
  calendarEvents: CalendarEvent[]
}

/** Ids that tests and the UI can rely on. */
export const seedIds = {
  members: { dawar: 'm-dawar', dhruv: 'm-dhruv' },
  sheets: {
    dawarCustomers: 's-dawar-customers',
    dawarInvestors: 's-dawar-investors',
    dawarAdvisors: 's-dawar-advisors',
    dawarConnectors: 's-dawar-connectors',
    dawarServiceProviders: 's-dawar-service-providers',
    dhruvCustomers: 's-dhruv-customers',
    dhruvInvestors: 's-dhruv-investors',
    dhruvConnectors: 's-dhruv-connectors',
  },
  /** Added by `loadPerfSheet()`, not by the seed. */
  perfSheet: 's-dawar-customers-2000',
  tags: {
    foundry: 't-foundry',
    defence: 't-defence',
    pilotCandidate: 't-pilot-candidate',
    decisionMaker: 't-decision-maker',
    iitBombayAlumni: 't-iit-bombay-alumni',
    efNetwork: 't-ef-network',
    introPending: 't-intro-pending',
    ev: 't-ev',
  },
  rows: {
    // Dawar · Customers
    rohanMehta: 'r-dawar-customers-01',
    sunitaKulkarni: 'r-dawar-customers-02',
    karthikSubramanian: 'r-dawar-customers-03',
    hiteshPatel: 'r-dawar-customers-04',
    meeraDesai: 'r-dawar-customers-05',
    anilReddy: 'r-dawar-customers-06',
    vikramJoshi: 'r-dawar-customers-07',
    priyaNair: 'r-dawar-customers-08',
    deepakSharma: 'r-dawar-customers-09',
    lakshmiIyer: 'r-dawar-customers-10',
    farhanShaikh: 'r-dawar-customers-11',
    gauravBansal: 'r-dawar-customers-12',
    // Dawar · Investors
    ananyaKrishnan: 'r-dawar-investors-01',
    rahulKhanna: 'r-dawar-investors-02',
    sanjayGupta: 'r-dawar-investors-03',
    nehaSaxena: 'r-dawar-investors-04',
    mohanIyengar: 'r-dawar-investors-05',
    rituBhatia: 'r-dawar-investors-06',
    // Dawar · Advisors and experts
    sureshVenkatesan: 'r-dawar-advisors-01',
    rakeshThapar: 'r-dawar-advisors-02',
    ashaRaman: 'r-dawar-advisors-03',
    // Dawar · Connectors
    krithikIyer: 'r-dawar-connectors-01',
    arvindMenonDawar: 'r-dawar-connectors-02',
    poojaShah: 'r-dawar-connectors-03',
    siddharthRao: 'r-dawar-connectors-04',
    imranQureshi: 'r-dawar-connectors-05',
    divyaKapoor: 'r-dawar-connectors-06',
    // Dawar · Service providers
    rameshChoudhary: 'r-dawar-service-providers-01',
    aditiDeshpande: 'r-dawar-service-providers-02',
    harishNair: 'r-dawar-service-providers-03',
    fatimaSheikh: 'r-dawar-service-providers-04',
    // Dhruv · Customers
    naveenGowda: 'r-dhruv-customers-01',
    rajeshAgarwal: 'r-dhruv-customers-02',
    snehaPillai: 'r-dhruv-customers-03',
    arjunMalhotra: 'r-dhruv-customers-04',
    kavitaRao: 'r-dhruv-customers-05',
    // Dhruv · Investors
    arvindMenonDhruv: 'r-dhruv-investors-01',
    kiranSethi: 'r-dhruv-investors-02',
    vivekChandra: 'r-dhruv-investors-03',
    shaliniVerma: 'r-dhruv-investors-04',
    prakashHegde: 'r-dhruv-investors-05',
    // Dhruv · Connectors
    rohitBose: 'r-dhruv-connectors-01',
    manishaJoshi: 'r-dhruv-connectors-02',
    tarunMehra: 'r-dhruv-connectors-03',
    nikhilAgarwal: 'r-dhruv-connectors-04',
  },
  /** "Cdr Arvind Menon" (Dawar · Connectors) and "Arvind Menon" (Dhruv · Investors). */
  arvindMenon: { dawar: 'r-dawar-connectors-02', dhruv: 'r-dhruv-investors-01' },
  /** Vikram Joshi, Paid: the only won row. */
  wonRow: 'r-dawar-customers-07',
  /** Priya Nair (lost after First call) and Deepak Sharma (lost after Plant visit). */
  lostRows: ['r-dawar-customers-08', 'r-dawar-customers-09'],
  /** Lakshmi Iyer: at Plant visit with Identified, Intro asked and First call skipped. */
  skippedStagesRow: 'r-dawar-customers-10',
  /** Meera Desai: next action due 3 Nov 2026. */
  overdueRow: 'r-dawar-customers-05',
  /** Sunita Kulkarni: next action due today, 5 Nov 2026. */
  dueTodayRow: 'r-dawar-customers-02',
  /** Hitesh Patel: no warmth, at Identified. */
  noWarmthRow: 'r-dawar-customers-04',
  /** Kiran Sethi (Dhruv · Investors), introduced by Divya Kapoor (Dawar · Connectors). */
  crossTabIntroRow: 'r-dhruv-investors-02',
  events: {
    /** Today 11:30 IST with Rohan Mehta (matched by attendee email). */
    dawarMatched: 'e-dawar-01',
    /** Today 12:00 IST with Dhruv's Arvind Menon (matched by attendee email). */
    dhruvMatched: 'e-dhruv-01',
  },
} as const

// ---------- Helpers ----------

const IST_OFFSET_MINUTES = 330

/** IST wall-clock date and time ("2026-10-12", "11:30") to a UTC ISO instant. */
export function istInstant(date: IsoDate, time: string): IsoDateTime {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  const [hh = 0, mm = 0] = time.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - IST_OFFSET_MINUTES * 60_000).toISOString()
}

function kebab(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const day = (date: IsoDate): FuzzyDate => ({ date, precision: 'day' })
const midMonth = (date: IsoDate): FuzzyDate => ({ date, precision: 'mid-month' })
const lateMonth = (date: IsoDate): FuzzyDate => ({ date, precision: 'late-month' })
const earlyMonth = (date: IsoDate): FuzzyDate => ({ date, precision: 'early-month' })

const SEED_CREATED_AT = istInstant('2026-10-01', '09:00')

/**
 * A sheet from a template with readable, deterministic ids: columns `<sheetId>-col-<key>` and
 * stages `<sheetId>-stage-<name>`.
 */
export function buildSheet(input: {
  id: Id
  memberId: Id
  slug: string
  template: TemplateKey
  position: number
  name?: string
  createdAt?: IsoDateTime
}): Sheet {
  let n = 0
  const schema = buildSheetSchema(input.template, () => `${input.id}-tmp-${n++}`)
  const createdAt = input.createdAt ?? SEED_CREATED_AT
  return {
    id: input.id,
    memberId: input.memberId,
    slug: input.slug,
    name: input.name ?? templates[input.template].name,
    template: input.template,
    position: input.position,
    columns: schema.columns.map((c) => ({ ...c, id: `${input.id}-col-${kebab(c.key)}` })),
    stages: schema.stages.map((s) => ({ ...s, id: `${input.id}-stage-${kebab(s.name)}` })),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }
}

type TouchKind = Extract<HistoryKind, 'call' | 'meeting' | 'whatsapp' | 'email' | 'note'>
/** A manual touch: kind, IST date, IST time, text. */
type Touch = [TouchKind, IsoDate, string, string]

interface RowSpec {
  id: Id
  name: string
  company?: string
  title?: string
  /** E.164. */
  phone?: string
  email?: string
  linkedin?: string
  links?: string[]
  warmth?: Warmth | null
  /** IST date each stage was reached, in order; null = skipped. The last entry is current. */
  stages?: (IsoDate | null)[]
  /** Marked lost at the current stage on this IST date. */
  lostOn?: IsoDate
  tags?: (keyof typeof seedIds.tags)[]
  next?: { text: string; date: FuzzyDate | null }
  introducedBy?: Id | { text: string }
  /** Row ids, or free text for something not in the CRM. */
  connectsTo?: (Id | { text: string })[]
  notes?: string
  fields?: Record<string, unknown>
  /** When the row was added, if it has no dated stage. */
  createdOn?: IsoDate
  /** Imported from the founders' old sheet with a fuzzy date, instead of a "created" entry. */
  imported?: { date: FuzzyDate; text: string }
  touches?: Touch[]
}

function toLink(ref: Id | { text: string }): LinkRef {
  return typeof ref === 'string' ? { kind: 'row', rowId: ref } : { kind: 'text', text: ref.text }
}

function buildRow(
  sheet: Sheet,
  position: number,
  spec: RowSpec,
): { row: Row; history: Omit<HistoryEntry, 'id'>[] } {
  const owner = sheet.memberId
  const history: Omit<HistoryEntry, 'id'>[] = []
  const entry = (
    kind: HistoryKind,
    source: HistoryEntry['source'],
    at: IsoDateTime,
    text: string,
    extra: Partial<Pick<HistoryEntry, 'fuzzyDate' | 'meta'>> = {},
  ): void => {
    history.push({
      rowId: spec.id,
      kind,
      source,
      at,
      fuzzyDate: extra.fuzzyDate ?? null,
      text,
      memberId: owner,
      ...(extra.meta ? { meta: extra.meta } : {}),
    })
  }

  const reached = spec.stages ?? []
  if (reached.length > sheet.stages.length) {
    throw new Error(`Seed row ${spec.id} has more stages than sheet ${sheet.id}`)
  }
  const stageIndex = reached.length > 0 ? reached.length - 1 : null
  const stageDates: Record<string, IsoDate | null> = {}
  reached.forEach((date, i) => {
    const stage = sheet.stages[i]
    if (stage) stageDates[stage.id] = date
  })

  // Created or imported.
  if (spec.imported) {
    entry('imported', 'system', istInstant(spec.imported.date.date, '09:00'), spec.imported.text, {
      fuzzyDate: spec.imported.date,
    })
  } else {
    const createdOn = spec.createdOn ?? reached.find((d) => d !== null)
    if (!createdOn) throw new Error(`Seed row ${spec.id} needs a creation date`)
    entry('created', 'system', istInstant(createdOn, '09:30'), `Added to ${sheet.name}`)
  }

  // The move into the current stage, consistent with stageDates.
  if (stageIndex !== null && stageIndex > 0) {
    const date = reached[stageIndex]
    const to = sheet.stages[stageIndex]?.name ?? ''
    if (!date) throw new Error(`Seed row ${spec.id} must date its current stage`)
    const skippedAll = reached.slice(0, stageIndex).every((d) => d === null)
    const from = skippedAll ? null : stageIndex - 1
    const text =
      from === null ? `Stage set to ${to}` : `Stage: ${sheet.stages[from]?.name ?? ''} → ${to}`
    entry('stage', 'system', istInstant(date, '17:30'), text, {
      meta: { fromStageIndex: from, toStageIndex: stageIndex },
    })
  }

  for (const [kind, date, time, text] of spec.touches ?? []) {
    entry(kind, 'manual', istInstant(date, time), text)
  }

  let lost: Row['lost'] = null
  if (spec.lostOn) {
    if (stageIndex === null) throw new Error(`Seed row ${spec.id} is lost without a stage`)
    lost = { stageIndex, date: spec.lostOn }
    entry(
      'stage',
      'system',
      istInstant(spec.lostOn, '12:00'),
      `Marked lost after ${sheet.stages[stageIndex]?.name ?? ''}`,
      { meta: { lost: true } },
    )
  }

  history.sort((a, b) => a.at.localeCompare(b.at))
  const first = history[0]
  const last = history[history.length - 1]
  if (!first || !last) throw new Error(`Seed row ${spec.id} has no history`)

  const row: Row = {
    id: spec.id,
    sheetId: sheet.id,
    memberId: owner,
    position,
    name: spec.name,
    company: spec.company ?? '',
    title: spec.title ?? '',
    phone: spec.phone ?? '',
    email: spec.email ?? '',
    linkedin: spec.linkedin ?? '',
    links: spec.links ?? [],
    warmth: spec.warmth ?? null,
    stageIndex,
    stageDates,
    lost,
    tagIds: (spec.tags ?? []).map((t) => seedIds.tags[t]),
    nextAction: spec.next ?? null,
    introducedBy: spec.introducedBy ? toLink(spec.introducedBy) : null,
    connectsTo: (spec.connectsTo ?? []).map(toLink),
    notes: spec.notes ?? '',
    files: [],
    fields: spec.fields ?? {},
    lastTouchAt: last.at,
    createdAt: first.at,
    updatedAt: last.at,
    createdBy: owner,
    updatedBy: owner,
    deletedAt: null,
  }
  return { row, history }
}

// ---------- Members, sheets and tags ----------

const members: Member[] = [
  {
    id: seedIds.members.dawar,
    slug: 'dawar',
    name: 'Dawar',
    email: 'dawar@utopianautonomy.example',
    position: 0,
    createdAt: SEED_CREATED_AT,
  },
  {
    id: seedIds.members.dhruv,
    slug: 'dhruv',
    name: 'Dhruv',
    email: 'dhruv@utopianautonomy.example',
    position: 1,
    createdAt: SEED_CREATED_AT,
  },
]

const TAG_NAMES: Record<keyof typeof seedIds.tags, string> = {
  foundry: 'foundry',
  defence: 'defence',
  pilotCandidate: 'pilot candidate',
  decisionMaker: 'decision maker',
  iitBombayAlumni: 'IIT Bombay alumni',
  efNetwork: 'EF network',
  introPending: 'intro pending',
  ev: 'EV',
}

function buildTags(): Tag[] {
  const tags: Tag[] = []
  for (const key of Object.keys(TAG_NAMES) as (keyof typeof seedIds.tags)[]) {
    tags.push({
      id: seedIds.tags[key],
      name: TAG_NAMES[key],
      colour: pickTagColour(tags),
      createdAt: SEED_CREATED_AT,
    })
  }
  return tags
}

// ---------- Rows ----------

const R = seedIds.rows

const dawarCustomers: RowSpec[] = [
  {
    id: R.rohanMehta,
    name: 'Rohan Mehta',
    title: 'Plant Head',
    company: 'Hosur Precision Forge',
    phone: '+919845012345',
    email: 'rohan@hosurprecisionforge.example',
    linkedin: 'https://www.linkedin.com/in/rohan-mehta-example',
    warmth: 'warm',
    stages: ['2026-10-02', '2026-10-08', '2026-10-21'],
    tags: ['foundry', 'decisionMaker', 'pilotCandidate'],
    next: { text: 'Send ROI note', date: day('2026-11-06') },
    introducedBy: R.krithikIyer,
    notes: '4 heading lines; unplanned downtime is his KPI.',
    fields: {
      plantLocation: 'Hosur',
      archetype: 'Foundries and forging shops',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Unplanned downtime on the heading lines',
      wedgeAgent: 'Maintenance',
      ticketEstimate: 2_500_000,
    },
    touches: [
      ['call', '2026-10-21', '16:00', 'First call: walked through downtime logs, keen on a pilot'],
      ['whatsapp', '2026-10-29', '11:15', 'Shared line-wise downtime numbers'],
    ],
  },
  {
    id: R.sunitaKulkarni,
    name: 'Sunita Kulkarni',
    title: 'Operations Director',
    company: 'Deccan Castings',
    phone: '+919822034567',
    email: 'sunita@deccancastings.example',
    warmth: 'waiting',
    stages: ['2026-10-03', '2026-10-07', '2026-10-14', '2026-10-30'],
    tags: ['foundry', 'pilotCandidate'],
    next: { text: 'Share plant visit notes', date: day('2026-11-05') },
    notes: 'Pune casting unit with two moulding lines.',
    fields: {
      plantLocation: 'Chakan, Pune',
      archetype: 'Foundries and forging shops',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'Champion',
      pain: 'Casting rejection rates swing with sand quality',
      wedgeAgent: 'Quality',
      ticketEstimate: 1_800_000,
    },
    touches: [
      ['call', '2026-10-14', '11:00', 'First call with the quality team'],
      ['meeting', '2026-10-30', '10:30', 'Plant visit: rejection data is still on paper'],
      ['email', '2026-11-02', '15:20', "Sent a summary; she will share last quarter's rejections"],
    ],
  },
  {
    id: R.karthikSubramanian,
    name: 'Karthik Subramanian',
    title: 'Head of Manufacturing Engineering',
    company: 'Coromandel Electronics',
    phone: '+919840123456',
    email: 'karthik@coromandelems.example',
    warmth: 'warm',
    stages: ['2026-10-01', '2026-10-05', '2026-10-09', '2026-10-16', '2026-10-27'],
    tags: ['decisionMaker', 'pilotCandidate'],
    next: { text: 'Confirm pilot scope and success metrics', date: midMonth('2026-11-15') },
    introducedBy: R.imranQureshi,
    notes: 'Chennai EMS line; three SMT lines.',
    fields: {
      plantLocation: 'Oragadam, Chennai',
      archetype: 'Electronics manufacturing',
      turnoverBand: '₹250–1,000 Cr',
      roleInDeal: 'Decision maker',
      pain: 'SMT line changeovers take two hours a shift',
      wedgeAgent: 'Production',
      ticketEstimate: 4_000_000,
    },
    touches: [
      ['meeting', '2026-10-16', '14:00', 'Plant visit: SMT lines 2 and 3'],
      ['email', '2026-10-27', '17:10', 'Sent the pilot scope draft'],
    ],
  },
  {
    id: R.hiteshPatel,
    name: 'Hitesh Patel',
    title: 'Owner',
    company: 'Saurashtra Precision Works',
    phone: '+919825045678',
    email: 'hitesh@saurashtraprecision.example',
    warmth: null,
    stages: ['2026-10-20'],
    tags: ['introPending'],
    next: { text: 'Ask Siddharth for a warm intro', date: lateMonth('2026-11-25') },
    introducedBy: R.siddharthRao,
    fields: {
      plantLocation: 'Rajkot',
      archetype: 'Precision job shops',
      turnoverBand: '< ₹50 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Quotes take three days; loses jobs to faster shops',
      wedgeAgent: 'Quote',
      ticketEstimate: 800_000,
    },
    touches: [['note', '2026-10-20', '18:00', 'Runs 40 CNC machines and quotes by hand']],
  },
  {
    id: R.meeraDesai,
    name: 'Meera Desai',
    title: 'Plant Manager',
    company: 'Damanganga Specialty Chemicals',
    phone: '+919824056789',
    email: 'meera@damangangachem.example',
    warmth: 'waiting',
    stages: ['2026-10-06', '2026-10-12'],
    tags: ['introPending'],
    next: { text: 'Follow up on the intro', date: day('2026-11-03') },
    fields: {
      plantLocation: 'Vapi GIDC',
      archetype: 'Specialty and batch chemicals',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'Champion',
      pain: 'Batch records are on paper; audits take weeks',
      wedgeAgent: 'Compliance',
      ticketEstimate: 1_500_000,
    },
    touches: [['email', '2026-10-12', '12:40', 'Asked Pooja Shah for an intro']],
  },
  {
    id: R.anilReddy,
    name: 'Anil Reddy',
    title: 'VP Operations',
    company: 'Shakti EV Components',
    phone: '+919845167890',
    email: 'anil@shaktiev.example',
    warmth: 'warm',
    stages: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-08', '2026-10-15', '2026-10-26'],
    tags: ['ev', 'pilotCandidate', 'decisionMaker'],
    next: { text: 'Weekly pilot review', date: day('2026-11-10') },
    fields: {
      plantLocation: 'Hosur',
      archetype: 'Auto and EV component makers',
      turnoverBand: '₹250–1,000 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Motor housing machining scrap at 4%',
      wedgeAgent: 'Quality',
      ticketEstimate: 3_600_000,
    },
    touches: [
      ['meeting', '2026-10-26', '11:00', 'Pilot kickoff on line 1'],
      ['call', '2026-11-02', '16:30', 'Week 1 review: scrap down on the night shift'],
      ['whatsapp', '2026-11-04', '18:45', 'Shared the week 1 dashboard'],
    ],
  },
  {
    id: R.vikramJoshi,
    name: 'Vikram Joshi',
    title: 'Managing Director',
    company: 'Nashik Auto Stampings',
    phone: '+919822178901',
    email: 'vikram@nashikstampings.example',
    warmth: 'warm',
    stages: [
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-06',
      '2026-10-09',
      '2026-10-13',
      '2026-10-31',
    ],
    tags: ['ev', 'decisionMaker'],
    next: { text: 'Propose line 2 expansion', date: earlyMonth('2026-12-05') },
    fields: {
      plantLocation: 'Ambad, Nashik',
      archetype: 'Auto and EV component makers',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Press downtime and slow die changes',
      wedgeAgent: 'Maintenance',
      ticketEstimate: 3_000_000,
    },
    touches: [
      ['meeting', '2026-10-13', '10:00', 'Pilot went live on press line 1'],
      ['email', '2026-10-31', '16:00', 'Signed the first annual order'],
    ],
  },
  {
    id: R.priyaNair,
    name: 'Priya Nair',
    title: 'Purchase Head',
    company: 'Kovai Pumps and Motors',
    phone: '+919843189012',
    email: 'priya@kovaipumps.example',
    warmth: 'cold',
    stages: ['2026-10-02', '2026-10-06', '2026-10-13'],
    lostOn: '2026-10-22',
    fields: {
      plantLocation: 'Coimbatore',
      archetype: 'Hardware OEMs with supplier networks',
      turnoverBand: '₹250–1,000 Cr',
      roleInDeal: 'Blocker',
      pain: 'Supplier delays on castings',
      wedgeAgent: 'Procurement',
      ticketEstimate: 1_200_000,
    },
    touches: [['call', '2026-10-13', '15:00', 'First call: happy with their current ERP vendor']],
  },
  {
    id: R.deepakSharma,
    name: 'Deepak Sharma',
    title: 'GM Works',
    company: 'Ludhiana Forgings',
    phone: '+919814190123',
    email: 'deepak@ludhianaforgings.example',
    warmth: 'cold',
    stages: ['2026-10-01', '2026-10-03', '2026-10-08', '2026-10-19'],
    lostOn: '2026-11-02',
    tags: ['foundry'],
    fields: {
      plantLocation: 'Ludhiana',
      archetype: 'Foundries and forging shops',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'User',
      pain: 'Die wear is tracked by memory',
      wedgeAgent: 'Maintenance',
      ticketEstimate: 1_000_000,
    },
    touches: [
      [
        'meeting',
        '2026-10-19',
        '11:30',
        'Plant visit: budget frozen until the next financial year',
      ],
    ],
  },
  {
    id: R.lakshmiIyer,
    name: 'Lakshmi Iyer',
    title: 'Director, Operations',
    company: 'Sriperumbudur Appliances',
    phone: '+919841201234',
    email: 'lakshmi@sriperumbudurappliances.example',
    warmth: 'waiting',
    stages: [null, null, null, '2026-10-23'],
    tags: ['decisionMaker'],
    next: { text: 'Send plant visit summary', date: day('2026-11-12') },
    notes: 'Met at an industry conference and went straight to a plant visit.',
    fields: {
      plantLocation: 'Sriperumbudur',
      archetype: 'Consumer durables and appliances',
      turnoverBand: '> ₹1,000 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Energy cost per unit in the paint shop',
      wedgeAgent: 'Energy',
      ticketEstimate: 6_000_000,
    },
    touches: [['meeting', '2026-10-23', '10:00', 'Plant visit with the energy team']],
  },
  {
    id: R.farhanShaikh,
    name: 'Farhan Shaikh',
    title: 'Production Manager',
    company: 'Aurangabad Polymers',
    phone: '+919823212345',
    email: 'farhan@aurangabadpolymers.example',
    warmth: null,
    stages: ['2026-10-25'],
    imported: { date: lateMonth('2026-10-25'), text: "Imported from the founders' sheet" },
    fields: {
      plantLocation: 'Waluj, Aurangabad',
      archetype: 'Plastics, rubber and packaging',
      turnoverBand: '< ₹50 Cr',
    },
  },
  {
    id: R.gauravBansal,
    name: 'Gaurav Bansal',
    title: 'Head of Digital',
    company: 'Jamshedpur Steel Processors',
    phone: '+919835223456',
    email: 'gaurav@jamshedpursteel.example',
    warmth: 'cold',
    stages: ['2026-10-05', '2026-10-09'],
    next: { text: 'Check whether the intro landed', date: day('2026-11-18') },
    fields: {
      plantLocation: 'Jamshedpur',
      archetype: 'Steel and metals processing',
      turnoverBand: '₹250–1,000 Cr',
      roleInDeal: 'Champion',
      pain: 'Furnace energy per tonne',
      wedgeAgent: 'Energy',
      ticketEstimate: 2_000_000,
    },
    touches: [
      ['email', '2026-10-09', '13:00', 'Asked Krithik for an intro to the plant head'],
      ['note', '2026-10-28', '16:00', 'No reply yet; the plant head is travelling'],
    ],
  },
]

const dawarInvestors: RowSpec[] = [
  {
    id: R.ananyaKrishnan,
    name: 'Ananya Krishnan',
    title: 'Partner',
    company: 'Lattice Ventures',
    phone: '+919820234567',
    email: 'ananya@latticevc.example',
    warmth: 'warm',
    stages: ['2026-10-01', '2026-10-04', '2026-10-15'],
    tags: ['efNetwork'],
    next: { text: 'Send the data room link', date: day('2026-11-09') },
    fields: {
      investorType: 'VC',
      chequeSize: 15_000_000,
      stageFocus: 'Pre-seed and seed',
      thesisFit: 'Industrial AI and manufacturing software',
    },
    touches: [
      ['meeting', '2026-10-15', '15:00', 'First meeting: wants proof from a plant pilot'],
      ['email', '2026-10-24', '11:00', 'Sent the deck and pilot metrics'],
    ],
  },
  {
    id: R.rahulKhanna,
    name: 'Rahul Khanna',
    title: 'Angel investor',
    phone: '+919810245678',
    email: 'rahul.khanna@angelmail.example',
    warmth: 'waiting',
    stages: ['2026-10-10', '2026-10-18'],
    tags: ['efNetwork', 'introPending'],
    next: { text: 'Nudge Divya about the intro', date: midMonth('2026-11-15') },
    fields: {
      investorType: 'Angel',
      chequeSize: 2_500_000,
      stageFocus: 'Pre-seed',
      thesisFit: 'Backs former operators building for Indian SMEs',
    },
    touches: [['whatsapp', '2026-10-18', '12:30', 'Divya offered to introduce us']],
  },
  {
    id: R.sanjayGupta,
    name: 'Sanjay Gupta',
    title: 'Investment Director',
    company: 'Sahyadri Industries CVC',
    phone: '+919821256789',
    email: 'sanjay@sahyadricvc.example',
    warmth: null,
    stages: ['2026-10-22'],
    fields: {
      investorType: 'CVC',
      chequeSize: 50_000_000,
      stageFocus: 'Series A',
      thesisFit: 'Strategic fit with their auto component business',
    },
    touches: [
      ['note', '2026-10-22', '17:00', 'Their parent runs six plants and could also be a customer'],
    ],
  },
  {
    id: R.nehaSaxena,
    name: 'Neha Saxena',
    title: 'Principal',
    company: 'Tidewater Capital',
    phone: '+919819267890',
    email: 'neha@tidewatercap.example',
    warmth: 'warm',
    stages: ['2026-10-01', '2026-10-03', '2026-10-08', '2026-10-28'],
    next: { text: 'Share customer references', date: day('2026-11-13') },
    introducedBy: R.poojaShah,
    fields: {
      investorType: 'VC',
      chequeSize: 30_000_000,
      stageFocus: 'Seed and Series A',
      thesisFit: 'Deep tech for heavy industry',
    },
    touches: [
      ['meeting', '2026-10-08', '16:00', 'First meeting with the partners'],
      ['call', '2026-10-28', '11:00', 'Diligence call: unit economics and pilot pipeline'],
      ['email', '2026-11-03', '14:30', 'Sent the financial model'],
    ],
  },
  {
    id: R.mohanIyengar,
    name: 'Mohan Iyengar',
    title: 'Principal',
    company: 'Iyengar Family Office',
    phone: '+919845278901',
    email: 'mohan@iyengarfo.example',
    warmth: 'waiting',
    stages: ['2026-10-01', '2026-10-02', '2026-10-06', '2026-10-14', '2026-10-30'],
    tags: ['iitBombayAlumni'],
    next: { text: 'Review the term sheet with the lawyer', date: day('2026-11-11') },
    fields: {
      investorType: 'Family office',
      chequeSize: 20_000_000,
      stageFocus: 'Seed',
      thesisFit: 'Long-term capital; the family runs a forging business',
    },
    touches: [
      ['meeting', '2026-10-14', '10:30', 'Diligence session at their office'],
      ['email', '2026-10-30', '18:00', 'Received the draft term sheet'],
    ],
  },
  {
    id: R.rituBhatia,
    name: 'Ritu Bhatia',
    title: 'Angel investor',
    phone: '+919811289012',
    email: 'ritu.bhatia@angelmail.example',
    warmth: 'cold',
    stages: ['2026-10-12'],
    fields: {
      investorType: 'Angel',
      chequeSize: 1_000_000,
      stageFocus: 'Pre-seed',
      thesisFit: 'Knows steel plant operations well',
    },
    touches: [['email', '2026-10-26', '10:00', 'Cold email sent; no reply yet']],
  },
]

const dawarAdvisors: RowSpec[] = [
  {
    id: R.sureshVenkatesan,
    name: 'Dr Suresh Venkatesan',
    title: 'Foundry metallurgy consultant',
    company: 'Venkatesan Metallurgy Consulting',
    phone: '+919840290123',
    email: 'suresh@vmconsulting.example',
    warmth: 'warm',
    stages: ['2026-10-05', '2026-10-19'],
    tags: ['foundry'],
    next: { text: 'Invite him to review the defect taxonomy', date: day('2026-11-16') },
    fields: {
      expertise: 'Foundry metallurgy',
      wantFromThem: 'Sanity-check our casting defect models',
      arrangement: 'Informal',
    },
    touches: [['call', '2026-10-19', '17:00', 'Happy to review our defect taxonomy']],
  },
  {
    id: R.rakeshThapar,
    name: 'Col Rakesh Thapar',
    title: 'Defence procurement advisor',
    company: 'Thapar Defence Advisory',
    phone: '+919818301234',
    email: 'rakesh@thapardefence.example',
    warmth: null,
    stages: ['2026-10-27'],
    tags: ['defence'],
    next: { text: 'Ask Arvind for an intro', date: lateMonth('2026-11-25') },
    fields: {
      expertise: 'Defence procurement',
      wantFromThem: 'How to qualify as a defence supplier',
      arrangement: 'Informal',
    },
    touches: [['note', '2026-10-27', '15:00', 'Arvind says he advises three defence suppliers']],
  },
  {
    id: R.ashaRaman,
    name: 'Prof Asha Raman',
    title: 'Professor, Industrial Engineering',
    company: 'Operations Research Lab',
    phone: '+919820312345',
    email: 'asha@opsresearchlab.example',
    warmth: 'waiting',
    stages: ['2026-10-08', '2026-10-21'],
    tags: ['iitBombayAlumni'],
    next: { text: 'Share the scheduling problem write-up', date: day('2026-11-20') },
    fields: {
      expertise: 'Production scheduling',
      wantFromThem: 'Guidance on scheduling research and hiring',
      arrangement: 'Advisory equity',
    },
    touches: [
      ['email', '2026-10-21', '10:30', 'Sent a note about advisory equity'],
      ['whatsapp', '2026-11-02', '12:00', 'She will reply after her semester exams'],
    ],
  },
]

const dawarConnectors: RowSpec[] = [
  {
    id: R.krithikIyer,
    name: 'Krithik Iyer',
    title: 'Founder',
    company: 'Kaveri Robotics',
    phone: '+919845323456',
    email: 'krithik@kaverirobotics.example',
    warmth: 'warm',
    tags: ['iitBombayAlumni'],
    next: { text: 'Thank Krithik and share an update', date: day('2026-11-19') },
    connectsTo: [R.rohanMehta, R.gauravBansal, { text: 'Hosur forging cluster association' }],
    createdOn: '2026-10-01',
    fields: { relationship: 'Alumni', introAskedFor: 'Hosur forging plant heads', introMade: true },
    touches: [
      ['call', '2026-10-01', '18:00', 'Offered intros across the Hosur cluster'],
      ['whatsapp', '2026-10-07', '10:00', 'Introduced us to Rohan Mehta'],
    ],
  },
  {
    id: R.arvindMenonDawar,
    name: 'Cdr Arvind Menon',
    title: 'Defence supply chain consultant',
    company: 'Menon Marine Advisory',
    phone: '+919820334567',
    email: 'arvind.menon@menonmarine.example',
    warmth: 'warm',
    tags: ['defence'],
    next: { text: 'Coffee to discuss defence suppliers', date: midMonth('2026-11-15') },
    connectsTo: [R.rakeshThapar, { text: 'Naval dockyard suppliers' }],
    createdOn: '2026-10-10',
    notes: 'Former naval engineer.',
    fields: {
      relationship: 'Professional',
      introAskedFor: 'Defence suppliers in Pune',
      introMade: false,
    },
    touches: [['meeting', '2026-10-27', '12:30', 'Lunch: knows many defence suppliers']],
  },
  {
    id: R.poojaShah,
    name: 'Pooja Shah',
    title: 'Founder',
    company: 'Shah Design Studio',
    phone: '+919833345678',
    email: 'pooja@shahdesign.example',
    warmth: 'waiting',
    tags: ['efNetwork'],
    next: { text: 'Remind Pooja about the Vapi intro', date: day('2026-11-09') },
    connectsTo: [R.nehaSaxena, R.meeraDesai],
    imported: {
      date: midMonth('2026-10-15'),
      text: "Imported from the founders' sheet: met at an EF dinner",
    },
    fields: { relationship: 'Friend', introAskedFor: 'Vapi chemical plants', introMade: false },
    touches: [['whatsapp', '2026-11-03', '13:00', 'Says the Vapi intro is coming this week']],
  },
  {
    id: R.siddharthRao,
    name: 'Siddharth Rao',
    title: 'Partner',
    company: 'Rao Engineering Traders',
    phone: '+919825356789',
    email: 'siddharth@raotraders.example',
    warmth: null,
    tags: ['introPending'],
    connectsTo: [R.hiteshPatel, { text: 'Rajkot Engineering Association' }],
    createdOn: '2026-10-20',
    fields: { relationship: 'Family', introAskedFor: 'Rajkot job shops', introMade: false },
    touches: [['call', '2026-10-20', '18:30', 'Knows most job shop owners in Rajkot']],
  },
  {
    id: R.imranQureshi,
    name: 'Imran Qureshi',
    title: 'Secretary',
    company: 'Coromandel Electronics Manufacturers Forum',
    phone: '+919840367890',
    email: 'imran@cemforum.example',
    warmth: 'warm',
    connectsTo: [R.karthikSubramanian],
    createdOn: '2026-10-01',
    fields: {
      relationship: 'Professional',
      introAskedFor: 'EMS plant heads in Chennai',
      introMade: true,
    },
    touches: [
      ['meeting', '2026-10-02', '16:00', "Met at the forum's monthly meet"],
      ['email', '2026-10-05', '11:00', 'Introduced us to Karthik'],
    ],
  },
  {
    id: R.divyaKapoor,
    name: 'Divya Kapoor',
    title: 'Programme Lead',
    company: 'Northbound Founders Club',
    phone: '+919845378901',
    email: 'divya@northboundclub.example',
    warmth: 'warm',
    tags: ['efNetwork', 'iitBombayAlumni'],
    connectsTo: [R.rahulKhanna, R.kiranSethi, { text: 'Bengaluru angel circle' }],
    createdOn: '2026-10-17',
    fields: {
      relationship: 'Alumni',
      introAskedFor: 'Angels who back industrial startups',
      introMade: false,
    },
    touches: [['meeting', '2026-10-17', '17:30', 'Catch-up; offered angel intros']],
  },
]

const dawarServiceProviders: RowSpec[] = [
  {
    id: R.rameshChoudhary,
    name: 'Ramesh Choudhary',
    title: 'Partner',
    company: 'Choudhary and Associates',
    phone: '+919820389012',
    email: 'ramesh@choudharyca.example',
    warmth: 'warm',
    stages: ['2026-10-05', '2026-10-12'],
    next: { text: 'Send the board resolution for GST', date: day('2026-11-12') },
    fields: {
      service: 'CA',
      quote: 45_000,
      docsShared: true,
      deadline: day('2026-11-30'),
    },
    touches: [
      ['email', '2026-10-12', '10:00', 'Engaged for GST registration and bookkeeping'],
      ['call', '2026-11-04', '15:00', 'Needs the board resolution'],
    ],
  },
  {
    id: R.aditiDeshpande,
    name: 'Aditi Deshpande',
    title: 'Associate',
    company: 'Deshpande Legal LLP',
    phone: '+919822390123',
    email: 'aditi@deshpandelegal.example',
    warmth: 'waiting',
    stages: ['2026-10-26'],
    next: { text: 'Get a quote for the ESOP plan', date: lateMonth('2026-11-25') },
    fields: { service: 'Lawyer', quote: 120_000, docsShared: false },
    touches: [['email', '2026-10-26', '14:00', 'Asked for a quote on the ESOP plan']],
  },
  {
    id: R.harishNair,
    name: 'Harish Nair',
    title: 'Founder',
    company: 'FilingDesk Incorporations',
    phone: '+919845401234',
    email: 'harish@filingdesk.example',
    warmth: 'warm',
    stages: ['2026-10-02', '2026-10-06'],
    fields: {
      service: 'Incorporation',
      quote: 25_000,
      docsShared: true,
      deadline: midMonth('2026-11-15'),
    },
    touches: [
      ['call', '2026-10-06', '12:00', 'Engaged for the private limited incorporation'],
      ['email', '2026-10-29', '16:00', 'The incorporation filing is with the registrar'],
    ],
  },
  {
    id: R.fatimaSheikh,
    name: 'Fatima Sheikh',
    title: 'Consultant',
    company: 'Visa Bridge Consultants',
    phone: '+919833412345',
    email: 'fatima@visabridge.example',
    warmth: null,
    stages: ['2026-11-02'],
    next: { text: 'Compare visa quotes', date: midMonth('2026-11-15') },
    fields: { service: 'Visa', quote: 60_000, docsShared: false },
  },
]

const dhruvCustomers: RowSpec[] = [
  {
    id: R.naveenGowda,
    name: 'Naveen Gowda',
    title: 'Plant Head',
    company: 'Belagavi Foundry Works',
    phone: '+919845423456',
    email: 'naveen@belagavifoundry.example',
    warmth: 'warm',
    stages: ['2026-10-06', '2026-10-10', '2026-10-23'],
    tags: ['foundry', 'pilotCandidate'],
    next: { text: 'Plan the plant visit', date: day('2026-11-11') },
    fields: {
      plantLocation: 'Belagavi',
      archetype: 'Foundries and forging shops',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Core-making defects',
      wedgeAgent: 'Quality',
      ticketEstimate: 2_000_000,
    },
    touches: [['call', '2026-10-23', '11:00', 'First call: interested in defect tracking']],
  },
  {
    id: R.rajeshAgarwal,
    name: 'Rajesh Agarwal',
    title: 'Director',
    company: 'Ankleshwar Batch Chemicals',
    phone: '+919824434567',
    email: 'rajesh@ankleshwarbatch.example',
    warmth: 'waiting',
    stages: ['2026-10-14'],
    tags: ['introPending'],
    next: { text: 'Ask Rohit about a common contact', date: lateMonth('2026-11-25') },
    fields: {
      plantLocation: 'Ankleshwar',
      archetype: 'Specialty and batch chemicals',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Batch cycle time varies by shift',
      wedgeAgent: 'Production',
      ticketEstimate: 1_500_000,
    },
    touches: [
      ['note', '2026-10-14', '17:00', 'Found through the Ankleshwar industries association list'],
    ],
  },
  {
    id: R.snehaPillai,
    name: 'Sneha Pillai',
    title: 'Quality Head',
    company: 'Kochi Coatings',
    phone: '+919847445678',
    email: 'sneha@kochicoatings.example',
    warmth: null,
    stages: ['2026-10-15', '2026-10-21'],
    fields: {
      plantLocation: 'Kochi',
      archetype: 'Paints, coatings and adhesives',
      turnoverBand: '< ₹50 Cr',
      roleInDeal: 'Champion',
      pain: 'Shade matching rework',
      wedgeAgent: 'Quality',
      ticketEstimate: 1_000_000,
    },
    touches: [['email', '2026-10-21', '12:00', 'Asked Manisha for an intro']],
  },
  {
    id: R.arjunMalhotra,
    name: 'Arjun Malhotra',
    title: 'VP Manufacturing',
    company: 'Baddi Pharma Formulations',
    phone: '+919816456789',
    email: 'arjun@baddipharma.example',
    warmth: 'cold',
    stages: ['2026-10-01', '2026-10-03', '2026-10-07', '2026-10-20'],
    next: { text: 'Follow up after their audit', date: earlyMonth('2026-12-05') },
    fields: {
      plantLocation: 'Baddi',
      archetype: 'Pharma',
      turnoverBand: '₹250–1,000 Cr',
      roleInDeal: 'User',
      pain: 'Audit preparation takes weeks',
      wedgeAgent: 'Compliance',
      ticketEstimate: 3_000_000,
    },
    touches: [
      [
        'meeting',
        '2026-10-20',
        '10:00',
        'Plant visit; busy with a regulatory audit until December',
      ],
    ],
  },
  {
    id: R.kavitaRao,
    name: 'Kavita Rao',
    title: 'COO',
    company: 'Mysore Agro Foods',
    phone: '+919845467890',
    email: 'kavita@mysoreagrofoods.example',
    warmth: 'warm',
    stages: ['2026-11-02'],
    tags: ['decisionMaker'],
    next: { text: 'Send an intro email', date: day('2026-11-06') },
    fields: {
      plantLocation: 'Mysuru',
      archetype: 'FMCG and food and beverage',
      turnoverBand: '₹50–250 Cr',
      roleInDeal: 'Decision maker',
      pain: 'Packing line OEE',
      wedgeAgent: 'Production',
      ticketEstimate: 2_200_000,
    },
    touches: [['whatsapp', '2026-11-04', '17:00', 'Rohit shared her number']],
  },
]

const dhruvInvestors: RowSpec[] = [
  {
    id: R.arvindMenonDhruv,
    name: 'Arvind Menon',
    title: 'Angel investor',
    phone: '+919820334567',
    email: 'arvind@menonfamily.example',
    warmth: 'warm',
    stages: ['2026-10-09', '2026-10-16', '2026-10-29'],
    tags: ['defence'],
    next: { text: 'Send the defence supplier one-pager', date: day('2026-11-10') },
    introducedBy: R.rohitBose,
    fields: {
      investorType: 'Angel',
      chequeSize: 5_000_000,
      stageFocus: 'Pre-seed and seed',
      thesisFit: 'Former naval officer; keen on defence supply chains',
    },
    touches: [['meeting', '2026-10-29', '11:00', 'First meeting over coffee']],
  },
  {
    id: R.kiranSethi,
    name: 'Kiran Sethi',
    title: 'Partner',
    company: 'Northstar Seed Fund',
    phone: '+919810478901',
    email: 'kiran@northstarseed.example',
    warmth: 'waiting',
    stages: ['2026-10-12', '2026-10-24'],
    tags: ['efNetwork'],
    next: { text: 'Confirm the intro call time', date: day('2026-11-06') },
    introducedBy: R.divyaKapoor,
    fields: {
      investorType: 'VC',
      chequeSize: 20_000_000,
      stageFocus: 'Seed',
      thesisFit: 'Vertical AI for Indian industry',
    },
    touches: [['email', '2026-10-24', '15:00', 'Divya introduced us by email']],
  },
  {
    id: R.vivekChandra,
    name: 'Vivek Chandra',
    title: 'Lead',
    company: 'Deeptech Angels Collective',
    phone: '+919811489012',
    email: 'vivek@deeptechangels.example',
    warmth: null,
    stages: ['2026-10-30'],
    fields: {
      investorType: 'Angel',
      chequeSize: 3_000_000,
      stageFocus: 'Pre-seed',
      thesisFit: 'Robotics and industrial AI',
    },
  },
  {
    id: R.shaliniVerma,
    name: 'Shalini Verma',
    title: 'Investment Director',
    company: 'Kaveri Industrial Ventures',
    phone: '+919821490123',
    email: 'shalini@kaverivent.example',
    warmth: 'warm',
    stages: ['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-22'],
    tags: ['iitBombayAlumni'],
    next: { text: 'Share pilot results', date: midMonth('2026-11-15') },
    fields: {
      investorType: 'CVC',
      chequeSize: 40_000_000,
      stageFocus: 'Series A',
      thesisFit: 'The parent group runs 12 plants',
    },
    touches: [
      ['meeting', '2026-10-08', '14:00', 'First meeting with the ventures team'],
      ['call', '2026-10-22', '16:00', 'Diligence kickoff'],
      ['email', '2026-11-04', '11:30', 'Sent the security questionnaire'],
    ],
  },
  {
    id: R.prakashHegde,
    name: 'Prakash Hegde',
    title: 'Principal',
    company: 'Hegde Family Office',
    phone: '+919845501234',
    email: 'prakash@hegdefo.example',
    warmth: 'cold',
    stages: ['2026-10-05'],
    fields: {
      investorType: 'Family office',
      chequeSize: 10_000_000,
      stageFocus: 'Seed',
      thesisFit: 'Prefers companies with revenue',
    },
    touches: [['email', '2026-10-19', '10:00', 'Not investing before revenue']],
  },
]

const dhruvConnectors: RowSpec[] = [
  {
    id: R.rohitBose,
    name: 'Rohit Bose',
    title: 'Founder',
    company: 'Bose Analytics',
    phone: '+919830512345',
    email: 'rohit@boseanalytics.example',
    warmth: 'warm',
    tags: ['efNetwork'],
    connectsTo: [R.nehaSaxena, R.kavitaRao, { text: 'Kolkata startup founders' }],
    createdOn: '2026-10-08',
    fields: { relationship: 'Alumni', introAskedFor: 'Investors in Kolkata', introMade: true },
    touches: [['call', '2026-10-08', '18:00', 'Offered to introduce an ex-navy angel']],
  },
  {
    id: R.manishaJoshi,
    name: 'Manisha Joshi',
    title: 'Consultant',
    company: 'Joshi Process Consulting',
    phone: '+919822523456',
    email: 'manisha@joshiprocess.example',
    warmth: 'waiting',
    tags: ['introPending'],
    connectsTo: [R.snehaPillai],
    createdOn: '2026-10-15',
    fields: {
      relationship: 'Professional',
      introAskedFor: 'Coatings plants in Kerala',
      introMade: false,
    },
    touches: [['email', '2026-10-21', '12:30', 'Asked for an intro to Sneha Pillai']],
  },
  {
    id: R.tarunMehra,
    name: 'Tarun Mehra',
    title: 'Director',
    company: 'Mehra Logistics',
    phone: '+919811534567',
    email: 'tarun@mehralogistics.example',
    warmth: null,
    connectsTo: [{ text: 'Gurugram auto component cluster' }],
    imported: { date: lateMonth('2026-10-25'), text: "Imported from the founders' sheet" },
    fields: { relationship: 'Friend' },
  },
  {
    id: R.nikhilAgarwal,
    name: 'Nikhil Agarwal',
    title: 'Partner',
    company: 'Agarwal Textiles',
    phone: '+919824545678',
    email: 'nikhil@agarwaltextiles.example',
    warmth: 'cold',
    createdOn: '2026-10-28',
    fields: { relationship: 'Family', introMade: false },
    touches: [['call', '2026-10-28', '18:00', 'Not much reach into manufacturing']],
  },
]

// ---------- Calendar ----------

function event(
  id: Id,
  memberId: Id,
  date: IsoDate,
  start: string,
  end: string,
  title: string,
  attendees: CalendarAttendee[] = [],
  location?: string,
): CalendarEvent {
  return {
    id,
    memberId,
    title,
    start: istInstant(date, start),
    end: istInstant(date, end),
    attendees,
    ...(location ? { location } : {}),
    source: 'sample',
  }
}

function buildEvents(): CalendarEvent[] {
  const dawar = seedIds.members.dawar
  const dhruv = seedIds.members.dhruv
  const dawarMail = { email: 'dawar@utopianautonomy.example', name: 'Dawar' }
  const dhruvMail = { email: 'dhruv@utopianautonomy.example', name: 'Dhruv' }
  return [
    event('e-dawar-01', dawar, '2026-11-05', '11:30', '12:15', 'Call with Rohan Mehta', [
      { email: 'rohan@hosurprecisionforge.example', name: 'Rohan Mehta' },
    ]),
    event('e-dawar-02', dawar, '2026-11-05', '16:00', '16:30', 'Founders sync', [dhruvMail]),
    event(
      'e-dawar-03',
      dawar,
      '2026-11-06',
      '10:00',
      '11:00',
      'Plant walk: Deccan Castings',
      [{ email: 'sunita@deccancastings.example', name: 'Sunita Kulkarni' }],
      'Chakan, Pune',
    ),
    event('e-dawar-04', dawar, '2026-11-09', '15:00', '16:00', 'Pitch practice'),
    event('e-dawar-05', dawar, '2026-11-10', '11:00', '11:45', 'Pilot review: Shakti EV', [
      { email: 'anil@shaktiev.example', name: 'Anil Reddy' },
    ]),
    event('e-dawar-06', dawar, '2026-11-12', '14:00', '14:30', 'GST registration checklist'),
    event('e-dawar-07', dawar, '2026-11-16', '10:30', '11:30', 'Investor update draft review'),
    event('e-dawar-08', dawar, '2026-11-19', '17:00', '18:00', 'Founders weekly review', [
      dhruvMail,
    ]),

    event('e-dhruv-01', dhruv, '2026-11-05', '12:00', '12:45', 'Coffee with Arvind Menon', [
      { email: 'arvind@menonfamily.example', name: 'Arvind Menon' },
    ]),
    event('e-dhruv-02', dhruv, '2026-11-05', '16:00', '16:30', 'Founders sync', [dawarMail]),
    event('e-dhruv-03', dhruv, '2026-11-06', '15:00', '15:30', 'Intro call: Northstar Seed Fund', [
      { email: 'kiran@northstarseed.example', name: 'Kiran Sethi' },
    ]),
    event(
      'e-dhruv-04',
      dhruv,
      '2026-11-11',
      '11:00',
      '13:00',
      'Plant visit: Belagavi Foundry Works',
      [{ email: 'naveen@belagavifoundry.example', name: 'Naveen Gowda' }],
      'Belagavi',
    ),
    event('e-dhruv-05', dhruv, '2026-11-13', '10:00', '11:00', 'Demo dry run'),
    event('e-dhruv-06', dhruv, '2026-11-17', '14:30', '16:00', 'Founder meetup', [], 'Bengaluru'),
    event('e-dhruv-07', dhruv, '2026-11-18', '16:00', '17:00', 'Interview: ML engineer'),
    event('e-dhruv-08', dhruv, '2026-11-20', '11:00', '12:00', 'Board meeting prep', [dawarMail]),
  ]
}

// ---------- Assembly ----------

const SHEETS: {
  id: Id
  memberId: Id
  slug: string
  template: TemplateKey
  position: number
  rows: RowSpec[]
}[] = [
  {
    id: seedIds.sheets.dawarCustomers,
    memberId: seedIds.members.dawar,
    slug: 'customers',
    template: 'customers',
    position: 0,
    rows: dawarCustomers,
  },
  {
    id: seedIds.sheets.dawarInvestors,
    memberId: seedIds.members.dawar,
    slug: 'investors',
    template: 'investors',
    position: 1,
    rows: dawarInvestors,
  },
  {
    id: seedIds.sheets.dawarAdvisors,
    memberId: seedIds.members.dawar,
    slug: 'advisors',
    template: 'advisors',
    position: 2,
    rows: dawarAdvisors,
  },
  {
    id: seedIds.sheets.dawarConnectors,
    memberId: seedIds.members.dawar,
    slug: 'connectors',
    template: 'connectors',
    position: 3,
    rows: dawarConnectors,
  },
  {
    id: seedIds.sheets.dawarServiceProviders,
    memberId: seedIds.members.dawar,
    slug: 'service-providers',
    template: 'serviceProviders',
    position: 4,
    rows: dawarServiceProviders,
  },
  {
    id: seedIds.sheets.dhruvCustomers,
    memberId: seedIds.members.dhruv,
    slug: 'customers',
    template: 'customers',
    position: 0,
    rows: dhruvCustomers,
  },
  {
    id: seedIds.sheets.dhruvInvestors,
    memberId: seedIds.members.dhruv,
    slug: 'investors',
    template: 'investors',
    position: 1,
    rows: dhruvInvestors,
  },
  {
    id: seedIds.sheets.dhruvConnectors,
    memberId: seedIds.members.dhruv,
    slug: 'connectors',
    template: 'connectors',
    position: 2,
    rows: dhruvConnectors,
  },
]

/** The full sample data set. Pure and deterministic; returns fresh objects on every call. */
export function buildSeed(): SeedData {
  const sheets: Sheet[] = []
  const rows: Row[] = []
  const history: HistoryEntry[] = []
  for (const def of SHEETS) {
    const sheet = buildSheet(def)
    sheets.push(sheet)
    def.rows.forEach((spec, position) => {
      const built = buildRow(sheet, position, spec)
      rows.push(built.row)
      built.history.forEach((entry, i) => {
        history.push({
          ...entry,
          id: `h-${spec.id.slice(2)}-${String(i + 1).padStart(2, '0')}`,
        })
      })
    })
  }
  return {
    members: members.map((m) => ({ ...m })),
    sheets,
    tags: buildTags(),
    rows,
    history,
    calendarEvents: buildEvents(),
  }
}
