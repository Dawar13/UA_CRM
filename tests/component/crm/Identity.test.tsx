import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandLockup, BrandMark } from '@/components/crm/BrandLockup'
import { renderUi } from '../ui/renderUi'

describe('BrandLockup', () => {
  it('shows the mark, "Utopian Autonomy" and the "Internal CRM" label', () => {
    renderUi(<BrandLockup />)
    expect(screen.getByText('Utopian Autonomy')).toBeInTheDocument()
    // M0.6: the label is Geist Mono caps in link blue with a hairline, not a filled pill.
    const label = screen.getByText('Internal CRM')
    expect(label.className).toContain('text-brand-tint-fg')
    expect(label.className).toContain('border-brand-tint-strong')
    expect(label.className).toContain('font-mono')
    expect(label.className).toContain('uppercase')
    expect(screen.getByTestId('brand-mark')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('BrandMark', () => {
  // M0.6: the mark is the sky gradient (--brand-mark) with a white "UA", 7px corners at 28px.
  it('is a 28px square in the brand gradient with a white UA', () => {
    renderUi(<BrandMark />)
    const mark = screen.getByTestId('brand-mark')
    expect(mark).toHaveTextContent('UA')
    expect(mark).toHaveStyle({ width: '28px', height: '28px', borderRadius: '7px' })
    expect(mark.className).toContain('var(--brand-mark)')
    expect(mark.className).toContain('text-white')
  })

  it('scales, keeping its proportions', () => {
    renderUi(<BrandMark size={40} />)
    expect(screen.getByTestId('brand-mark')).toHaveStyle({
      width: '40px',
      height: '40px',
      borderRadius: '10px',
    })
  })
})
