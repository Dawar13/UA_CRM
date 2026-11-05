import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SectionProps {
  id: string
  title: string
  caption?: ReactNode
  children: ReactNode
}

/** Geist Mono caps for labels: section titles, captions, small annotations. */
export const capsClassName = 'font-mono font-semibold uppercase tracking-[0.08em]'

/** One showcase section with its own data-testid for the visual tests ("design-<id>"). */
export function Section({ id, title, caption, children }: SectionProps) {
  const headingId = `${id}-heading`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-testid={`design-${id}`}
      className="scroll-mt-6 pt-14 pb-2"
    >
      <div className="mb-6 flex flex-col gap-2 border-b border-border pb-2.5">
        <h2
          id={headingId}
          className="font-mono text-[11px] font-semibold tracking-[0.1em] text-text uppercase"
        >
          {title}
        </h2>
      </div>
      {caption ? <p className="-mt-2 mb-6 max-w-3xl text-sm text-secondary">{caption}</p> : null}
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  )
}

/** A labelled specimen box. */
export function Specimen({
  title,
  caption,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  caption?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div className={cn('rounded-card border border-border bg-bg', className)}>
      {title || caption ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-3">
          {title ? <h3 className="text-sm font-semibold text-text">{title}</h3> : null}
          {caption ? <p className="text-xs text-muted">{caption}</p> : null}
        </div>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  )
}

/** Small muted label above or beside a specimen. */
export function StateLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-xs text-muted', className)}>{children}</span>
}

/** Monospaced annotation (accessible names, token names, inputs). */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn('font-mono text-xs text-secondary', className)}>{children}</code>
}

/** Mono caps caption, as under the figures in the type specimen. */
export function Caps({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono text-[10.5px] leading-[1.6] tracking-[0.06em] text-secondary uppercase',
        className,
      )}
    >
      {children}
    </span>
  )
}
