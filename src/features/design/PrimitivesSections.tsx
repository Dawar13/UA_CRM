import {
  ChevronDown,
  CircleOff,
  Copy,
  Ellipsis,
  Maximize2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { BrandLockup, BrandMark } from '@/components/crm/BrandLockup'
import { Button, type ButtonVariant } from '@/components/ui/Button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input, PasswordInput } from '@/components/ui/Input'
import { Kbd } from '@/components/ui/Kbd'
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  menuContentClassName,
  menuItemClassName,
  menuLabelClassName,
} from '@/components/ui/Menu'
import { Pill } from '@/components/ui/Pill'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Separator } from '@/components/ui/Separator'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { toast, undoToast } from '@/components/ui/Toast'
import { Tooltip, tooltipContentClassName } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { Caps, Mono, Section, Specimen, StateLabel } from './layout'

/* Type ------------------------------------------------------------------------------------ */

const typeRows = [
  {
    size: 'text-xl',
    px: 24,
    weight: 'font-semibold',
    meta: '24 · 600 · 1.3',
    sample: 'Customers pipeline',
  },
  {
    size: 'text-lg',
    px: 20,
    weight: 'font-semibold',
    meta: '20 · 600 · 1.35',
    sample: 'Hosur Precision Forge',
  },
  {
    size: 'text-md',
    px: 16,
    weight: 'font-semibold',
    meta: '16 · 600 · 1.45',
    sample: 'Next action',
  },
  {
    size: 'text-base',
    px: 14,
    weight: 'font-normal',
    meta: '14 · 400 · 1.45 · base',
    sample: 'Four heading lines; unplanned downtime is his KPI.',
  },
  {
    size: 'text-base',
    px: 14,
    weight: 'font-medium',
    meta: '14 · 500',
    sample: 'Rohan Mehta',
  },
  {
    size: 'text-sm',
    px: 13,
    weight: 'font-normal',
    meta: '13 · 400',
    sample: 'Plant Head at Hosur Precision Forge',
  },
  {
    size: 'text-xs',
    px: 12,
    weight: 'font-medium',
    meta: '12 · 500',
    sample: 'Stage labels and chips',
  },
  {
    size: 'text-2xs',
    px: 11,
    weight: 'font-normal',
    meta: '11 · 400',
    sample: 'Dates under stages · 15 Oct',
  },
] as const

