/**
 * Contrast is tested, not assumed (CLAUDE.md §3.2). Text pairs need 4.5:1; meaningful graphics
 * (stage dots, hollow outlines, focus rings) need 3:1. Both themes.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio, formatRatio, parseHex, relativeLuminance } from '@/styles/contrast'
import { renderTokensCss } from '@/styles/renderTokensCss'
import { brand, type ThemeColours, type ThemeName, themes } from '@/styles/tokens'

type Role = keyof ThemeColours

const TEXT = 4.5
const GRAPHIC = 3

/** Backgrounds that body and label text sit on. Expanded rows use row-selected. */
const textSurfaces: Role[] = ['bg', 'surfaceSubtle', 'surfaceRaised', 'rowSelected']

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
  ['warm', 'warmBg'],
  ['waiting', 'waitingBg'],
  ['cold', 'coldBg'],
  ['overdue', 'bg'],
  ['overdue', 'rowSelected'],
  ['today', 'bg'],
  ['today', 'rowSelected'],
  ['lost', 'bg'],
  ['lost', 'rowSelected'],
  ['brandTintFg', 'brandTint'],
  ['textSecondary', 'pillBg'],
]

const graphicRoles: Role[] = ['stageFuture', 'stageDone', 'stageWon', 'stageLost', 'focusRing']
const graphicSurfaces: Role[] = ['bg', 'surfaceSubtle', 'rowSelected']

const themeNames = Object.keys(themes) as ThemeName[]

describe('contrast helpers', () => {
  it('computes WCAG ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(contrastRatio('#FFFFFF', brand[600])).toBeGreaterThanOrEqual(4.5)
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

  it('keeps the hollow-dot outline (border-strong) at 3:1 on every surface', () => {
    for (const bg of ['bg', 'surfaceSubtle', 'surfaceRaised', 'rowSelected'] as const) {
      expect(contrastRatio(t.borderStrong, t[bg])).toBeGreaterThanOrEqual(GRAPHIC)
    }
  })
})

describe('light theme specifics', () => {
  it('uses brand-700 for links and white text on brand-600', () => {
    expect(themes.light.link).toBe(brand[700])
    expect(contrastRatio(brand[700], '#FFFFFF')).toBeGreaterThanOrEqual(TEXT)
    expect(themes.light.primary).toBe(brand[600])
    expect(contrastRatio('#FFFFFF', brand[600])).toBeGreaterThanOrEqual(TEXT)
  })

  it('uses brand-50 for the expanded row tint', () => {
    expect(themes.light.rowSelected).toBe(brand[50])
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
