import { BRAND_MARK_SIZE } from '@/assets/brand/brandMark'
import { cn } from '@/lib/cn'

/**
 * The UA brand mark: a rounded square in the sky gradient (--brand-mark) with a white "UA" in
 * Geist 700. 28px with 7px corners by default; other sizes keep the proportions. Decorative: the
 * wordmark next to it carries the name.
 */
export function BrandMark({
  size = BRAND_MARK_SIZE,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="brand-mark"
      className={cn(
        'inline-grid shrink-0 select-none place-items-center bg-[image:var(--brand-mark)]',
        'font-sans leading-none font-bold tracking-[-0.01em] text-white',
        'shadow-[inset_0_1px_0_color-mix(in_srgb,white_35%,transparent)]',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        fontSize: Math.round((size * 12) / 28),
      }}
    >
      UA
    </span>
  )
}

/** Brand mark, "Utopian Autonomy" wordmark and the "Internal CRM" label, for the header. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2.5', className)}>
      <BrandMark />
      <span className="text-[15px] leading-none font-semibold tracking-[-0.015em] whitespace-nowrap text-text">
        Utopian Autonomy
      </span>
      <span className="inline-flex h-[21px] items-center rounded-chip border border-brand-tint-strong px-1.5 font-mono text-[10.5px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-brand-tint-fg uppercase">
        Internal CRM
      </span>
    </div>
  )
}
