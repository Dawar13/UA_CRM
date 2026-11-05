import { Tabs } from 'radix-ui'
import { initials } from '@/domain/identity'
import { cn } from '@/lib/cn'

export interface MemberTabsProps {
  members: readonly { id: string; name: string }[]
  value: string
  onValueChange: (id: string) => void
  className?: string
}

/**
 * The member switch in the header: a segmented control. Each member is a tab; arrow keys move
 * and activate (automatic activation). The selected member is a raised white pill with their
 * initials on the sky gradient; the others are ghost buttons with a neutral avatar.
 */
export function MemberTabs({ members, value, onValueChange, className }: MemberTabsProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={onValueChange}
      activationMode="automatic"
      className={cn('flex items-center', className)}
    >
      <Tabs.List
        aria-label="Team members"
        className="flex items-center gap-0.5 rounded-[8px] bg-surface-hover p-[3px]"
      >
        {members.map((member) => (
          <Tabs.Trigger
            key={member.id}
            value={member.id}
            // Navigation tabs without panels: no aria-controls to a missing element.
            aria-controls={undefined}
            data-testid={`member-tab-${member.id}`}
            className={cn(
              'group/member flex h-7 shrink-0 cursor-default select-none items-center gap-2 rounded-control pr-3 pl-[5px]',
              'text-sm font-medium whitespace-nowrap text-secondary',
              'transition-[background-color,color,box-shadow] duration-(--duration-fast) ease-out',
              'hover:bg-bg/60 hover:text-text',
              'data-[state=active]:bg-bg data-[state=active]:font-semibold data-[state=active]:text-text',
              'data-[state=active]:shadow-[0_1px_2px_var(--shadow),0_0_0_1px_var(--border)]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-grid size-[19px] shrink-0 place-items-center rounded-chip text-[9px] leading-none font-bold',
                'bg-[image:linear-gradient(180deg,var(--avatar-top),var(--avatar-bottom))] text-avatar-fg',
                'group-data-[state=active]/member:bg-[image:var(--brand-mark)] group-data-[state=active]/member:text-white',
              )}
            >
              {initials(member.name)}
            </span>
            {member.name}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs.Root>
  )
}
