/**
 * Cell fills (D-049): a light tint of one of the eight tag hues, mixed with the page so it stays
 * soft in both themes. Text on it keeps --text; tests/unit/tokens.contrast.test.ts checks every
 * hue in both themes.
 */
import { type TagColour, tagColourNames } from '@/styles/tokens'

export const CELL_FILL_PERCENT = 22

export const cellFillColours: readonly TagColour[] = tagColourNames

export function cellFill(colour: TagColour): string {
  return `color-mix(in srgb, var(--tag-${colour}) ${CELL_FILL_PERCENT}%, var(--bg))`
}

/** "Indigo", "Teal": names for the swatches. */
export function colourName(colour: TagColour): string {
  return colour.charAt(0).toUpperCase() + colour.slice(1)
}
