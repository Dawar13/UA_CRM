import type { ReactNode } from 'react'
import { useTheme } from '@/app/theme'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { cn } from '@/lib/cn'
import { contrastRatio, formatRatio } from '@/styles/contrast'
import {
  brand,
  softGradient,
  type ThemeColours,
  tagPalette,
  themes,
  toCssVarName,
} from '@/styles/tokens'
import { Section, Specimen } from './layout'

type Role = keyof ThemeColours

interface SwatchSpec {
  /** CSS custom property, for example "--brand-600". */
  cssVar: string
  hex: string
  /** What the ratio is measured against. */
  against: { label: string; hex: string }
  /** Minimum ratio the pair must meet, when it is a meaningful pair. */
  min?: 3 | 4.5
}

function Swatch({ spec }: { spec: SwatchSpec }) {
  const ratio = contrastRatio(spec.hex, spec.against.hex)
  const passes = spec.min === undefined ? undefined : ratio >= spec.min
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="h-12 rounded-control border border-border"
        style={{ background: `var(${spec.cssVar})` }}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono text-xs text-text">{spec.cssVar}</span>
        <span className="font-mono text-xs text-secondary">{spec.hex.toUpperCase()}</span>
        <span className="mt-1 flex items-center gap-1.5 text-xs whitespace-nowrap text-text">
          <span className="tabular-nums">{formatRatio(ratio)}</span>
          {passes === undefined ? null : (
            <span
              className={cn(
                'rounded-full px-1.5 text-2xs leading-4 font-medium',
                passes ? 'bg-warm-bg text-warm' : 'bg-cold-bg text-cold',
              )}
            >
              {passes ? `≥ ${spec.min}` : `< ${spec.min}`}
            </span>
          )}
        </span>
        <span className="truncate text-2xs text-muted">on {spec.against.label}</span>
      </div>
    </div>
  )
}

function SwatchGrid({ specs }: { specs: SwatchSpec[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-4 gap-y-5">
      {specs.map((spec) => (
        <Swatch key={`${spec.cssVar}-${spec.against.label}`} spec={spec} />
      ))}
    </div>
  )
}

function role(colours: ThemeColours, key: Role, against: Role, min?: 3 | 4.5): SwatchSpec {
  return {
    cssVar: toCssVarName(key),
    hex: colours[key],
    against: { label: toCssVarName(against).slice(2), hex: colours[against] },
    min,
  }
}

/** Pairs where foreground and background travel together (chips, buttons). */
function PairSample({
  label,
  fg,
  bg,
  children,
}: {
  label: string
  fg: string
  bg: string
  children: ReactNode
}) {
  const ratio = contrastRatio(fg, bg)
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-text">{label}</span>
        <span className="font-mono text-xs text-muted">
          {fg.toUpperCase()} on {bg.toUpperCase()}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {children}
        <span className="w-14 text-right text-xs tabular-nums text-secondary">
          {formatRatio(ratio)}
        </span>
      </div>
    </div>
  )
}

