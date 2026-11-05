/** Shared fixtures for the domain unit tests. Invented data only. */
import { buildSheetSchema } from '@/domain/templates'
import type { DomainContext, Row, Sheet, TemplateKey } from '@/domain/types'

/** 5 Nov 2026, 10:00 IST (a Thursday). */
export const now = new Date('2026-11-05T04:30:00.000Z')

export function makeIds(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

export function makeCtx(at: Date = now, actorId = 'member-dawar'): DomainContext {
  return { now: at, actorId, newId: makeIds('h') }
}

export function makeSheet(
  template: TemplateKey = 'customers',
  overrides: Partial<Sheet> = {},
): Sheet {
  const { columns, stages } = buildSheetSchema(template, makeIds(template))
  return {
    id: `sheet-${template}`,
    memberId: 'member-dawar',
    slug: template.toLowerCase(),
    name: template,
    template,
    position: 0,
    columns,
    stages,
    createdAt: '2026-10-01T04:30:00.000Z',
    updatedAt: '2026-10-01T04:30:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

export function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'row-1',
    sheetId: 'sheet-customers',
    memberId: 'member-dawar',
    position: 0,
    name: 'Rohan Mehta',
    company: 'Hosur Precision Forge',
    title: 'Plant head',
    phone: '+919845012345',
    email: 'rohan@hpf.example',
    linkedin: '',
    links: [],
    warmth: null,
    stageIndex: null,
    stageDates: {},
    lost: null,
    tagIds: [],
    nextAction: null,
    introducedBy: null,
    connectsTo: [],
    notes: '',
    files: [],
    fields: {},
    lastTouchAt: null,
    createdAt: '2026-10-01T04:30:00.000Z',
    updatedAt: '2026-10-01T04:30:00.000Z',
    createdBy: 'member-dawar',
    updatedBy: 'member-dawar',
    deletedAt: null,
    ...overrides,
  }
}

/** Stage id of position `i` in `sheet`. */
export function sid(sheet: Sheet, i: number): string {
  const stage = sheet.stages[i]
  if (!stage) throw new Error(`No stage ${i}`)
  return stage.id
}
