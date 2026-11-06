import { useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { capsuleGeometry } from './folder'

export const CAPSULE_HEIGHT = 56

/**
 * The pipeline drawn as a horizontal funnel (D-031), measured to its real pixel width so the
 * rounded spout stays round. Each stage is a band of the blue ramp; the funnel stops at the last
 * stage anyone reached. Decorative: the card carries the numbers as text.
 */
export function PipelineCapsule({
  reached,
  className,
}: {
  reached: readonly number[]
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const next = el.clientWidth
      setWidth((prev) => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const geometry = capsuleGeometry(reached, width, CAPSULE_HEIGHT)
  const clip = `${id}-clip`
  const sheen = `${id}-sheen`

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="pipeline-capsule"
      className={cn('h-14 w-full', className)}
    >
      {geometry ? (
        <svg
          aria-hidden="true"
          focusable="false"
          width={width}
          height={CAPSULE_HEIGHT}
          viewBox={`0 0 ${width} ${CAPSULE_HEIGHT}`}
          className="block"
        >
          <defs>
            <clipPath id={clip}>
              <path d={geometry.path} />
            </clipPath>
            <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'white', stopOpacity: 0.28 }} />
              <stop offset="0.5" style={{ stopColor: 'white', stopOpacity: 0 }} />
              <stop offset="1" style={{ stopColor: 'black', stopOpacity: 0.06 }} />
            </linearGradient>
          </defs>
          <g clipPath={`url(#${clip})`}>
            {geometry.bands.map((band) => (
              <rect
                key={band.index}
                data-stage-band={band.index}
                x={band.x}
                y={0}
                width={band.width}
                height={CAPSULE_HEIGHT}
                style={{ fill: `var(--capsule${band.step})` }}
              />
            ))}
            <rect x={0} y={0} width={width} height={CAPSULE_HEIGHT} fill={`url(#${sheen})`} />
          </g>
        </svg>
      ) : null}
    </div>
  )
}
