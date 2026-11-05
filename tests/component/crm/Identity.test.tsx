import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { monogramPaths } from '@/assets/brand/brandMark'
import { AvatarInitials, avatarHue } from '@/components/crm/AvatarInitials'
import { BrandLockup, BrandMark } from '@/components/crm/BrandLockup'
import { tagColourNames } from '@/styles/tokens'
import { renderUi } from '../ui/renderUi'

describe('BrandLockup', () => {
  it('shows the mark, "Utopian Autonomy" and the "Internal CRM" label', () => {
    renderUi(<BrandLockup />)
    expect(screen.getByText('Utopian Autonomy')).toBeInTheDocument()
    const label = screen.getByText('Internal CRM')
    expect(label.className).toContain('text-brand-tint-fg')
    expect(label.className).toContain('bg-brand-tint')
    expect(screen.getByTestId('brand-mark')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('BrandMark', () => {
  it('draws the favicon monogram on a 28px brand-500 square', () => {
    renderUi(<BrandMark />)
    const svg = screen.getByTestId('brand-mark')
    expect(svg).toHaveAttribute('width', '28')
    expect(svg.querySelector('rect')).toHaveAttribute('rx', '8')
    expect(svg.querySelector('rect')?.getAttribute('class')).toContain('fill-brand-500')
    const paths = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))
    expect(paths).toEqual([monogramPaths.u, monogramPaths.a, monogramPaths.aBar])
  })

  it('scales', () => {
    renderUi(<BrandMark size={40} />)
    expect(screen.getByTestId('brand-mark')).toHaveAttribute('height', '40')
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

  it('picks a deterministic hue from the tag palette', () => {
    const hue = avatarHue('Rohan Mehta')
    expect(tagColourNames).toContain(hue)
    expect(avatarHue('  rohan mehta ')).toBe(hue)
    renderUi(<AvatarInitials name="Rohan Mehta" />)
    expect(screen.getByText('RM')).toHaveAttribute('data-hue', hue)
    expect(screen.getByText('RM').className).toContain(`var(--tag-${hue})`)
  })

  it('spreads names across hues', () => {
    const names = ['Dawar', 'Dhruv', 'Rohan Mehta', 'Priya Raghavan', 'Kavya Iyer', 'Meera Pillai']
    expect(new Set(names.map(avatarHue)).size).toBeGreaterThan(2)
  })
})
