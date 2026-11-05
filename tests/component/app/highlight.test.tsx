import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { highlight } from '@/features/command-palette/highlight'

function marks(node: ReturnType<typeof highlight>): string[] {
  const { container } = render(<p>{node}</p>)
  return [...container.querySelectorAll('mark')].map((m) => m.textContent ?? '')
}

describe('highlight', () => {
  it('marks each query token, case-insensitively', () => {
    expect(marks(highlight('Cdr Arvind Menon', 'menon arv'))).toEqual(['Arv', 'Menon'])
  })

  it('returns the text unchanged for an empty query', () => {
    expect(highlight('Rohan Mehta', '  ')).toBe('Rohan Mehta')
  })

  it('ignores punctuation in the query', () => {
    expect(marks(highlight('Hosur Precision Forge', 'forge.*'))).toEqual(['Forge'])
  })
})
