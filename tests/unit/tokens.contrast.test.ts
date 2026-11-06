/**
 * Contrast is tested, not assumed (CLAUDE.md §3.2). Text pairs need 4.5:1; meaningful graphics
 * (hollow outlines, focus rings) need 3:1. Both themes.
 *
 * Stage cells, warmth squares and the activity field are supplementary: every one of them sits
 * next to text that says the same thing (the stage name, the warmth label, the counts and
 * tooltips), so their fills are judged by eye, not by the 3:1 rule (D-027).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio, formatRatio, parseHex, relativeLuminance } from '@/styles/contrast'
import { renderTokensCss } from '@/styles/renderTokensCss'
import {
  FOLDER_COUNT,
  STAGE_STEPS,
  type ThemeColours,
  type ThemeName,
  themes,
} from '@/styles/tokens'

type Role = keyof ThemeColours

const TEXT = 4.5
const GRAPHIC = 3

/** Backgrounds that body and label text sit on. Expanded rows use row-selected. */
const textSurfaces: Role[] = ['bg', 'surfaceSubtle', 'surfaceRaised', 'rowSelected']

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const textPairs: [Role, Role][] = [
  ...(['text', 'textSecondary', 'textMuted'] as const).flatMap((fg) =>
    textSurfaces.map((bg): [Role, Role] => [fg, bg]),
  ),
  // Menu items and secondary buttons highlight on surface-hover.
  ['text', 'surfaceHover'],
  ['textSecondary', 'surfaceHover'],
  ['textMuted', 'surfaceHover'],
  ['link', 'bg'],
  ['link', 'surfaceRaised'],
  ['link', 'rowSelected'],
  ['primaryFg', 'primary'],
  ['primaryFg', 'primaryHover'],
  ['dangerFg', 'danger'],
  ['dangerFg', 'dangerHover'],
  ['brandTintFg', 'brandTint'],
  ['textSecondary', 'pillBg'],
  ['textSecondary', 'tile'],
  // The grid's shaded header row.
  ['text', 'gridHeader'],
  ['textMuted', 'gridHeader'],
  ['avatarFg', 'avatarBottom'],
  // Dates.
  ['todayFg', 'todayBg'],
  ['todayFg', 'todayBgTop'],
  ['today', 'bg'],
  ['overdue', 'bg'],
  ['overdue', 'rowSelected'],
  // Stage blocks carry their name and date as text.
  ...range(STAGE_STEPS).map((n): [Role, Role] => [`stageFg${n}` as Role, `stage${n}` as Role]),
  ['stageWonFg', 'stageWon'],
  ['stageLostFg', 'stageLost'],
  ['textSecondary', 'stageLostDone'],
  ['textMuted', 'stageTrack'],
  ['wonFg', 'bg'],
  ['wonFg', 'rowSelected'],
  ['lost', 'bg'],
  ['lost', 'rowSelected'],
  // Warmth chips: a two-stop gradient, so the text must pass on both stops.
  ...(['warm', 'waiting', 'cold'] as const).flatMap((w): [Role, Role][] => [
    [w, `${w}Bg` as Role],
    [w, `${w}BgTop` as Role],
  ]),
  // Folder tabs and the top of each folder front.
  ...range(FOLDER_COUNT).flatMap((n): [Role, Role][] => [
    ['folderFg', `folder${n}Top` as Role],
    ['folderFg', `folder${n}Bottom` as Role],
  ]),
]

const graphicRoles: Role[] = ['focusRing', 'borderStrong']
const graphicSurfaces: Role[] = ['bg', 'surfaceSubtle', 'surfaceRaised', 'rowSelected']

const themeNames = Object.keys(themes) as ThemeName[]

describe('contrast helpers', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5)
    expect(formatRatio(4.5678)).toBe('4.56:1')
  })

  it('rejects anything that is not #RRGGBB', () => {
    expect(() => parseHex('rgba(0,0,0,0.5)')).toThrow()
    expect(parseHex('#007BC1')).toEqual([0, 123, 193])
  })
})

describe.each(themeNames)('%s theme', (themeName) => {
  const t = themes[themeName]

  it.each(textPairs)('%s on %s is at least 4.5:1', (fg, bg) => {
    const ratio = contrastRatio(t[fg], t[bg])
    expect(ratio, `${fg} ${t[fg]} on ${bg} ${t[bg]}: ${formatRatio(ratio)}`).toBeGreaterThanOrEqual(
      TEXT,
    )
  })

  it.each(graphicRoles.flatMap((g) => graphicSurfaces.map((bg): [Role, Role] => [g, bg])))(
    '%s on %s is at least 3:1',
    (fg, bg) => {
      const ratio = contrastRatio(t[fg], t[bg])
      expect(
        ratio,
        `${fg} ${t[fg]} on ${bg} ${t[bg]}: ${formatRatio(ratio)}`,
      ).toBeGreaterThanOrEqual(GRAPHIC)
    },
  )

  it('steps the stage ramp and the folders from one end of the palette to the other', () => {
    const stages = range(STAGE_STEPS).map((n) => relativeLuminance(t[`stage${n}` as Role]))
    const sorted = [...stages].sort((a, b) => (themeName === 'light' ? b - a : a - b))
    expect(stages).toEqual(sorted)
    const folders = range(FOLDER_COUNT).map((n) => relativeLuminance(t[`folder${n}Top` as Role]))
    const sortedFolders = [...folders].sort((a, b) => (themeName === 'light' ? a - b : b - a))
    expect(folders).toEqual(sortedFolders)
  })
})

describe('generated tokens.css', () => {
  it('is up to date with tokens.ts (run `pnpm tokens`)', () => {
    const path = fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url))
    const onDisk = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    expect(onDisk).toBe(renderTokensCss().replace(/\r\n/g, '\n'))
  })

  it('declares every theme role for light, dark and system dark', () => {
    const css = renderTokensCss()
    for (const key of Object.keys(themes.light)) {
      const name = `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:`
      expect(css.split(name).length - 1, name).toBe(3)
    }
  })
})
