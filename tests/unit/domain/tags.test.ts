import { describe, expect, it } from 'vitest'
import { pickTagColour, tagColourHex } from '@/domain/tags'
import { type TagColour, tagPalette } from '@/styles/tokens'

// Stored data may hold colours outside the palette, so the helper accepts any string.
const tags = (...colours: string[]) => colours.map((colour) => ({ colour: colour as TagColour }))

describe('pickTagColour', () => {
  it('starts with the first hue', () => {
    expect(pickTagColour([])).toBe('indigo')
  })

  it('takes the least-used hue, ties broken by palette order', () => {
    expect(pickTagColour(tags('indigo'))).toBe('violet')
    expect(pickTagColour(tags('indigo', 'violet', 'pink'))).toBe('orange')
    expect(pickTagColour(tags('violet'))).toBe('indigo')
    const allOnce = tagPalette.map((t) => t.name)
    expect(pickTagColour(tags(...allOnce))).toBe('indigo')
    expect(pickTagColour(tags(...allOnce, 'indigo', 'violet', 'teal'))).toBe('pink')
    expect(pickTagColour(tags(...allOnce, ...allOnce.filter((n) => n !== 'slate')))).toBe('slate')
  })

  it('assigns eight different hues to the first eight tags', () => {
    const existing: { colour: TagColour }[] = []
    for (let i = 0; i < 8; i++) existing.push({ colour: pickTagColour(existing) })
    expect(new Set(existing.map((t) => t.colour)).size).toBe(8)
    expect(existing.map((t) => t.colour)).toEqual(tagPalette.map((t) => t.name))
  })

  it('ignores colours outside the palette', () => {
    expect(pickTagColour(tags('magenta', 'magenta'))).toBe('indigo')
  })
})

describe('tagColourHex', () => {
  it('maps each palette name to its hex', () => {
    for (const { name, hex } of tagPalette) expect(tagColourHex(name)).toBe(hex)
    expect(tagColourHex('indigo')).toBe('#6366F1')
  })

  it('falls back to slate for unknown names', () => {
    expect(tagColourHex('magenta' as TagColour)).toBe('#64748B')
  })
})
