import type { CSSProperties, ReactNode } from 'react'
import { useTheme } from '@/app/theme'
import { WarmthChip } from '@/components/crm/WarmthChip'
import { cn } from '@/lib/cn'
import { contrastRatio, formatRatio } from '@/styles/contrast'
import {
  bluePalette,
  brand,
  brandMark,
  softGradient,
  type ThemeColours,
  themes,
  toCssVarName,
} from '@/styles/tokens'
import { Section, Specimen } from './layout'

type Role = keyof ThemeColours

/** A folder front: the folder colour fading into paper. */
export function folderFront(colour: string): string {
  return [
    `linear-gradient(180deg, ${colour} 0%,`,
    `color-mix(in srgb, ${colour} 62%, transparent) 24%,`,
    `color-mix(in srgb, ${colour} 24%, transparent) 56%,`,
    'transparent 100%), var(--bg)',
  ].join(' ')
}

/** The slanted ear after a folder tab face, `height` px tall. */
export function folderEar(height: number): string {
  return `path('M0 0 C 6 0, 8 4, 10 10 L 18 ${height} L 0 ${height} Z')`
}

/* Foundation blocks ------------------------------------------------------------------------ */

function Block({
  title,
  detail,
  className,
  style,
}: {
  title: string
  detail: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cn('flex min-h-0 flex-col justify-between gap-3 rounded-card p-3.5', className)}
      style={style}
    >
      <span className="text-[13px] font-semibold">{title}</span>
      <span className="font-mono text-[11px] leading-[1.5]">{detail}</span>
    </div>
  )
}

function Foundation({ t }: { t: ThemeColours }) {
  return (
    <div className="grid h-[280px] grid-cols-[1.3fr_1fr_1fr_1fr] gap-2.5">
      <Block
        title="Sky to paper"
        className="border border-border text-text [&>span:first-child]:text-folder-fg"
        style={{ background: folderFront('var(--folder1-bottom)') }}
        detail={
          <>
            {t.folder1Bottom} → paper
            <br />
            The folder front. Colour fades into the sheet.
          </>
        }
      />
      <div className="flex flex-col gap-2.5">
        <Block
          title="Paper"
          className="flex-1 border border-border bg-bg text-text"
          detail={`${t.bg} · every surface`}
        />
        <Block
          title="Mist"
          className="flex-1 border border-border bg-surface-subtle text-text"
          detail={`${t.surfaceSubtle} · side panel, wells`}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        <Block title="Ink" className="flex-[1.4] bg-text text-bg" detail={`${t.text} · text`} />
        <Block
          title="Slate"
          className="flex-1 bg-secondary text-bg"
          detail={`${t.textSecondary} · secondary text`}
        />
      </div>
      <div className="flex flex-col gap-2.5">
        <Block
          title="UA blue"
          className="flex-[1.4] bg-[image:var(--brand-mark)] text-today-fg"
          detail={
            <>
              {brandMark.from} → {brandMark.to}
              <br />
              Brand mark, the open member
            </>
          }
        />
        <Block title="Link blue" className="flex-1 bg-link text-bg" detail={`${t.link} · links`} />
      </div>
    </div>
  )
}

/* Blue palette and folders ---------------------------------------------------------------- */

