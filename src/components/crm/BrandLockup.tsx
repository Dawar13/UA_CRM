import { BRAND_MARK_SIZE } from '@/assets/brand/brandMark'
import markUrl from '@/assets/brand/ua-mark.png'
import { cn } from '@/lib/cn'

/**
 * The UA brand mark: the founders' monogram on UA blue (D-044), 28px with 7px corners by default;
 * other sizes keep the proportions. Decorative: the wordmark next to it carries the name.
 */
export function BrandMark({
  size = BRAND_MARK_SIZE,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src={markUrl}
      alt=""
      aria-hidden="true"
      data-testid="brand-mark"
      width={size}
      height={size}
      draggable={false}
      className={cn('shrink-0 select-none object-cover', className)}
      style={{ width: size, height: size, borderRadius: Math.round(size / 4) }}
    />
  )
}

/**
 * Brand mark, "Utopian Autonomy" wordmark and the "Internal CRM" label, for the header. With
 * `collapse`, a phone shows the mark alone (the name stays for screen readers).
 */
export function BrandLockup({
  className,
  collapse = false,
}: {
  className?: string
  collapse?: boolean
}) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2.5', className)}>
      <BrandMark />
      <span
        className={cn(
          'text-[15px] leading-none font-semibold tracking-[-0.015em] whitespace-nowrap text-text',
          collapse && 'max-md:sr-only',
        )}
      >
        Utopian Autonomy
      </span>
      <span
        className={cn(
          'inline-flex h-[21px] items-center rounded-chip border border-brand-tint-strong px-1.5 font-mono text-[10.5px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-brand-tint-fg uppercase',
          collapse && 'max-md:hidden',
        )}
      >
        Internal CRM
      </span>
    </div>
  )
}
