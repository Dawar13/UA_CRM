/**
 * The six sheet templates, exactly as CLAUDE.md §2.4. Pure.
 *
 * CONTRACT (signatures are fixed; bodies are implemented in M0.3).
 */
import type { ColumnDef, StageDef, TemplateKey } from './types'

/** The 15 customer archetypes, in CLAUDE.md order. */
export declare const customerArchetypes: readonly string[]

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

export declare const templates: Readonly<Record<TemplateKey, TemplateDef>>

/**
 * Core columns every sheet has, in order: Name, Company, Title, Phone, Email, LinkedIn, Links,
 * Warmth, Stage (only if the sheet has stages), Tags, Last touch, Next action, Next date,
 * Introduced by, Connects to, Notes, Files. All `system: true`.
 */
export declare function coreColumns(hasStages: boolean): Omit<ColumnDef, 'id' | 'position'>[]

/**
 * Full column and stage definitions for a new sheet from a template. `newId` makes ids.
 * Default visibility: Links, Files, Introduced by, Connects to, Notes and LinkedIn hidden in
 * the grid; everything else visible. Default widths suit 1280px screens.
 */
export declare function buildSheetSchema(
  template: TemplateKey,
  newId: () => string,
): { columns: ColumnDef[]; stages: StageDef[] }