export function ColoursSection() {
  const { resolved } = useTheme()
  const t = themes[resolved]
  const onBg = { label: 'bg', hex: t.bg }

  const brandSpecs: SwatchSpec[] = Object.entries(brand).map(([step, hex]) => ({
    cssVar: `--brand-${step}`,
    hex,
    against: onBg,
  }))

  const neutralSpecs: SwatchSpec[] = [
    role(t, 'bg', 'text'),
    role(t, 'surfaceSubtle', 'bg'),
    role(t, 'surfaceRaised', 'bg'),
    role(t, 'surfaceHover', 'bg'),
    role(t, 'border', 'bg'),
    role(t, 'borderStrong', 'bg', 3),
    role(t, 'text', 'bg', 4.5),
    role(t, 'textSecondary', 'bg', 4.5),
    role(t, 'textMuted', 'rowSelected', 4.5),
  ]

  const accentSpecs: SwatchSpec[] = [
    role(t, 'link', 'bg', 4.5),
    role(t, 'primary', 'bg', 3),
    role(t, 'focusRing', 'bg', 3),
    role(t, 'rowSelected', 'bg'),
    role(t, 'brandTint', 'bg'),
    role(t, 'today', 'bg', 4.5),
    role(t, 'overdue', 'bg', 4.5),
    role(t, 'lost', 'rowSelected', 4.5),
    role(t, 'danger', 'bg', 3),
  ]

  const stageSpecs: SwatchSpec[] = [
    role(t, 'stageDone', 'rowSelected', 3),
    role(t, 'stageCurrentRing', 'bg'),
    role(t, 'stageFuture', 'rowSelected', 3),
    role(t, 'stageWon', 'rowSelected', 3),
    role(t, 'stageLost', 'rowSelected', 3),
    role(t, 'stageLine', 'bg'),
  ]

  return (
    <Section
      id="colours"
      title="Colour"
      caption={`Calm, near-white surfaces dominate (deep ink in dark); UA blue is for action, selection and progress. Ratios are computed live for the ${resolved} theme.`}
    >
      <Specimen title="Brand ramp" caption="OKLCH, hue ~240. brand-500 is decorative only.">
        <SwatchGrid specs={brandSpecs} />
      </Specimen>
      <Specimen title="Neutrals" caption="Surfaces, hairlines and the three text roles.">
        <SwatchGrid specs={neutralSpecs} />
      </Specimen>
      <Specimen title="Accent and status" caption="Links, focus, selection and dates.">
        <SwatchGrid specs={accentSpecs} />
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Pairs" caption="Text on its own fill.">
          <div className="flex flex-col gap-2">
            <PairSample label="Primary button" fg={t.primaryFg} bg={t.primary}>
              <span className="rounded-control bg-primary px-2 py-1 text-xs font-medium text-primary-fg">
                Save
              </span>
            </PairSample>
            <PairSample label="Danger button" fg={t.dangerFg} bg={t.danger}>
              <span className="rounded-control bg-danger px-2 py-1 text-xs font-medium text-danger-fg">
                Delete
              </span>
            </PairSample>
            <PairSample label="Internal CRM label" fg={t.brandTintFg} bg={t.brandTint}>
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-tint-fg">
                Internal CRM
              </span>
            </PairSample>
            <PairSample label="Warm" fg={t.warm} bg={t.warmBg}>
              <WarmthChip value="warm" size="sm" />
            </PairSample>
            <PairSample label="Waiting" fg={t.waiting} bg={t.waitingBg}>
              <WarmthChip value="waiting" size="sm" />
            </PairSample>
            <PairSample label="Cold" fg={t.cold} bg={t.coldBg}>
              <WarmthChip value="cold" size="sm" />
            </PairSample>
          </div>
        </Specimen>
        <div className="flex flex-col gap-6">
          <Specimen title="Stage dots" caption="Graphics, at least 3:1 on the expanded row.">
            <SwatchGrid specs={stageSpecs} />
          </Specimen>
          <Specimen title="Tag hues" caption="A 6px dot in a neutral pill.">
            <div className="grid grid-cols-4 gap-x-4 gap-y-3">
              {tagPalette.map((tag) => (
                <div key={tag.name} className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: `var(--tag-${tag.name})` }}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-xs text-text">{tag.name}</span>
                    <span className="font-mono text-2xs text-muted">{tag.hex}</span>
                  </div>
                </div>
              ))}
            </div>
          </Specimen>
        </div>
      </div>
      <Specimen
        title="Soft gradient"
        caption="Only for the 3px top strip, the sign-in background and empty-state art."
      >
        <div className="flex flex-col gap-3">
          <div className="h-[3px] rounded-full" style={{ background: 'var(--soft-gradient)' }} />
          <div className="h-16 rounded-control" style={{ background: 'var(--soft-gradient)' }} />
          <div className="flex justify-between font-mono text-xs text-muted">
            <span>{softGradient.from}</span>
            <span>{softGradient.via}</span>
            <span>{softGradient.to}</span>
          </div>
        </div>
      </Specimen>
    </Section>
  )
}
