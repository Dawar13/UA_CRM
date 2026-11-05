import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TagChip, TagList, toTagColour } from '@/components/crm/TagChip'
import { renderUi } from '../ui/renderUi'

const tags = [
  { id: 't1', name: 'foundry', colour: 'indigo' },
  { id: 't2', name: 'defence', colour: 'violet' },
  { id: 't3', name: 'pilot candidate', colour: 'pink' },
  { id: 't4', name: 'decision maker', colour: 'orange' },
  { id: 't5', name: 'intro pending', colour: 'amber' },
] as const

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TagChip', () => {
  it('shows the name beside a square in the tag hue, legend style with no pill', () => {
    const { container } = renderUi(<TagChip name="foundry" colour="teal" />)
    const chip = container.querySelector('[data-tag="foundry"]')
    expect(chip).toHaveAttribute('data-colour', 'teal')
    expect(chip?.className).not.toContain('bg-pill-bg')
    expect(chip?.className).not.toContain('border')
    expect(chip?.className).toContain('text-secondary')
    expect(chip?.className).toContain('text-[12.5px]')
    const square = chip?.querySelector('.bg-tag-teal')
    expect(square).toHaveAttribute('aria-hidden', 'true')
    expect(square?.className).toContain('size-2')
    expect(square?.className).toContain('rounded-[2px]')
    expect(screen.getByText('foundry').className).toContain('truncate')
  })

  it('falls back to slate for an unknown colour', () => {
    expect(toTagColour('chartreuse')).toBe('slate')
    expect(toTagColour('lime')).toBe('lime')
    const { container } = renderUi(<TagChip name="old" colour="chartreuse" />)
    expect(container.querySelector('.bg-tag-slate')).not.toBeNull()
  })

  it('has no tooltip when the name fits', async () => {
    const { user } = renderUi(<TagChip name="foundry" colour="indigo" />)
    await user.hover(screen.getByText('foundry'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows the full name in a tooltip when truncated', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(240)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(120)
    const name = 'Tier 1 automotive supplier with an export focus'
    const { user } = renderUi(<TagChip name={name} colour="teal" />)
    await user.hover(screen.getByText(name))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(name)
  })
})

describe('TagList', () => {
  it('shows two tags 12px apart, then a +N count naming the rest', async () => {
    const { user, container } = renderUi(<TagList tags={tags} />)
    expect(container.querySelectorAll('[data-tag]')).toHaveLength(2)
    expect((container.firstElementChild as HTMLElement).className).toContain('gap-3')
    const overflow = screen.getByTestId('tag-overflow')
    expect(overflow).toHaveTextContent('+3')
    expect(overflow.className).toContain('font-mono')
    expect(overflow.className).toContain('bg-tile')
    expect(overflow.className).toContain('rounded-chip')
    expect(overflow).toHaveTextContent(
      '3 more tags: pilot candidate, decision maker, intro pending',
    )
    await user.hover(overflow)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'pilot candidate, decision maker, intro pending',
    )
  })

  it('lets the first chip keep its full name and later chips truncate', () => {
    const { container } = renderUi(<TagList tags={tags} />)
    const [first, second] = [...container.querySelectorAll<HTMLElement>('[data-tag]')]
    expect(first?.className).toContain('shrink-0')
    expect(first?.className).toContain('max-w-[min(10rem,65%)]')
    expect(second?.className.split(' ')).toContain('shrink')
    expect(second?.className.split(' ')).not.toContain('shrink-0')
  })

  it('lets a tag on its own use the whole width', () => {
    const { container } = renderUi(<TagList tags={tags.slice(0, 1)} max={1} />)
    const only = container.querySelector<HTMLElement>('[data-tag]')
    expect(only?.className).toContain('max-w-full')
    expect(only?.className.split(' ')).not.toContain('shrink-0')
  })

  it('shows one tag and a count when max is 1 (sheets with stages)', () => {
    const { container } = renderUi(<TagList tags={tags.slice(0, 3)} max={1} />)
    expect(container.querySelectorAll('[data-tag]')).toHaveLength(1)
    expect(container.querySelector('[data-tag]')?.className).toContain('max-w-[min(10rem,65%)]')
    expect(screen.getByTestId('tag-overflow')).toHaveTextContent('+2')
  })

  it('respects max and says "1 more tag"', () => {
    const { container } = renderUi(<TagList tags={tags.slice(0, 4)} max={3} />)
    expect(container.querySelectorAll('[data-tag]')).toHaveLength(3)
    expect(screen.getByTestId('tag-overflow')).toHaveTextContent('1 more tag: decision maker')
  })

  it('has no overflow pill when everything fits', () => {
    renderUi(<TagList tags={tags.slice(0, 2)} />)
    expect(screen.queryByTestId('tag-overflow')).not.toBeInTheDocument()
  })

  it('renders nothing without tags', () => {
    const { container } = renderUi(<TagList tags={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
