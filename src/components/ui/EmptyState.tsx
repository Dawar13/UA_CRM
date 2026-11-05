import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/cn'
import { softGradient } from '@/styles/tokens'

/**
 * Abstract art for empty states: a calm card of rows drawn in the soft gradient. Shapes only, no
 * illustration. Purely decorative.
 */
export function EmptyStateArt({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const fill = `url(#${id}-fill)`
  const glow = `url(#${id}-glow)`
  const rows = [
    { y: 44, bar: 50, opacity: 0.95 },
    { y: 58, bar: 38, opacity: 0.6 },
    { y: 72, bar: 44, opacity: 0.35 },
  ]
  return (
    <svg
      viewBox="0 0 160 112"
      width="160"
      height="112"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={softGradient.from} />
          <stop offset="50%" stopColor={softGradient.via} />
          <stop offset="100%" stopColor={softGradient.to} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={softGradient.via} stopOpacity="0.55" />
          <stop offset="100%" stopColor={softGradient.via} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="58" rx="74" ry="52" fill={glow} />
      <rect
        x="30"
        y="28"
        width="100"
        height="60"
        rx="10"
        className="fill-surface-raised"
        stroke={fill}
        strokeOpacity="0.85"
        strokeWidth="1.25"
      />
      <rect x="30" y="28" width="100" height="6" rx="3" fill={fill} opacity="0.5" />
      {rows.map((row) => (
        <g key={row.y} opacity={row.opacity}>
          <circle cx="43" cy={row.y + 3} r="4.5" fill={fill} />
          <rect x="53" y={row.y} width={row.bar} height="6" rx="3" fill={fill} />
          <rect x="108" y={row.y} width="12" height="6" rx="3" fill={fill} opacity="0.7" />
        </g>
      ))}
      <circle cx="134" cy="22" r="4" fill={softGradient.to} opacity="0.9" />
      <circle cx="145" cy="33" r="2" fill={softGradient.from} opacity="0.7" />
      <circle cx="22" cy="86" r="2.5" fill={softGradient.via} />
    </svg>
  )
}

export interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  /** Usually one Button that does the obvious next thing. */
  action?: ReactNode
  /** Hide the art in tight spaces. */
  art?: boolean
  className?: string
}

/** Empty states invite action: say what goes here and how to add it. */
export function EmptyState({ title, description, action, art = true, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}
    >
      {art ? <EmptyStateArt className="mb-4" /> : null}
      <p className="text-md font-semibold tracking-[-0.01em] text-text">{title}</p>
      {description !== undefined ? (
        <p className="mt-1 max-w-xs text-sm text-secondary">{description}</p>
      ) : null}
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
