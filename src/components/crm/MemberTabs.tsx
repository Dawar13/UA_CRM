import { Tabs } from 'radix-ui'
import { NavTabLabel, navTabTriggerClassName } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'

export interface MemberTabsProps {
  members: readonly { id: string; name: string }[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

/**
 * Member tabs in the 52px header. Navigation tabs: arrow keys move and activate, the selected
 * tab has a 2px underline in the text colour on the header's bottom edge.
 */
export function MemberTabs({ members, value, onValueChange, className }: MemberTabsProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange}
      activationMode="automatic"
      className={cn('flex h-full items-stretch', className)}
    >
      <Tabs.List aria-label="Team members" className="flex h-full items-stretch gap-0.5">
        {members.map((member) => (
          <Tabs.Trigger
            key={member.id}
            value={member.id}
            // Navigation tabs without panels: no aria-controls to a missing element.
            aria-controls={undefined}
            data-testid={`member-tab-${member.id}`}
            className={cn(navTabTriggerClassName, 'h-full text-base')}
          >
            <NavTabLabel>{member.name}</NavTabLabel>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  )
}
