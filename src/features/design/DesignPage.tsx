import { useEffect } from 'react'
import { BrandMark } from '@/components/crm/BrandLockup'
import { ThemeSegmented } from '@/components/crm/ThemeToggle'
import { ColoursSection } from './ColoursSection'
import {
  AvatarsSection,
  DatesSection,
  EmptySection,
  StageDotsSection,
  StageTrackerSection,
  TabsSection,
  TagsSection,
  WarmthSection,
} from './CrmSections'
import {
  BrandSection,
  ButtonsSection,
  FeedbackSection,
  InputsSection,
  MenusSection,
  TypeSection,
} from './PrimitivesSections'

const index = [
  ['colours', 'Colour'],
  ['type', 'Type'],
  ['brand', 'Brand'],
  ['buttons', 'Buttons'],
  ['inputs', 'Inputs'],
  ['menus', 'Overlays'],
  ['feedback', 'Feedback'],
  ['warmth', 'Warmth'],
  ['tags', 'Tags'],
  ['stage-dots', 'Stage dots'],
  ['stage-tracker', 'Stage tracker'],
  ['dates', 'Dates'],
  ['avatars', 'Avatars'],
  ['tabs', 'Tabs'],
  ['empty', 'Empty states'],
] as const

/**
 * The /design showcase: every token, primitive and CRM component in every state, on fixed sample
 * data around 5 Nov 2026 so visual snapshots are stable. Development and test builds only.
 */
export function DesignPage() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Design system · UA · Internal CRM'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text">
      <div aria-hidden="true" className="h-[3px]" style={{ background: 'var(--soft-gradient)' }} />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-8 py-6">
          <div className="flex items-center gap-3">
            <BrandMark size={36} />
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold text-text">Design system</h1>
              <p className="text-sm text-secondary">
                Tokens, primitives and CRM components for the UA Internal CRM
              </p>
            </div>
          </div>
          <ThemeSegmented />
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-[1120px] px-8 pb-3">
          <ul className="flex flex-wrap gap-x-1 gap-y-1">
            {index.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="inline-flex h-7 items-center rounded-control px-2 text-sm text-secondary transition-colors duration-(--duration-fast) hover:bg-surface-hover hover:text-text"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-[1120px] px-8 pb-24">
        <ColoursSection />
        <TypeSection />
        <BrandSection />
        <ButtonsSection />
        <InputsSection />
        <MenusSection />
        <FeedbackSection />
        <WarmthSection />
        <TagsSection />
        <StageDotsSection />
        <StageTrackerSection />
        <DatesSection />
        <AvatarsSection />
        <TabsSection />
        <EmptySection />
      </main>
    </div>
  )
}
