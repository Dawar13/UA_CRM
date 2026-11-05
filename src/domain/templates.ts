/**
 * The six sheet templates, exactly as CLAUDE.md §2.4. Pure.
 *
 * Column keys: core columns use their CoreFieldKey; extra columns use camelCase keys into
 * `row.fields`. Currency values are stored in rupees as plain numbers and shown with
 * `formatCurrency` (Ticket estimate is stored in rupees, shown as ₹ L).
 */
import type { ColumnDef, CoreFieldKey, StageDef, TemplateKey } from './types'

/** The 15 customer archetypes, in CLAUDE.md order. */
export const customerArchetypes: readonly string[] = [
  'Auto and EV component makers',
  'Precision job shops',
  'Foundries and forging shops',
  'Steel and metals processing',
  'Electronics manufacturing',
  'Consumer durables and appliances',
  'Plastics, rubber and packaging',
  'Specialty and batch chemicals',
  'Pharma',
  'Paints, coatings and adhesives',
  'FMCG and food and beverage',
  'Oil and gas, refining and petrochemicals',
  'Cement and building materials',
  'Hardware OEMs with supplier networks',
  'Industrial distributors, MRO and defence suppliers',
]

/**
 * Annual turnover bands for Customers. CLAUDE.md names the column but not the bands; these
 * follow the Indian MSME cut-offs loosely (small and medium plants under ₹250 Cr).
 */
export const turnoverBands: readonly string[] = [
  '< ₹50 Cr',
  '₹50–250 Cr',
  '₹250–1,000 Cr',
  '> ₹1,000 Cr',
]

export interface TemplateDef {
  key: TemplateKey
  /** Default sheet name: "Customers", "Investors", "Advisors and experts", "Connectors",
   * "Service providers", "Blank". */
  name: string
  /** Extra (custom) columns, after the core columns. */
  extraColumns: readonly Omit<ColumnDef, 'id' | 'position' | 'hidden'>[]
  /** Stage names; the last is the win. Empty for no stages. */
  stages: readonly string[]
}

type ExtraColumn = Omit<ColumnDef, 'id' | 'position' | 'hidden'>

function extra(
  key: string,
  label: string,
  type: ColumnDef['type'],
  width: number,
  options?: readonly string[],
): ExtraColumn {
  const column: ExtraColumn = { key, label, type, system: false, width }
  if (options) column.options = [...options]
  return column
}

export const templates: Readonly<Record<TemplateKey, TemplateDef>> = {
  customers: {
    key: 'customers',
    name: 'Customers',
    extraColumns: [
      extra('plantLocation', 'Plant location', 'text', 150),
      extra('archetype', 'Archetype', 'dropdown', 220, customerArchetypes),
      extra('turnoverBand', 'Turnover band', 'dropdown', 140, turnoverBands),
      extra('roleInDeal', 'Role in deal', 'dropdown', 140, [
        'Decision maker',
        'Champion',
        'User',
        'Blocker',
      ]),
      extra('pain', 'Pain', 'longText', 240),
      extra('wedgeAgent', 'Wedge agent', 'dropdown', 140, [
        'Maintenance',
        'Quality',
        'Production',
        'Procurement',
        'Quote',
        'Energy',
        'Compliance',
      ]),
      // Stored in rupees, shown as ₹ L.
      extra('ticketEstimate', 'Ticket estimate (₹ L/yr)', 'currency', 170),
    ],
    stages: [
      'Identified',
      'Intro asked',
      'First call',
      'Plant visit',
      'Pilot scoped',
      'Pilot live',
      'Paid',
    ],
  },
  investors: {
    key: 'investors',
    name: 'Investors',
    extraColumns: [
      extra('investorType', 'Investor type', 'dropdown', 140, [
        'Angel',
        'VC',
        'CVC',
        'Family office',
      ]),
      extra('chequeSize', 'Cheque size', 'currency', 130),
      extra('stageFocus', 'Stage focus', 'text', 140),
      extra('thesisFit', 'Thesis fit', 'longText', 220),
    ],
    stages: ['Researching', 'Intro asked', 'First meeting', 'Diligence', 'Term sheet', 'Committed'],
  },
  advisors: {
    key: 'advisors',
    name: 'Advisors and experts',
    extraColumns: [
      extra('expertise', 'Expertise', 'text', 180),
      extra('wantFromThem', 'What we want from them', 'longText', 240),
      extra('arrangement', 'Arrangement', 'dropdown', 150, ['Informal', 'Advisory equity']),
    ],
    stages: ['Identified', 'Approached', 'Active'],
  },
  connectors: {
    key: 'connectors',
    name: 'Connectors',
    extraColumns: [
      extra('relationship', 'Relationship', 'dropdown', 140, [
        'Friend',
        'Alumni',
        'Family',
        'Professional',
      ]),
      extra('introAskedFor', 'Intro asked for', 'text', 200),
      extra('introMade', 'Intro made', 'checkbox', 110),
    ],
    stages: [],
  },
  serviceProviders: {
    key: 'serviceProviders',
    name: 'Service providers',
    extraColumns: [
      extra('service', 'Service', 'dropdown', 140, [
        'CA',
        'Lawyer',
        'Incorporation',
        'Visa',
        'Trademark',
        'Other',
      ]),
      extra('quote', 'Quote', 'currency', 120),
      extra('docsShared', 'Docs shared', 'checkbox', 120),
      extra('deadline', 'Deadline', 'date', 120),
    ],
    stages: ['Shortlisted', 'Engaged', 'Done'],
  },
  blank: {
    key: 'blank',
    name: 'Blank',
    extraColumns: [],
    stages: [],
  },
}

