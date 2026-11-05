import { describe, expect, it } from 'vitest'
import { formatCurrency, formatLakhs, formatNumber, pluralise } from '@/domain/format'

describe('formatNumber', () => {
  it('groups in the Indian system', () => {
    expect(formatNumber(1234567)).toBe('12,34,567')
    expect(formatNumber(12345678.9)).toBe('1,23,45,678.9')
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(-123456)).toBe('-1,23,456')
  })

  it('rounds to two decimals by default, or as asked', () => {
    expect(formatNumber(1234.56789)).toBe('1,234.57')
    expect(formatNumber(1234.56789, { maximumFractionDigits: 0 })).toBe('1,235')
    expect(formatNumber(1234.56789, { maximumFractionDigits: 4 })).toBe('1,234.5679')
  })

  it('is empty for NaN and infinity', () => {
    expect(formatNumber(Number.NaN)).toBe('')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('formatCurrency', () => {
  it('shows whole rupees below one lakh', () => {
    expect(formatCurrency(0)).toBe('₹0')
    expect(formatCurrency(500)).toBe('₹500')
    expect(formatCurrency(45_000)).toBe('₹45,000')
    expect(formatCurrency(99_999)).toBe('₹99,999')
    expect(formatCurrency(1234.56)).toBe('₹1,235')
  })

  it('switches to lakhs at 1,00,000', () => {
    expect(formatCurrency(1_00_000)).toBe('₹1 L')
    expect(formatCurrency(99_999.6)).toBe('₹1 L')
    expect(formatCurrency(1_50_000)).toBe('₹1.5 L')
    expect(formatCurrency(25_00_000)).toBe('₹25 L')
    expect(formatCurrency(25_40_000)).toBe('₹25.4 L')
    expect(formatCurrency(25_04_000)).toBe('₹25 L')
    expect(formatCurrency(99_90_000)).toBe('₹99.9 L')
  })

  it('switches to crores at 1,00,00,000, including values that round up', () => {
    expect(formatCurrency(99_96_000)).toBe('₹1 Cr')
    expect(formatCurrency(1_00_00_000)).toBe('₹1 Cr')
    expect(formatCurrency(1_20_00_000)).toBe('₹1.2 Cr')
    expect(formatCurrency(1_23_45_678)).toBe('₹1.2 Cr')
    expect(formatCurrency(12_000_000)).toBe('₹1.2 Cr')
    expect(formatCurrency(2_500_000)).toBe('₹25 L')
    expect(formatCurrency(12_345 * 1_00_00_000)).toBe('₹12,345 Cr')
    expect(formatCurrency(1_234_50_00_000)).toBe('₹1,234.5 Cr')
  })

  it('handles negatives and non-finite values', () => {
    expect(formatCurrency(-25_00_000)).toBe('-₹25 L')
    expect(formatCurrency(-45_000)).toBe('-₹45,000')
    expect(formatCurrency(-0.3)).toBe('₹0')
    expect(formatCurrency(Number.NaN)).toBe('')
  })
})

describe('formatLakhs', () => {
  it('formats lakh values', () => {
    expect(formatLakhs(25)).toBe('₹25 L')
    expect(formatLakhs(120)).toBe('₹1.2 Cr')
    expect(formatLakhs(0.5)).toBe('₹50,000')
    expect(formatLakhs(1)).toBe('₹1 L')
  })
})

describe('pluralise', () => {
  it('picks singular or plural with grouped counts', () => {
    expect(pluralise(1, 'row')).toBe('1 row')
    expect(pluralise(0, 'row')).toBe('0 rows')
    expect(pluralise(2000, 'row')).toBe('2,000 rows')
    expect(pluralise(3, 'person', 'people')).toBe('3 people')
    expect(pluralise(1, 'person', 'people')).toBe('1 person')
  })
})
