/**
 * Number and money formatting, en-IN. Pure.
 *
 * CONTRACT (signatures are fixed; bodies are implemented in M0.3).
 */

/** "12,34,567" (en-IN grouping). */
export declare function formatNumber(
  value: number,
  options?: { maximumFractionDigits?: number },
): string

/**
 * Rupees in compact Indian units: 2_500_000 → "₹25 L", 12_000_000 → "₹1.2 Cr",
 * 45_000 → "₹45,000". Up to one decimal place for L and Cr, trailing ".0" dropped.
 */
export declare function formatCurrency(rupees: number): string

/** Lakh values as typed in sheets ("Ticket estimate (₹ L/yr)"): 25 → "₹25 L", 120 → "₹1.2 Cr". */
export declare function formatLakhs(lakhs: number): string

/** "1 row", "2,000 rows". */
export declare function pluralise(count: number, singular: string, plural?: string): string
