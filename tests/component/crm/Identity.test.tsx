import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvatarInitials, avatarHue } from '@/components/crm/AvatarInitials'
import { BrandLockup, BrandMark } from '@/components/crm/BrandLockup'
import { tagColourNames } from '@/styles/tokens'
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

describe('AvatarInitials', () => {
  it('shows initials, hidden from assistive tech', () => {
    renderUi(<AvatarInitials name="Cdr Arvind Menon" />)
    const avatar = screen.getByText('AM')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')
    expect(avatar.className).toContain('size-6')
  })

  it('is 28px at md', () => {
    renderUi(<AvatarInitials name="Rohan Mehta" size="md" />)
    expect(screen.getByText('RM').className).toContain('size-7')
  })

  // The redesign drops the per-name tint for one calm slate gradient on a squarer tile.
  it('uses the avatar gradient and 6px corners for every name', () => {
    renderUi(
      <>
        <AvatarInitials name="Rohan Mehta" size="md" />
        <AvatarInitials name="Priya Raghavan" />
      </>,
    )
    for (const text of ['RM', 'PR']) {
      const cls = screen.getByText(text).className
      expect(cls).toContain(
        'bg-[image:linear-gradient(180deg,var(--avatar-top),var(--avatar-bottom))]',
      )
      expect(cls).toContain('text-avatar-fg')
      expect(cls).toContain('rounded-[6px]')
      expect(cls).toContain('text-[10.5px]')
      expect(cls).toContain('font-semibold')
      expect(cls).not.toContain('rounded-full')
      expect(cls).not.toContain('--tag-')
    }
  })

  it('still offers a deterministic hue from the tag palette', () => {
    const hue = avatarHue('Rohan Mehta')
    expect(tagColourNames).toContain(hue)
    expect(avatarHue('  rohan mehta ')).toBe(hue)
  })

  it('spreads names across hues', () => {
    const names = ['Dawar', 'Dhruv', 'Rohan Mehta', 'Priya Raghavan', 'Kavya Iyer', 'Meera Pillai']
    expect(new Set(names.map(avatarHue)).size).toBeGreaterThan(2)
  })
})
