/**
 * Design tokens: the single source of truth for colour, type, radii and motion.
 *
 * `pnpm tokens` turns this file into `src/styles/tokens.css`. Never edit the CSS by hand;
 * `tests/unit/tokens.contrast.test.ts` fails if the two drift apart.
 *
 * Milestone M0.6 (the founders' redesign, D-027): paper white surfaces; a blue palette that runs
 * from navy to white (#03045e #033e8a #0078b7 #0096c8 #00b4d7 #48cae4 #91e0ef #aee8f4 #caf1f8
 * #ffffff) for folders, stages and the pipeline capsule; and an earthy "field" palette (olive and
 * sage, yellow ochre, orange and brick, sand at zero) for warmth and the activity chart.
 * Where a hex failed the contrast test it was adjusted to the nearest passing value with the same
 * intent, and the change is logged in docs/DECISIONS.md (search for "contrast").
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

/** The blue palette from navy to white. Theme-independent reference values. */
export const bluePalette = [
  '#03045E',
  '#033E8A',
  '#0078B7',
  '#0096C8',
  '#00B4D7',
  '#48CAE4',
  '#91E0EF',
  '#AEE8F4',
  '#CAF1F8',
  '#FFFFFF',
] as const

/** The brand mark: a soft sky gradient behind a white "UA". */
export const brandMark = {
  from: '#6CC4F6',
  to: '#1C9BEA',
  css: 'linear-gradient(160deg, #6CC4F6 0%, #1C9BEA 100%)',
} as const

/** Sampled soft gradient. Only for the sign-in background and empty-state art. */
export const softGradient = {
  from: '#6CAAFD',
  via: '#B5DBFF',
  to: '#70BEFF',
  css: 'linear-gradient(90deg, #6CAAFD 0%, #B5DBFF 50%, #70BEFF 100%)',
} as const

/** How many folder colours there are; sheet n takes folder (n mod FOLDER_COUNT) + 1. */
export const FOLDER_COUNT = 5
/** Stage ramp steps for open stages; a sheet's stages are spread across them. */
export const STAGE_STEPS = 6
/** Pipeline capsule shades, light to deep (reversed in dark). */
export const CAPSULE_STEPS = 8

/**
 * Per-theme colour roles. Keys become CSS custom properties in kebab-case
 * (`surfaceSubtle` → `--surface-subtle`, `stage1` → `--stage1`).
 */
export interface ThemeColours {
  // ---------- Surfaces and text ----------
  /** Page background: paper white. */
  bg: string
  /** Mist: the side panel and wells. */
  surfaceSubtle: string
  surfaceRaised: string
  /** Hover and highlight on raised surfaces: menu items, secondary buttons. */
  surfaceHover: string
  border: string
  /** ≥3:1 on bg, surface-subtle, surface-raised and row-selected; hollow outlines. */
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
  /** Danger button fill (destructive confirmations) and its text colour. */
  danger: string
  dangerHover: string
  dangerFg: string
  /** Visible 2px focus ring. */
  focusRing: string
  /** Row hover tint. */
  rowHover: string
  /** Expanded or selected row tint. */
  rowSelected: string
  /** Spreadsheet gridlines between cells and rows, and the shaded header row. */
  gridLine: string
  gridHeader: string
  /** Brand tint: the "Internal CRM" label and soft highlights. */
  brandTint: string
  brandTintStrong: string
  brandTintFg: string
  /** Icon tiles, count badges and other quiet fills. */
  tile: string
  /** Neutral pill background and border (dropdown values). */
  pillBg: string
  pillBorder: string
  /** Popover and menu shadow colour. */
  shadow: string
  /** Scrim behind dialogs. */
  overlay: string
  /** Hairline shadow under cards. */
  cardShadow: string
  /** Frosted card on the folder front. */
  glass: string
  glassBorder: string
  glassShadow: string

  // ---------- Dates ----------
  /** "Today" chip: a blue gradient with ink text. */
  todayBgTop: string
  todayBg: string
  todayFg: string
  /** Blue text for today (legacy role, kept for plain date text). */
  today: string
  /** Overdue next-action text. */
  overdue: string

