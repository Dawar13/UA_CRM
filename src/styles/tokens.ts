/**
 * Design tokens: the single source of truth for colour, type, radii and motion.
 *
 * `pnpm tokens` turns this file into `src/styles/tokens.css`. Never edit the CSS by hand;
 * `tests/unit/tokens.contrast.test.ts` fails if the two drift apart.
 *
 * Values come from CLAUDE.md §3.2 and §3.3. Where a hex failed the contrast test it was
 * adjusted to the nearest passing value with the same intent, and the change is logged in
 * docs/DECISIONS.md (search for "contrast").
 */

export type ThemeName = 'light' | 'dark'

/** Brand ramp, built in OKLCH at hue ~240. Theme-independent. */
export const brand = {
  50: '#EBF9FF',
  100: '#D3F2FF',
  200: '#AAE3FF',
  300: '#7ECEFF',
  400: '#46B5F9',
  500: '#1CA6EF',
  600: '#007BC1',
  700: '#006AA8',
  800: '#005387',
  900: '#003C68',
} as const

export type BrandStep = keyof typeof brand

/** Sampled soft gradient. Only for the top strip, sign-in background and empty-state art. */
export const softGradient = {
  from: '#6CAAFD',
  via: '#B5DBFF',
  to: '#70BEFF',
  css: 'linear-gradient(90deg, #6CAAFD 0%, #B5DBFF 50%, #70BEFF 100%)',
} as const

/**
 * Per-theme colour roles. Keys become CSS custom properties in kebab-case
 * (`surfaceSubtle` → `--surface-subtle`).
 */
export interface ThemeColours {
  /** Page background. */
  bg: string
  surfaceSubtle: string
  surfaceRaised: string
  border: string
  /** ≥3:1 on bg, surface-subtle, surface-raised and row-selected; used for hollow stage dots. */
  borderStrong: string
  text: string
  textSecondary: string
  textMuted: string
  /** Link and accent text. */
  link: string
  /** Primary button fill and its text colour. */
  primary: string
  primaryHover: string
  primaryFg: string
  /** Visible 2px focus ring. */
  focusRing: string
  /** Row hover tint. */
  rowHover: string
  /** Expanded or selected row tint. */
  rowSelected: string
  /** Brand tint for hover on brand elements and the "Internal CRM" pill background. */
  brandTint: string
  brandTintStrong: string
  /** Text on brandTint (the "Internal CRM" pill). */
  brandTintFg: string
  /** Stage dots. */
  stageDone: string
  stageCurrentRing: string
  stageFuture: string
  stageWon: string
  stageLost: string
  /** Line joining tracker dots after the current stage. */
  stageLine: string
  warm: string
  warmBg: string
  waiting: string
  waitingBg: string
  cold: string
  coldBg: string
  /** Lost text and dot. */
  lost: string
  /** Overdue next-action text. */
  overdue: string
  /** "Today" next-action text. */
  today: string
  /** Neutral pill background (tags, dropdown values). */
  pillBg: string
  pillBorder: string
  /** Popover and menu shadow colour. */
  shadow: string
  /** Scrim behind dialogs. */
  overlay: string
}