/**
 * Core columns hidden in the grid by default. Next date is hidden because the Next action cell
 * already shows its date.
 */
const HIDDEN_BY_DEFAULT: ReadonlySet<CoreFieldKey> = new Set<CoreFieldKey>([
  'linkedin',
  'links',
  'nextDate',
  'introducedBy',
  'connectsTo',
  'notes',
  'files',
])

/**
 * Default grid order of the visible core columns, exactly the CLAUDE.md §2.1 layout (Name,
 * Warmth, Stage, Tags, Last touch, Next) so the at-a-glance columns fit at 1440px with the side
 * panel open; then contact details. Extra columns follow, then the hidden ones.
 */
const LEADING_CORE: readonly CoreFieldKey[] = [
  'name',
  'warmth',
  'stage',
  'tags',
  'lastTouch',
  'nextAction',
  'company',
  'title',
  'phone',
  'email',
]

const CORE: readonly {
  key: CoreFieldKey
  label: string
  type: ColumnDef['type']
  width: number
}[] = [
  { key: 'name', label: 'Name', type: 'text', width: 220 },
  { key: 'company', label: 'Company', type: 'text', width: 180 },
  { key: 'title', label: 'Title', type: 'text', width: 160 },
  { key: 'phone', label: 'Phone', type: 'phone', width: 150 },
  { key: 'email', label: 'Email', type: 'email', width: 200 },
  { key: 'linkedin', label: 'LinkedIn', type: 'url', width: 180 },
  { key: 'links', label: 'Links', type: 'url', width: 180 },
  { key: 'warmth', label: 'Warmth', type: 'warmth', width: 104 },
  { key: 'stage', label: 'Stage', type: 'stage', width: 124 },
  { key: 'tags', label: 'Tags', type: 'tags', width: 240 },
  { key: 'lastTouch', label: 'Last touch', type: 'lastTouch', width: 100 },
  { key: 'nextAction', label: 'Next action', type: 'nextAction', width: 280 },
  { key: 'nextDate', label: 'Next date', type: 'date', width: 110 },
  { key: 'introducedBy', label: 'Introduced by', type: 'personLink', width: 160 },
  { key: 'connectsTo', label: 'Connects to', type: 'personLink', width: 200 },
  { key: 'notes', label: 'Notes', type: 'longText', width: 240 },
  { key: 'files', label: 'Files', type: 'files', width: 120 },
]

/**
 * Core columns every sheet has, in CLAUDE.md §2.3 definition order: Name, Company, Title, Phone,
 * Email, LinkedIn, Links, Warmth, Stage (only if the sheet has stages), Tags, Last touch,
 * Next action, Next date, Introduced by, Connects to, Notes, Files. All `system: true`.
 * LinkedIn, Links, Next date, Introduced by, Connects to, Notes and Files are hidden.
 */
export function coreColumns(hasStages: boolean): Omit<ColumnDef, 'id' | 'position'>[] {
  return CORE.filter((c) => hasStages || c.key !== 'stage').map((c) => ({
    ...c,
    system: true,
    hidden: HIDDEN_BY_DEFAULT.has(c.key),
  }))
}

/**
 * Full column and stage definitions for a new sheet from a template. `newId` makes ids
 * (columns first, in position order, then stages).
 * Default order (positions 0..n, and the order of the returned array), following the
 * CLAUDE.md §2.1 layout: Name, Warmth, Stage (if any), Tags, Last touch, Next action, Company,
 * Title, Phone, Email, then the template's extra columns, then the hidden-by-default core
 * columns (LinkedIn, Links, Next date, Introduced by, Connects to, Notes, Files, in §2.3 order).
 * Everything except those seven is visible. Default widths suit 1280px screens.
 */
export function buildSheetSchema(
  template: TemplateKey,
  newId: () => string,
): { columns: ColumnDef[]; stages: StageDef[] } {
  const def = templates[template]
  const core = coreColumns(def.stages.length > 0)
  const byKey = new Map(core.map((c) => [c.key, c]))
  const leading = LEADING_CORE.flatMap((key) => {
    const column = byKey.get(key)
    return column ? [column] : []
  })
  const extras = def.extraColumns.map((c) => ({
    ...c,
    ...(c.options ? { options: [...c.options] } : {}),
    hidden: false,
  }))
  const hidden = core.filter((c) => c.hidden)
  const columns: ColumnDef[] = [...leading, ...extras, ...hidden].map((c, position) => ({
    id: newId(),
    ...c,
    position,
  }))
  const stages: StageDef[] = def.stages.map((name) => ({ id: newId(), name }))
  return { columns, stages }
}
