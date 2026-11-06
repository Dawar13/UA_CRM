import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  // The grid renders thousands of cells while scrolling; the default 500-entry cache thrashed
  // there (D-045). Results are the same, only more of them are remembered.
  cacheSize: 2000,
  extend: {
    theme: {
      radius: ['control', 'card', 'brand'],
      shadow: ['popover'],
    },
  },
})

/** Joins class names and resolves Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