export const themes: Record<ThemeName, ThemeColours> = {
  light: {
    bg: '#FFFFFF',
    surfaceSubtle: '#F8FAFD',
    surfaceRaised: '#FFFFFF',
    border: '#E0E5E9',
    // CLAUDE.md #8A9399 was 2.99:1 on surface-subtle; nearest passing value.
    borderStrong: '#858E94',
    text: '#141C21',
    textSecondary: '#565F65',
    // CLAUDE.md #6B737A was 4.48:1 on brand-50 (expanded row); nearest passing value.
    textMuted: '#687078',
    link: brand[700],
    primary: brand[600],
    primaryHover: brand[700],
    primaryFg: '#FFFFFF',
    // brand-400 is 2.27:1 on white, below the 3:1 floor for focus indicators. brand-600 keeps
    // the blue intent at 4.56:1.
    focusRing: brand[600],
    rowHover: '#F8FAFD',
    rowSelected: brand[50],
    brandTint: brand[50],
    brandTintStrong: brand[100],
    brandTintFg: brand[700],
    stageDone: brand[600],
    stageCurrentRing: brand[200],
    stageFuture: '#858E94',
    stageWon: '#16A34A',
    stageLost: '#DC2626',
    stageLine: '#E0E5E9',
    warm: '#15803D',
    warmBg: '#DCFCE7',
    waiting: '#854D0E',
    waitingBg: '#FEF3C7',
    cold: '#B91C1C',
    coldBg: '#FEE2E2',
    lost: '#DC2626',
    overdue: '#B91C1C',
    today: brand[700],
    pillBg: '#F8FAFD',
    pillBorder: '#E0E5E9',
    shadow: 'rgba(20, 28, 33, 0.12)',
    overlay: 'rgba(20, 28, 33, 0.32)',
  },
  dark: {
    bg: '#071117',
    surfaceSubtle: '#0F1A21',
    surfaceRaised: '#17232C',
    border: '#27353E',
    // CLAUDE.md #5E6A72 was 2.88:1 on surface-raised; nearest passing value.
    borderStrong: '#66737B',
    text: '#E5ECF1',
    textSecondary: '#A6AFB7',
    textMuted: '#8C969E',
    link: brand[400],
    primary: brand[600],
    primaryHover: brand[700],
    primaryFg: '#FFFFFF',
    focusRing: brand[400],
    rowHover: '#0F1A21',
    // Dark equivalent of brand-50: a deep blue tint that keeps muted text ≥4.5:1.
    rowSelected: '#0B2230',
    brandTint: '#0B2230',
    brandTintStrong: '#0E2C3F',
    brandTintFg: brand[300],
    stageDone: brand[400],
    stageCurrentRing: brand[800],
    stageFuture: '#66737B',
    stageWon: '#4ADE80',
    stageLost: '#F87171',
    stageLine: '#27353E',
    warm: '#86EFAC',
    warmBg: '#0F2A1B',
    waiting: '#FCD34D',
    waitingBg: '#2B2108',
    cold: '#FCA5A5',
    coldBg: '#2E1111',
    lost: '#F87171',
    overdue: '#FCA5A5',
    today: brand[400],
    pillBg: '#0F1A21',
    pillBorder: '#27353E',
    shadow: 'rgba(0, 0, 0, 0.5)',
    overlay: 'rgba(0, 0, 0, 0.56)',
  },
}

/** Tag hues: a coloured 6px dot inside a neutral pill. New tags take the least-used hue. */
export const tagPalette = [
  { name: 'indigo', hex: '#6366F1' },
  { name: 'violet', hex: '#8B5CF6' },
  { name: 'pink', hex: '#EC4899' },
  { name: 'orange', hex: '#F97316' },
  { name: 'amber', hex: '#F59E0B' },
  { name: 'lime', hex: '#65A30D' },
  { name: 'teal', hex: '#14B8A6' },
  { name: 'slate', hex: '#64748B' },
] as const

export type TagColour = (typeof tagPalette)[number]['name']
export const tagColourNames = tagPalette.map((t) => t.name) as TagColour[]

/** Type scale in px. 14 is the base. */
export const typeScale = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const

export const fontWeights = { regular: 400, medium: 500, semibold: 600 } as const

export const lineHeights = { ui: 1.45, long: 1.6 } as const

export const fonts = {
  sans: "'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "'Geist Mono Variable', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
} as const

/** Corner radii in px. */
export const radii = {
  control: 6,
  brandMark: 8,
  card: 10,
} as const

/** Fixed layout sizes in px. */
export const layout = {
  stripHeight: 3,
  headerHeight: 52,
  sheetBarHeight: 40,
  rowHeight: 40,
  rowHeightCompact: 32,
  panelWidth: 320,
} as const

/** Motion: 120 to 180 ms, ease-out. */
export const motion = {
  fast: 120,
  base: 180,
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

/** Kebab-case a camelCase token key. */
export function toCssVarName(key: string): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}
