import { Fragment, type ReactNode } from 'react'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Wraps the parts of `text` that start a word matching any query token in <mark>. */
export function highlight(text: string, query: string): ReactNode {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length)
  if (tokens.length === 0 || text === '') return text
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'giu')
  // Split with a capture group: odd parts are the matches. Parts can repeat, so the position is
  // part of each key; the list is rebuilt from scratch on every render.
  const parts = text
    .split(pattern)
    .map((part, i) => ({ part, key: `${i}:${part}`, match: i % 2 === 1 }))
  return parts.map(({ part, key, match }) =>
    match ? (
      <mark key={key} className="rounded-[3px] bg-brand-tint-strong px-px text-text">
        {part}
      </mark>
    ) : (
      <Fragment key={key}>{part}</Fragment>
    ),
  )
}
