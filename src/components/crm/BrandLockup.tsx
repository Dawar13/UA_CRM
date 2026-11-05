import {
  BRAND_MARK_RADIUS,
  BRAND_MARK_SIZE,
  MONOGRAM_STROKE_WIDTH,
  monogramPaths,
} from '@/assets/brand/brandMark'
import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/cn'

/**
 * The UA brand mark: a rounded square in --brand-500 with a white "UA" monogram. Drawn from the
 * same paths as the favicon (src/assets/brand/brandMark.ts). Decorative: the wordmark next to it
 * carries the name.
 */
export function BrandMark({
  size = BRAND_MARK_SIZE,
  className,
}: {
  size?: number
  className?: string
}) {
  const s = BRAND_MARK_SIZE
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${s} ${s}`}
      aria-hidden="true"
      focusable="false"
      data-testid="brand-mark"
      className={cn('shrink-0', className)}
    >
      <rect width={s} height={s} rx={BRAND_MARK_RADIUS} className="fill-brand-500" />
      <g
        fill="none"
        className="stroke-white"
        strokeWidth={MONOGRAM_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={monogramPaths.u} />
        <path d={monogramPaths.a} />
        <path d={monogramPaths.aBar} />
      </g>
    </svg>
  )
}

/** Brand mark, "Utopian Autonomy" wordmark and the "Internal CRM" label, for the header. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2.5', className)}>
      <BrandMark />
      <span className="text-[15px] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap text-text">
        Utopian Autonomy
      </span>
      <Pill tone="brand" className="h-[22px] px-2 text-xs">
        Internal CRM
      </Pill>
    </div>
  )
}