function BluePalette() {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <span className="pt-1 font-mono text-[10.5px] text-muted">Palette</span>
      <ol aria-label="Blue palette, navy to white" className="flex flex-wrap gap-1">
        {bluePalette.map((hex, i) => (
          <li key={hex} className="flex flex-col items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[22px] w-11 rounded-full shadow-[inset_0_0_0_1px_var(--border)]"
              style={{ background: `var(--blue-${i + 1})` }}
            />
            <span className="font-mono text-[9.5px] text-muted">{hex}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const folderNames = [
  ['01', 'Deep', 'Customers'],
  ['02', 'Cyan', 'Investors'],
  ['03', 'Sky', 'Advisors'],
  ['04', 'Mist', 'Connectors'],
  ['05', 'Frost', 'Service providers'],
] as const

function Folders({ t }: { t: ThemeColours }) {
  const hex: [string, string][] = [
    [t.folder1Top, t.folder1Bottom],
    [t.folder2Top, t.folder2Bottom],
    [t.folder3Top, t.folder3Bottom],
    [t.folder4Top, t.folder4Bottom],
    [t.folder5Top, t.folder5Bottom],
  ]
  return (
    <div className="grid grid-cols-5 gap-3">
      {folderNames.map(([no, name, sheet], i) => {
        const n = i + 1
        const face = `linear-gradient(180deg, var(--folder${n}-top), var(--folder${n}-bottom))`
        return (
          <div key={no} className="flex min-w-0 flex-col">
            <div className="flex h-8 text-folder-fg">
              <span
                className="flex items-center gap-2 rounded-tl-[8px] pr-1 pl-3"
                style={{ background: face }}
              >
                <span className="font-mono text-[10.5px] font-semibold">{no}</span>
                <span className="text-[13px] font-semibold">{name}</span>
              </span>
              <span
                aria-hidden="true"
                className="w-[18px]"
                style={{ background: face, clipPath: folderEar(32) }}
              />
            </div>
            <div
              className="flex h-[120px] flex-col justify-between rounded-[0_10px_10px_10px] border border-t-0 border-border px-3.5 py-3"
              style={{ background: folderFront(`var(--folder${n}-bottom)`) }}
            >
              <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-folder-fg uppercase">
                {sheet}
              </span>
              <span className="font-mono text-[10.5px] text-secondary">
                {hex[i]?.[0]} → {hex[i]?.[1]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* Contrast swatches ----------------------------------------------------------------------- */

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
                'rounded-chip px-1.5 text-2xs leading-4 font-medium',
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
    role(t, 'tile', 'bg'),
    role(t, 'border', 'bg'),
    role(t, 'borderStrong', 'bg', 3),
    role(t, 'text', 'bg', 4.5),
    role(t, 'textSecondary', 'surfaceSubtle', 4.5),
    role(t, 'textMuted', 'surfaceHover', 4.5),
  ]

  const accentSpecs: SwatchSpec[] = [
    role(t, 'link', 'bg', 4.5),
    role(t, 'primary', 'bg', 3),
    role(t, 'focusRing', 'bg', 3),
    role(t, 'rowSelected', 'bg'),
    role(t, 'brandTint', 'bg'),
    role(t, 'brandTintFg', 'bg', 4.5),
    role(t, 'today', 'bg', 4.5),
    role(t, 'overdue', 'bg', 4.5),
    role(t, 'lost', 'rowSelected', 4.5),
    role(t, 'wonFg', 'bg', 4.5),
    role(t, 'danger', 'bg', 3),
  ]

  return (
    <Section
      id="colours"
      title="Foundation"
      caption={`Paper white everywhere, mist for the side panel, ink for text. The UA blue is for the brand mark and the open member; link blue for links. Ratios are computed live for the ${resolved} theme.`}
    >
      <Foundation t={t} />
      <Specimen
        title="Folders"
        caption="Each sheet takes one of five folder colours by position. The front fades to paper."
      >
        <div className="flex flex-col gap-5">
          <Folders t={t} />
          <BluePalette />
        </div>
      </Specimen>
      <Specimen title="Neutrals" caption="Surfaces, hairlines and the three text roles.">
        <SwatchGrid specs={neutralSpecs} />
      </Specimen>
      <Specimen title="Accent and status" caption="Links, focus, selection, dates and outcomes.">
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
            <PairSample label="Internal CRM label" fg={t.brandTintFg} bg={t.bg}>
              <span className="inline-flex h-[21px] items-center rounded-chip border border-brand-tint-strong px-1.5 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-brand-tint-fg uppercase">
                Internal CRM
              </span>
            </PairSample>
            <PairSample label="Today" fg={t.todayFg} bg={t.todayBg}>
              <span className="rounded-chip bg-[image:linear-gradient(180deg,var(--today-bg-top),var(--today-bg))] px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-today-fg">
                Today
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
          <Specimen title="Brand ramp" caption="OKLCH, hue ~240. Focus rings and accents.">
            <SwatchGrid specs={brandSpecs} />
          </Specimen>
          <Specimen
            title="Soft gradient"
            caption="Only for the sign-in background and empty-state art."
          >
            <div className="flex flex-col gap-3">
              <div
                className="h-16 rounded-control"
                style={{ background: 'var(--soft-gradient)' }}
              />
              <div className="flex justify-between font-mono text-xs text-muted">
                <span>{softGradient.from}</span>
                <span>{softGradient.via}</span>
                <span>{softGradient.to}</span>
              </div>
            </div>
          </Specimen>
        </div>
      </div>
    </Section>
  )
}
