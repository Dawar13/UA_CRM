/**
 * Tag colours. One shared tag library across all sheets and members; each tag has a colour from
 * the 8-hue palette, auto-assigned and editable. Pure.
 */
import { type TagColour, tagPalette } from '../styles/tokens'
import type { Tag } from './types'

/**
 * The least-used hue among `existing` tags, ties broken by palette order (indigo first).
 * Colours not in the palette are ignored.
 */
export function pickTagColour(existing: readonly Pick<Tag, 'colour'>[]): TagColour {
  const counts = new Map<string, number>(tagPalette.map((t) => [t.name, 0]))
  for (const tag of existing) {
    const count = counts.get(tag.colour)
    if (count !== undefined) counts.set(tag.colour, count + 1)
  }
  let best: TagColour = tagPalette[0].name
  let bestCount = Number.POSITIVE_INFINITY
  for (const { name } of tagPalette) {
    const count = counts.get(name) ?? 0
    if (count < bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

/** A tag change that cannot be made. Sentence case, ready to show. */
export class TagRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TagRuleError'
  }
}

/** A tag name as stored: trimmed, single spaces, without a leading "#". Throws when empty. */
export function cleanTagName(name: string): string {
  const clean = name.trim().replace(/^#+/, '').replace(/\s+/g, ' ')
  if (clean === '') throw new TagRuleError('A tag needs a name')
  return clean
}

/** Hex for a palette colour ("indigo" → "#6366F1"). Unknown names fall back to slate. */
export function tagColourHex(colour: TagColour): string {
  const found = tagPalette.find((t) => t.name === colour)
  return found ? found.hex : tagPalette[7].hex
}