  // ---------- Stages ----------
  /** Stage ramp for open stages, light (early) to deep (far along). */
  stage1: string
  stage2: string
  stage3: string
  stage4: string
  stage5: string
  stage6: string
  /** Text on each ramp step. */
  stageFg1: string
  stageFg2: string
  stageFg3: string
  stageFg4: string
  stageFg5: string
  stageFg6: string
  /** Stages not reached yet. */
  stageTrack: string
  /** Stages reached before a loss. */
  stageLostDone: string
  /** The won stage (olive) and the lost stage (brick). */
  stageWon: string
  stageLost: string
  /** Text on the won and lost stage blocks. */
  stageWonFg: string
  stageLostFg: string
  /** Legacy dot roles (the design showcase's history section). */
  stageDone: string
  stageCurrentRing: string
  stageFuture: string
  stageLine: string
  /** Won label text ("Paid") and lost text. */
  wonFg: string
  lost: string

  // ---------- Warmth (field palette) ----------
  warm: string
  warmBg: string
  warmBgTop: string
  warmBorder: string
  warmCell: string
  warmShade1: string
  warmShade2: string
  warmShade3: string
  waiting: string
  waitingBg: string
  waitingBgTop: string
  waitingBorder: string
  waitingCell: string
  waitingShade1: string
  waitingShade2: string
  waitingShade3: string
  cold: string
  coldBg: string
  coldBgTop: string
  coldBorder: string
  coldCell: string
  coldShade1: string
  coldShade2: string
  coldShade3: string
  /** "Not set" squares: sand with a sand outline. */
  sandCell: string
  sandLine: string
  /** Lost people in the pipeline card: charcoal dots. */
  lostDot: string

  // ---------- Activity field (last 30 days) ----------
  fieldUp1: string
  fieldUp2: string
  fieldUp3: string
  fieldUp4: string
  fieldUp5: string
  fieldDown1: string
  fieldDown2: string
  fieldDown3: string
  fieldDown4: string
  /** A stage moved forward that day. */
  fieldMoved: string
  /** The sand zero line. */
  fieldZero: string
  /** Weekend column shading. */
  fieldWeekend: string
  /** Outline on today's column. */
  todayLine: string

  // ---------- Folders (sheet tabs and fronts) ----------
  /** Text on folder tabs and fronts. */
  folderFg: string
  folderRule: string
  folder1Top: string
  folder1Bottom: string
  folder2Top: string
  folder2Bottom: string
  folder3Top: string
  folder3Bottom: string
  folder4Top: string
  folder4Bottom: string
  folder5Top: string
  folder5Bottom: string

  // ---------- Pipeline capsule ----------
  capsule1: string
  capsule2: string
  capsule3: string
  capsule4: string
  capsule5: string
  capsule6: string
  capsule7: string
  capsule8: string
}

const INK = '#0E1A22'
const SNOW = '#F2F7FA'