export function TypeSection() {
  return (
    <Section
      id="type"
      title="Type"
      caption="Geist and Geist Mono, self-hosted. Big figures at 400 with tight tracking; a 14px base for body text; Geist Mono caps for labels, dates and money."
    >
      <Specimen bodyClassName="py-2">
        <div className="divide-y divide-border">
          <div className="grid grid-cols-[minmax(0,1fr)_200px] items-end gap-4 pt-2 pb-4">
            <span className="flex items-end gap-8 text-text tabular-nums">
              <span className="text-[68px] leading-none font-normal tracking-[-0.045em]">
                ₹2.2 Cr
              </span>
              <span className="text-[40px] leading-none font-normal tracking-[-0.03em]">12</span>
            </span>
            <Caps>
              Figures
              <br />
              Geist 400 · 40 to 68
            </Caps>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_200px] items-end gap-4 py-4">
            <span className="flex flex-col">
              <span className="text-md font-[550] tracking-[-0.01em] text-text">
                Sunita Kulkarni
              </span>
              <span className="text-sm text-muted">Operations Director · Deccan Castings</span>
            </span>
            <Caps>
              Body
              <br />
              Geist 14 · 550 for names
            </Caps>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_200px] items-end gap-4 pt-4 pb-2">
            <span className="font-mono text-xs font-semibold tracking-[0.1em] text-text uppercase">
              Open pipeline · Thu 5 Nov · 4:00 pm · ₹25 L
            </span>
            <Caps>
              Labels, dates, money
              <br />
              Geist Mono
            </Caps>
          </div>
        </div>
      </Specimen>
      <Specimen title="Scale" bodyClassName="p-0">
        <div className="divide-y divide-border">
          {typeRows.map((row) => (
            <div
              key={row.meta}
              className="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-6 px-5 py-3.5"
            >
              <Mono className="text-muted">{row.meta}</Mono>
              <span
                className={cn(
                  row.size,
                  row.weight,
                  'truncate text-text',
                  row.weight === 'font-semibold' && 'tracking-[-0.01em]',
                )}
              >
                {row.sample}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-6 px-5 py-3.5">
            <Mono className="text-muted">Mono · 13</Mono>
            <span className="truncate font-mono text-sm text-text">
              Rohan Mehta / Plant Head @ Hosur Precision Forge, Hosur
            </span>
          </div>
          <div className="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-6 px-5 py-3.5">
            <Mono className="text-muted">Tabular figures</Mono>
            <span className="flex gap-6 text-base tabular-nums text-text">
              <span>₹25 L</span>
              <span>₹1.2 Cr</span>
              <span>12,34,567</span>
              <span>2,000 rows</span>
            </span>
          </div>
          <div className="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-6 px-5 py-3.5">
            <Mono className="text-muted">Long text · 1.6</Mono>
            <p className="max-w-xl text-base leading-[1.6] text-secondary">
              Met at the CII manufacturing summit. Runs a 400-tonne forging line for two tier-1 auto
              suppliers and wants a maintenance agent piloted on line 3 before the March shutdown.
            </p>
          </div>
        </div>
      </Specimen>
    </Section>
  )
}

/* Brand ----------------------------------------------------------------------------------- */

export function BrandSection() {
  return (
    <Section
      id="brand"
      title="Brand"
      caption="The mark is the founders' UA logo, a 28px rounded square; the favicon is the same logo. Wordmark 15px at 600; the label is Geist Mono caps in link blue with a hairline."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Specimen title="Header lockup" bodyClassName="p-0">
          <div className="flex h-14 items-center border-b border-border px-5">
            <BrandLockup />
          </div>
          <div className="flex h-14 items-center bg-surface-subtle px-5">
            <BrandLockup />
          </div>
        </Specimen>
        <Specimen title="Mark" caption="16, 20, 28 (default), 40 and 56px">
          <div className="flex items-end gap-5">
            {[16, 20, 28, 40, 56].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <BrandMark size={size} />
                <StateLabel className="tabular-nums">{size}</StateLabel>
              </div>
            ))}
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* Buttons --------------------------------------------------------------------------------- */

/** Classes that reproduce each variant's hover and active look for the static state grid. */
const forcedHover: Record<ButtonVariant, string> = {
  primary: 'bg-primary-hover',
  secondary: 'border-border-strong/60 bg-surface-hover',
  ghost: 'bg-surface-hover text-text',
  danger: 'bg-danger-hover',
}
const forcedActive: Record<ButtonVariant, string> = {
  primary: 'bg-brand-800',
  secondary: 'bg-surface-subtle',
  ghost: 'bg-surface-subtle text-text',
  danger: 'bg-danger-hover',
}
const variantLabels: Record<ButtonVariant, { name: string; label: string }> = {
  primary: { name: 'Primary', label: 'Add to calendar' },
  secondary: { name: 'Secondary', label: 'Reopen' },
  ghost: { name: 'Ghost', label: 'Show all' },
  danger: { name: 'Danger', label: 'Delete sheet' },
}
const states = ['Default', 'Hover', 'Focus', 'Active', 'Disabled'] as const

export function ButtonsSection() {
  const variants = Object.keys(variantLabels) as ButtonVariant[]
  return (
    <Section
      id="buttons"
      title="Buttons"
      caption="Primary is the UA blue fill (--primary) with white text; everything else stays quiet. Hover, focus and active are forced here so every state is visible at once."
    >
      <Specimen title="Variants and states" bodyClassName="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[96px_repeat(5,minmax(0,1fr))] items-center gap-x-4 gap-y-4">
          <span />
          {states.map((state) => (
            <StateLabel key={state}>{state}</StateLabel>
          ))}
          {variants.map((variant) => {
            const { name, label } = variantLabels[variant]
            return [
              <span key={`${variant}-name`} className="text-sm text-secondary">
                {name}
              </span>,
              <div key={`${variant}-default`}>
                <Button variant={variant}>{label}</Button>
              </div>,
              <div key={`${variant}-hover`}>
                <Button variant={variant} className={forcedHover[variant]}>
                  {label}
                </Button>
              </div>,
              <div key={`${variant}-focus`}>
                <Button variant={variant} className="focus-ring">
                  {label}
                </Button>
              </div>,
              <div key={`${variant}-active`}>
                <Button variant={variant} className={forcedActive[variant]}>
                  {label}
                </Button>
              </div>,
              <div key={`${variant}-disabled`}>
                <Button variant={variant} disabled>
                  {label}
                </Button>
              </div>,
            ]
          })}
        </div>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Sizes and icons" caption="sm 28px · md 32px">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="sm">
                <Plus aria-hidden="true" />
                New row
              </Button>
              <Button variant="secondary" size="sm">
                <RotateCcw aria-hidden="true" />
                Reopen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-secondary hover:bg-cold-bg hover:text-cold"
              >
                <CircleOff aria-hidden="true" />
                Mark lost
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">
                <Plus aria-hidden="true" />
                New row
              </Button>
              <Button variant="secondary">
                <Copy aria-hidden="true" />
                Copy email
              </Button>
              <Button variant="ghost">Show all</Button>
            </div>
          </div>
        </Specimen>
        <Specimen title="Icon buttons" caption="Always labelled; tooltips show the shortcut">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-1">
              <IconButton aria-label="Search" shortcut={['Mod', 'K']}>
                <Search aria-hidden="true" />
              </IconButton>
              <IconButton aria-label="More options" tooltip="More options">
                <Ellipsis aria-hidden="true" />
              </IconButton>
              <IconButton aria-label="Expand row" tooltip="Expand row" shortcut={['Enter']}>
                <Maximize2 aria-hidden="true" />
              </IconButton>
            </div>
            <div className="flex items-center gap-1">
              <IconButton aria-label="Search (hover)" className="bg-surface-hover text-text">
                <Search aria-hidden="true" />
              </IconButton>
              <IconButton aria-label="Search (focus)" className="focus-ring">
                <Search aria-hidden="true" />
              </IconButton>
              <IconButton aria-label="Search (disabled)" disabled>
                <Search aria-hidden="true" />
              </IconButton>
            </div>
            <div className="flex items-center gap-1">
              <IconButton aria-label="More options (secondary)" variant="secondary" size="sm">
                <Ellipsis aria-hidden="true" />
              </IconButton>
              <IconButton aria-label="More options (secondary, md)" variant="secondary">
                <Ellipsis aria-hidden="true" />
              </IconButton>
            </div>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* Inputs ---------------------------------------------------------------------------------- */

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-secondary">
        {label}
      </label>
      {children}
    </div>
  )
}

export function InputsSection() {
  return (
    <Section
      id="inputs"
      title="Inputs and keys"
      caption="32px fields on the raised surface with a hairline border. Every edit saves as you go, so there are no save buttons."
    >
      <Specimen title="Input">
        <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field id="design-input-empty" label="Default">
            <Input id="design-input-empty" placeholder="Search people" />
          </Field>
          <Field id="design-input-filled" label="Filled">
            <Input id="design-input-filled" defaultValue="Rohan Mehta" />
          </Field>
          <Field id="design-input-focus" label="Focus">
            <Input
              id="design-input-focus"
              defaultValue="rohan@hpf.example"
              className="focus-ring border-focus"
            />
          </Field>
          <Field id="design-input-invalid" label="Invalid">
            <Input id="design-input-invalid" defaultValue="+91 98450" aria-invalid="true" />
          </Field>
          <Field id="design-input-disabled" label="Disabled">
            <Input id="design-input-disabled" defaultValue="Hosur" disabled />
          </Field>
        </div>
      </Specimen>
      <Specimen
        title="Password"
        caption="Sign-in and changing the password: the eye shows or hides what was typed"
      >
        <div className="grid gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field id="design-password" label="Password">
            <PasswordInput id="design-password" defaultValue="sample-password" />
          </Field>
        </div>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Textarea" caption="Long text at 1.6 line height">
          <Field id="design-textarea" label="Notes">
            <Textarea
              id="design-textarea"
              defaultValue="Wants a pilot on line 3. Send the ROI note before Friday's review."
            />
          </Field>
        </Specimen>
        <Specimen title="Keys" caption="Mod is ⌘ on macOS and Ctrl elsewhere">
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2.5 text-sm">
            {(
              [
                ['Search and commands', ['Mod', 'K']],
                ['Quick add', ['/']],
                ['Cycle warmth', ['W']],
                ['Next and previous stage', [']', '[']],
                ['Toggle the right panel', ['Mod', '.']],
                ['Undo', ['Mod', 'Z']],
                ['Move in the grid', ['ArrowUp', 'ArrowDown']],
                ['Collapse or cancel', ['Escape']],
              ] as const
            ).map(([label, keys]) => (
              <div key={label} className="contents">
                <dt className="text-secondary">{label}</dt>
                <dd className="justify-self-end">
                  <Kbd keys={keys} />
                </dd>
              </div>
            ))}
          </dl>
        </Specimen>
      </div>
    </Section>
  )
}

/* Menus and overlays ---------------------------------------------------------------------- */

function DemoMenu() {
  const [density, setDensity] = useState('comfortable')
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary">
          Row actions
          <ChevronDown aria-hidden="true" className="text-muted" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Rohan Mehta</MenuLabel>
        <MenuGroup>
          <MenuItem icon={<Maximize2 aria-hidden="true" />} shortcut={['Enter']}>
            Expand row
          </MenuItem>
          <MenuItem shortcut={['W']} className="pl-8">
            Cycle warmth
          </MenuItem>
          <MenuItem shortcut={[']']} className="pl-8">
            Next stage
          </MenuItem>
          <MenuItem shortcut={['[']} className="pl-8" disabled>
            Previous stage
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuLabel>Density</MenuLabel>
        <MenuRadioGroup value={density} onValueChange={setDensity}>
          <MenuRadioItem value="comfortable">Comfortable</MenuRadioItem>
          <MenuRadioItem value="compact">Compact</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem destructive icon={<Trash2 aria-hidden="true" />}>
          Move to trash
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

/** A static drawing of an open menu, using the real classes. Hidden from assistive tech. */
function StaticMenu() {
  return (
    <div aria-hidden="true" className={cn(menuContentClassName, 'w-56')}>
      <div className={menuLabelClassName}>Warmth</div>
      {(
        [
          ['Warm', 'bg-warm-cell', '1', true],
          ['Waiting', 'bg-waiting-cell', '2', false],
          ['Cold', 'bg-cold-cell', '3', false],
        ] as const
      ).map(([label, dot, key, highlighted]) => (
        <div
          key={label}
          data-highlighted={highlighted ? '' : undefined}
          className={cn(menuItemClassName, 'pl-7')}
        >
          <span className={cn('size-1.5 rounded-[1.5px]', dot)} />
          <span className="flex-1">{label}</span>
          <Kbd keys={[key]} tone="subtle" />
        </div>
      ))}
      <div className="-mx-1 my-1 h-px bg-border" />
      <div className={cn(menuItemClassName, 'pl-7')}>
        <span className="flex-1">Clear</span>
        <Kbd keys={['0']} tone="subtle" />
      </div>
    </div>
  )
}

export function MenusSection() {
  return (
    <Section
      id="menus"
      title="Menus and overlays"
      caption="Raised surface, 1px hairline, 10px corners and one soft shadow; group labels in Geist Mono caps. They open in 120ms with a slight scale and respect reduced motion."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Menu" caption="Try it, or read the static drawing">
          <div className="flex flex-wrap items-start gap-8">
            <DemoMenu />
            <StaticMenu />
          </div>
        </Specimen>
        <div className="flex flex-col gap-6">
          <Specimen title="Tooltip" caption="300ms delay; shows the shortcut">
            <div className="flex flex-wrap items-center gap-8">
              <Tooltip content="Search everyone" shortcut={['Mod', 'K']}>
                <Button variant="secondary">
                  <Search aria-hidden="true" />
                  Search
                </Button>
              </Tooltip>
              <div aria-hidden="true" className={cn(tooltipContentClassName, 'inline-flex')}>
                <span>Search everyone</span>
                <Kbd keys={['Mod', 'K']} tone="subtle" />
              </div>
              <div aria-hidden="true" className={cn(tooltipContentClassName, 'inline-flex')}>
                <span>Plant visit · 27 Oct</span>
              </div>
            </div>
          </Specimen>
          <Specimen title="Popover and dialog" caption="Dialogs only for confirmations and imports">
            <div className="flex flex-wrap items-center gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary">Open popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="text-sm font-medium text-text">Introduced by</p>
                  <p className="mt-1 text-sm text-secondary">
                    Krithik Rao, Dhruv's Connectors. Brought Rohan to UA in October.
                  </p>
                </PopoverContent>
              </Popover>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">Open dialog</Button>
                </DialogTrigger>
                <DialogContent
                  title="Reset sample data"
                  description="Every sheet goes back to the original sample rows. Changes made since cannot be recovered."
                >
                  <DialogFooter className="mt-0">
                    <DialogClose asChild>
                      <Button variant="secondary">Cancel</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button variant="danger">Reset</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Specimen>
        </div>
      </div>
    </Section>
  )
}

/* Feedback -------------------------------------------------------------------------------- */

export function FeedbackSection() {
  return (
    <Section
      id="feedback"
      title="Feedback"
      caption="Toasts carry Undo for 8 seconds and are announced politely. Skeletons hold the layout while data loads."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen title="Toast" caption="Bottom centre, with an Undo action">
          <div className="flex flex-col items-start gap-5">
            <Button
              variant="secondary"
              onClick={() =>
                undoToast('Moved to Plant visit', () => toast('Back at First call'), {
                  description: 'Rohan Mehta · Customers',
                })
              }
            >
              Show an undo toast
            </Button>
            <div
              aria-hidden="true"
              className="flex w-[356px] max-w-full items-center gap-3 rounded-card border border-border bg-surface-raised py-2 pr-2 pl-4 shadow-popover"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
                <span className="text-base text-text">Warmth set to Warm</span>
                <span className="text-sm text-secondary">Priya Raghavan · Investors</span>
              </div>
              <span className="inline-flex h-7 items-center rounded-control px-2.5 text-sm font-semibold text-link">
                Undo
              </span>
            </div>
          </div>
        </Specimen>
        <Specimen title="Skeleton" caption="Grid rows while loading">
          <div className="flex flex-col gap-4">
            {[0.8, 0.6, 0.7].map((width) => (
              <div key={width} className="flex items-center gap-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-3" style={{ width: `${width * 40}%` }} />
                <Skeleton className="ml-auto h-5 w-16 rounded-chip" />
                <Skeleton className="h-2 w-20" />
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen title="Pills" caption="Neutral values and counts, with chip corners">
          <div className="flex flex-wrap items-center gap-2">
            <Pill>Decision maker</Pill>
            <Pill>Foundries and forging shops</Pill>
            <Pill tone="outline">Advisory equity</Pill>
            <Pill tone="brand">Pilot candidate</Pill>
            <Pill size="md">₹25 L</Pill>
            <Pill className="tabular-nums">+3</Pill>
          </div>
        </Specimen>
        <Specimen title="Separator" caption="1px hairlines, horizontal and vertical">
          <div className="flex flex-col gap-4">
            <div className="flex h-5 items-center gap-3 text-sm text-secondary">
              <span>Dawar</span>
              <Separator orientation="vertical" />
              <span>Customers</span>
              <Separator orientation="vertical" />
              <span>12 rows</span>
            </div>
            <Separator />
            <p className="text-sm text-muted">
              Sections inside the expanded row are split this way.
            </p>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}
