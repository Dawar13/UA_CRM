/**
 * Number and money formatting, en-IN. Pure.
 *
 * Convention: every `currency` column value is stored in rupees as a plain number
 * (₹25 L = 2500000) and displayed with `formatCurrency`.
 */

const LAKH = 100_000
const CRORE = 10_000_000

const numberFormats = new Map<number, Intl.NumberFormat>()

function numberFormat(maximumFractionDigits: number): Intl.NumberFormat {
  let nf = numberFormats.get(maximumFractionDigits)
  if (!nf) {
    nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits })
    numberFormats.set(maximumFractionDigits, nf)
  }
  return nf
}

/** "12,34,567" (en-IN grouping). Up to two decimals by default. Empty for NaN or infinity. */
export function formatNumber(value: number, options?: { maximumFractionDigits?: number }): string {
  if (!Number.isFinite(value)) return ''
  return numberFormat(options?.maximumFractionDigits ?? 2).format(value)
}

/** Rounds to one decimal place. */
function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Rupees in compact Indian units: 2_500_000 → "₹25 L", 12_000_000 → "₹1.2 Cr",
 * 45_000 → "₹45,000". Up to one decimal place for L and Cr, trailing ".0" dropped.
 * Below one lakh, whole rupees. A value that rounds up to the next unit uses that unit
 * (99,96,000 → "₹1 Cr"). Negative values get a leading minus; NaN and infinity give "".
 */
export function formatCurrency(rupees: number): string {
  if (!Number.isFinite(rupees)) return ''
  const sign = rupees < 0 ? '-' : ''
  const abs = Math.abs(rupees)
  let body: string
  if (Math.round(abs) < LAKH) {
    body = formatNumber(Math.round(abs), { maximumFractionDigits: 0 })
  } else if (oneDecimal(abs / LAKH) < 100) {
    body = `${formatNumber(oneDecimal(abs / LAKH), { maximumFractionDigits: 1 })} L`
  } else {
    body = `${formatNumber(oneDecimal(abs / CRORE), { maximumFractionDigits: 1 })} Cr`
  }
  return body === '0' ? '₹0' : `${sign}₹${body}`
}

/** Lakh values: 25 → "₹25 L", 120 → "₹1.2 Cr". Same rules as formatCurrency. */
export function formatLakhs(lakhs: number): string {
  return formatCurrency(lakhs * LAKH)
}

/** "1 row", "2,000 rows". */
export function pluralise(count: number, singular: string, plural?: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}