export const themes: Record<ThemeName, ThemeColours> = {
  light: {
    bg: '#FFFFFF',
    surfaceSubtle: '#F7F9FB',
    surfaceRaised: '#FFFFFF',
    surfaceHover: '#F1F4F7',
    border: '#E4E9ED',
    borderStrong: '#858E94',
    text: INK,
    textSecondary: '#4A5761',
    // #68747D was 4.47:1 on row-selected; nearest passing value.
    textMuted: '#646F78',
    link: '#0B6AA6',
    primary: '#0078B7',
    primaryHover: '#03689F',
    primaryFg: '#FFFFFF',
    danger: '#B91C1C',
    dangerHover: '#991B1B',
    dangerFg: '#FFFFFF',
    focusRing: '#0078B7',
    rowHover: '#F6F9FB',
    rowSelected: '#F0F8FE',
    gridLine: '#DCE3E8',
    gridHeader: '#F3F6F8',
    brandTint: '#EAF8FC',
    brandTintStrong: '#CAF1F8',
    brandTintFg: '#0B6AA6',
    tile: '#EEF2F5',
    pillBg: '#EEF2F5',
    pillBorder: '#E4E9ED',
    shadow: 'rgba(14, 26, 34, 0.12)',
    overlay: 'rgba(14, 26, 34, 0.32)',
    cardShadow: '0 1px 2px rgba(14, 26, 34, 0.04)',
    glass: 'rgba(255, 255, 255, 0.74)',
    glassBorder: 'rgba(255, 255, 255, 0.9)',
    glassShadow: '0 1px 2px rgba(14, 26, 34, 0.04), 0 12px 32px -14px rgba(14, 26, 34, 0.22)',

    todayBgTop: '#48CAE4',
    todayBg: '#00B4D7',
    todayFg: INK,
    today: '#0B6AA6',
    overdue: '#A93A26',

    stage1: '#CAF1F8',
    stage2: '#91E0EF',
    stage3: '#48CAE4',
    stage4: '#00B4D7',
    stage5: '#0096C8',
    stage6: '#0078B7',
    stageFg1: INK,
    stageFg2: INK,
    stageFg3: INK,
    stageFg4: INK,
    stageFg5: INK,
    stageFg6: '#FFFFFF',
    stageTrack: '#EDF2F6',
    stageLostDone: '#D9DFE4',
    stageWon: '#6FB257',
    stageLost: '#D9603D',
    stageWonFg: INK,
    stageLostFg: INK,
    stageDone: '#0096C8',
    stageCurrentRing: INK,
    stageFuture: '#858E94',
    stageLine: '#E4E9ED',
    wonFg: '#3D7A2A',
    lost: '#A93A26',

    warm: '#3D6A29',
    warmBg: '#E3EFD3',
    warmBgTop: '#F1F7E8',
    warmBorder: '#D3E5BE',
    warmCell: '#8CC36F',
    warmShade1: '#CFE3B6',
    warmShade2: '#A5CF86',
    warmShade3: '#6FB257',
    waiting: '#77570F',
    waitingBg: '#F7E9C2',
    waitingBgTop: '#FCF5E0',
    waitingBorder: '#EFDDA8',
    waitingCell: '#EBC155',
    waitingShade1: '#F5E3A8',
    waitingShade2: '#EECB5E',
    waitingShade3: '#DDA537',
    cold: '#963520',
    coldBg: '#F6D7CB',
    coldBgTop: '#FBEAE3',
    coldBorder: '#F0C8B9',
    coldCell: '#D9603D',
    coldShade1: '#F0BDA6',
    coldShade2: '#E27E57',
    coldShade3: '#C4472E',
    sandCell: '#F6F0E0',
    sandLine: '#D9CBA6',
    lostDot: '#3C4248',

    fieldUp1: '#D6E7C0',
    fieldUp2: '#B7D79C',
    fieldUp3: '#95C779',
    fieldUp4: '#71B35A',
    fieldUp5: '#4F9C46',
    fieldDown1: '#F1CD62',
    fieldDown2: '#EC9C47',
    fieldDown3: '#D9603D',
    fieldDown4: '#B23B2A',
    fieldMoved: '#3A9AD9',
    fieldZero: '#EADFC2',
    fieldWeekend: 'rgba(14, 26, 34, 0.035)',
    todayLine: 'rgba(14, 26, 34, 0.55)',

    folderFg: INK,
    folderRule: 'rgba(14, 26, 34, 0.12)',
    folder1Top: '#0096C8',
    folder1Bottom: '#00B4D7',
    folder2Top: '#00B4D7',
    folder2Bottom: '#48CAE4',
    folder3Top: '#48CAE4',
    folder3Bottom: '#91E0EF',
    folder4Top: '#91E0EF',
    folder4Bottom: '#AEE8F4',
    folder5Top: '#AEE8F4',
    folder5Bottom: '#CAF1F8',

    capsule1: '#CAF1F8',
    capsule2: '#AEE8F4',
    capsule3: '#91E0EF',
    capsule4: '#48CAE4',
    capsule5: '#00B4D7',
    capsule6: '#0096C8',
    capsule7: '#0078B7',
    capsule8: '#033E8A',
  },
  dark: {
    bg: '#0A1116',
    surfaceSubtle: '#0C151B',
    surfaceRaised: '#0E181F',
    surfaceHover: '#16232B',
    border: '#1C2932',
    borderStrong: '#66737B',
    text: '#E6EDF1',
    textSecondary: '#A9B5BD',
    textMuted: '#87949D',
    link: '#7CC8F5',
    primary: '#0078B7',
    primaryHover: '#03689F',
    primaryFg: '#FFFFFF',
    danger: '#DC2626',
    dangerHover: '#B91C1C',
    dangerFg: '#FFFFFF',
    focusRing: '#48CAE4',
    rowHover: '#0E1920',
    rowSelected: '#0D2130',
    gridLine: '#22303A',
    gridHeader: '#0F1A21',
    brandTint: '#0D2130',
    brandTintStrong: '#103049',
    brandTintFg: '#7CC8F5',
    tile: '#16232B',
    pillBg: '#16232B',
    pillBorder: '#1C2932',
    shadow: 'rgba(0, 0, 0, 0.5)',
    overlay: 'rgba(0, 0, 0, 0.56)',
    cardShadow: 'none',
    glass: 'rgba(12, 20, 26, 0.66)',
    glassBorder: 'rgba(255, 255, 255, 0.07)',
    glassShadow: '0 1px 2px rgba(0, 0, 0, 0.2), 0 12px 32px -14px rgba(0, 0, 0, 0.6)',

    todayBgTop: '#48CAE4',
    todayBg: '#00B4D7',
    todayFg: INK,
    today: '#7CC8F5',
    overdue: '#F2A58E',

    stage1: '#073A5C',
    stage2: '#0A5482',
    stage3: '#0078B7',
    stage4: '#0096C8',
    stage5: '#00B4D7',
    stage6: '#48CAE4',
    stageFg1: SNOW,
    stageFg2: SNOW,
    stageFg3: '#FFFFFF',
    stageFg4: INK,
    stageFg5: INK,
    stageFg6: INK,
    stageTrack: '#16232B',
    stageLostDone: '#2A3841',
    stageWon: '#7DBE62',
    stageLost: '#E06A4C',
    stageWonFg: INK,
    stageLostFg: INK,
    stageDone: '#0096C8',
    stageCurrentRing: '#E6EDF1',
    stageFuture: '#66737B',
    stageLine: '#1C2932',
    wonFg: '#A5D98A',
    lost: '#F2A58E',

    warm: '#B9DDA3',
    warmBg: '#213126',
    warmBgTop: '#293C2B',
    warmBorder: '#34492E',
    warmCell: '#8CC36F',
    warmShade1: '#4F6E3E',
    warmShade2: '#73A156',
    warmShade3: '#9CCB7A',
    waiting: '#EFD394',
    waitingBg: '#2E2D20',
    waitingBgTop: '#3C3824',
    waitingBorder: '#46412A',
    waitingCell: '#EBC155',
    waitingShade1: '#6B5A2A',
    waitingShade2: '#B8963C',
    waitingShade3: '#EBC155',
    cold: '#F2B19B',
    coldBg: '#2F1F1D',
    coldBgTop: '#3C241F',
    coldBorder: '#4A2C25',
    coldCell: '#D9603D',
    coldShade1: '#6B3A2C',
    coldShade2: '#B9573A',
    coldShade3: '#E27E57',
    sandCell: '#25221A',
    sandLine: '#5E553C',
    lostDot: '#C9CED3',

    fieldUp1: '#46613A',
    fieldUp2: '#57803F',
    fieldUp3: '#6C9F4C',
    fieldUp4: '#86BC60',
    fieldUp5: '#A6D67F',
    fieldDown1: '#F1CD62',
    fieldDown2: '#EC9C47',
    fieldDown3: '#D9603D',
    fieldDown4: '#B23B2A',
    fieldMoved: '#3A9AD9',
    fieldZero: '#4A4330',
    fieldWeekend: 'rgba(255, 255, 255, 0.035)',
    todayLine: 'rgba(255, 255, 255, 0.5)',

    // Snow (#F2F7FA) was 4.45:1 on folder 1; white keeps 4.82:1.
    folderFg: '#FFFFFF',
    folderRule: 'rgba(255, 255, 255, 0.12)',
    folder1Top: '#0078B7',
    folder1Bottom: '#03689F',
    folder2Top: '#03689F',
    folder2Bottom: '#035888',
    folder3Top: '#035888',
    folder3Bottom: '#033E8A',
    folder4Top: '#033E8A',
    folder4Bottom: '#032A72',
    folder5Top: '#032A72',
    folder5Bottom: '#03045E',

    capsule1: '#033E8A',
    capsule2: '#035888',
    capsule3: '#0078B7',
    capsule4: '#0096C8',
    capsule5: '#00B4D7',
    capsule6: '#48CAE4',
    capsule7: '#91E0EF',
    capsule8: '#CAF1F8',
  },
}

/** Tag hues: a small coloured square beside the tag name. New tags take the least-used hue. */
export const tagPalette = [
  { name: 'indigo', hex: '#7C83F2' },
  { name: 'violet', hex: '#A28CF4' },
  { name: 'pink', hex: '#EE8FB5' },
  { name: 'orange', hex: '#F2A06E' },
  { name: 'amber', hex: '#E9BC5C' },
  { name: 'lime', hex: '#8DC46E' },
  { name: 'teal', hex: '#4FC2B4' },
  { name: 'slate', hex: '#8B98A9' },
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

/** Corner radii in px: squarer than before (chips 4, controls 6, cards 10, folder tabs 8). */
export const radii = {
  chip: 4,
  control: 6,
  brandMark: 7,
  tab: 8,
  card: 10,
} as const

/** Fixed layout sizes in px. */
export const layout = {
  headerHeight: 56,
  /** The folder tab row; the active tab is this tall, the others 31px. */
  sheetBarHeight: 40,
  /** Single-line, spreadsheet-like rows (D-031). */
  rowHeight: 36,
  rowHeightCompact: 30,
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
